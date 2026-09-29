import { acquireLease } from '../utils/r2-lease.js'
import { currentGeneration } from '../utils/ranking-generation.js'
import { WORKFLOW } from './github.js'

export function scheduledSlot(now) {
  const date = new Date(now)
  date.setUTCMinutes(20, 0, 0)
  if (date.getTime() > now) date.setUTCHours(date.getUTCHours() - 1)
  return date.toISOString()
}

export async function dispatchRanking(env, github, now = Date.now()) {
  if (env.DISPATCH_ENABLED !== 'true') return { state: 'shadow' }
  const lease = await acquireLease(
    env.R2_BUCKET,
    'pipeline/dispatch-lease.json',
    120_000,
    now,
  )
  if (!lease) return { state: 'busy' }
  try {
    const slot = scheduledSlot(now)
    const manifest = await currentGeneration(env.R2_BUCKET)
    if (manifest?.slot && manifest.slot >= slot) {
      const auxiliaryObject = await env.R2_BUCKET.get('pipeline/auxiliary.json')
      const auxiliary = auxiliaryObject ? await auxiliaryObject.json() : null
      if (auxiliary?.generation === manifest.generation && !auxiliary.failed)
        return { state: 'published', slot }
    }
    const key = 'pipeline/dispatch-state.json'
    const saved = await env.R2_BUCKET.get(key)
    const old = saved ? await saved.json() : null
    const running = async (run) => {
      if (now - Date.parse(run.created_at) > 100 * 60_000)
        throw new Error(`Ranking run stalled: ${run.id}`)
      if (old?.runId !== run.id) {
        await lease.assertOwned()
        await env.R2_BUCKET.put(key, JSON.stringify({ ...old, runId: run.id }))
      }
      return { state: 'running', runId: run.id, slot }
    }
    // A run can temporarily disappear from the history listing. Once seen, follow its
    // exact ID across ticks and hourly slots; a failed lookup must not authorize dispatch.
    const observed = Number.isSafeInteger(old?.runId)
      ? await github(`actions/runs/${old.runId}`)
      : null
    if (observed && observed.status !== 'completed')
      return await running(observed)

    const { workflow_runs: history } = await github(
      `actions/workflows/${WORKFLOW}/runs?branch=main&per_page=100`,
    )
    if (!Array.isArray(history)) throw new Error('Missing GitHub run history')
    const runs = observed
      ? [...history.filter((run) => run.id !== observed.id), observed]
      : history
    const active = runs.find((run) => run.status !== 'completed')
    if (active) return await running(active)
    const matching = runs.filter(
      (run) => run.display_title === `Ranking ${slot}`,
    )
    if (matching.some((run) => run.conclusion === 'success'))
      return { state: 'complete', slot }
    const state = old?.slot === slot ? old : { slot, attempts: 0, sentAt: 0 }
    if (now - state.sentAt < 15 * 60_000) return { state: 'awaiting-run', slot }
    if (state.attempts >= 2)
      throw new Error(`Ranking dispatch exhausted for ${slot}`)
    const failed = matching.find(
      (run) =>
        run.conclusion === 'failure' &&
        now - Date.parse(run.created_at) < 90 * 60_000,
    )
    await lease.assertOwned()
    // Persist before sending: lost HTTP responses must not cause a dispatch storm.
    const next = {
      slot,
      attempts: state.attempts + 1,
      sentAt: now,
      runId: failed?.id,
    }
    await env.R2_BUCKET.put(key, JSON.stringify(next))
    if (failed) {
      await github(`actions/runs/${failed.id}/rerun-failed-jobs`, 'POST')
      return { state: 'retrying', slot, runId: failed.id }
    }
    const dispatched = await github(
      `actions/workflows/${WORKFLOW}/dispatches`,
      'POST',
      {
        ref: 'main',
        inputs: { slot },
      },
    )
    const runId = dispatched?.workflow_run_id
    if (!Number.isSafeInteger(runId) || runId <= 0)
      throw new Error('Missing GitHub dispatch run ID')
    await lease.assertOwned()
    await env.R2_BUCKET.put(key, JSON.stringify({ ...next, runId }))
    return { state: 'dispatched', slot, runId }
  } finally {
    await lease.release()
  }
}
