import { appendFile } from 'node:fs/promises'
import { createR2Store } from './lib/r2-store'
import { fetchChecked } from '../lib/pipeline/retry'
import { CURRENT_KEY } from '../workers/utils/ranking-generation.js'
import { scheduledSlot } from '../workers/ranking-scheduler/scheduler.js'

async function main() {
  const repo = 'YJSN180/nico-ranking-custom'
  type WorkflowRun = {
    created_at: string
    workflow_id: number
    head_branch: string
    event: string
    display_title?: string
  }
  const read = async (path: string): Promise<WorkflowRun> =>
    (
      await fetchChecked(`https://api.github.com/repos/${repo}/${path}`, {
        headers: {
          Authorization: `Bearer ${process.env.GH_TOKEN}`,
          Accept: 'application/vnd.github+json',
        },
      })
    ).json() as Promise<WorkflowRun>
  const current = await read(`actions/runs/${process.env.GITHUB_RUN_ID}`)
  let slot =
    process.env.RANKING_SLOT || scheduledSlot(Date.parse(current.created_at))
  if (
    !/^\d{4}-\d\d-\d\dT\d\d:20:00\.000Z$/.test(slot) ||
    !Number.isFinite(Date.parse(slot)) ||
    Date.parse(slot) > Date.now() ||
    Date.now() - Date.parse(slot) > 120 * 60_000
  )
    throw new Error('Invalid or expired schedule slot')
  const resume = process.env.RESUME_RUN_ID || ''
  if (resume) {
    if (!/^\d+$/.test(resume)) throw new Error('Invalid resume run ID')
    const source = await read(`actions/runs/${resume}`)
    if (
      source.workflow_id !== current.workflow_id ||
      source.head_branch !== 'main' ||
      source.event === 'pull_request' ||
      Date.now() - Date.parse(source.created_at) > 120 * 60_000
    )
      throw new Error('Untrusted or stale resume source')
    slot = source.display_title?.startsWith('Ranking 20')
      ? source.display_title.slice(8)
      : scheduledSlot(Date.parse(source.created_at))
  }
  const published = await createR2Store().read(CURRENT_KEY)
  const shouldRun =
    Boolean(resume) || !published?.data.slot || published.data.slot < slot
  await appendFile(
    process.env.GITHUB_OUTPUT!,
    `slot=${slot}\nshould_run=${shouldRun}\n`,
  )
}
main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
