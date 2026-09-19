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
    const { workflow_runs: runs } = await github(
      `actions/workflows/${WORKFLOW}/runs?branch=main&per_page=100`,
    )
    if (!Array.isArray(runs)) throw new Error('Missing GitHub run history')
    const active = runs.find((run) => run.status !== 'completed')
    if (active) {
      if (now - Date.parse(active.created_at) > 100 * 60_000)
        throw new Error(`Ranking run stalled: ${active.id}`)
      return { state: 'running', runId: active.id, slot }
    }
    const matching = runs.filter(
      (run) => run.display_title === `Ranking ${slot}`,
    )
    if (matching.some((run) => run.conclusion === 'success'))
      return { state: 'complete', slot }
    const key = 'pipeline/dispatch-state.json'
    const saved = await env.R2_BUCKET.get(key)
    const old = saved ? await saved.json() : null
    const state = old?.slot === slot ? old : { slot, attempts: 0, sentAt: 0 }
    if (now - state.sentAt < 15 * 60_000) return { state: 'awaiting-run', slot }
    if (state.attempts >= 2)
      throw new Error(`Ranking dispatch exhausted for ${slot}`)
    await lease.assertOwned()
    // Persist before sending: lost HTTP responses must not cause a dispatch storm.
    await env.R2_BUCKET.put(
      key,
      JSON.stringify({ slot, attempts: state.attempts + 1, sentAt: now }),
    )
    const failed = matching.find(
      (run) =>
        run.conclusion === 'failure' &&
        now - Date.parse(run.created_at) < 90 * 60_000,
    )
    if (failed) {
      await github(`actions/runs/${failed.id}/rerun-failed-jobs`, 'POST')
      return { state: 'retrying', slot, runId: failed.id }
    }
    await github(`actions/workflows/${WORKFLOW}/dispatches`, 'POST', {
      ref: 'main',
      inputs: { slot },
    })
    return { state: 'dispatched', slot }
  } finally {
    await lease.release()
  }
}
