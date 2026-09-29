/**
 * Waits after publication until video stats and the production gateway serve the new
 * generation. The stats Worker refreshes every 5 minutes (about 45 s per run) and serializes
 * runs with an R2 lease, so a run that started before publication or a trigger that met the
 * lease can delay the new generation by one or two cycles.
 */

export const STATS_WAIT_MS = 12 * 60_000
const STATS_POLL_INTERVAL_MS = 10_000
// A busy answer means another update holds the lease; ask again once it has likely finished.
const BUSY_TRIGGER_RETRY_MS = 60_000
// Without a usable answer, ask again only when the stats have not moved for a while.
const IDLE_TRIGGER_RETRY_MS = 3 * 60_000
const MAX_STATS_TRIGGERS = 8
// One update takes about 45 s; disconnecting earlier can cancel it while it holds the lease.
const STATS_TRIGGER_TIMEOUT_MS = 120_000

export interface VideoStats {
  metadata?: { updatedAt: string; totalVideos: number }
}

export interface StatsSource {
  generation?: string
  updatedAt?: string
}

export interface GatewayRanking {
  generation?: string
  updatedAt?: string
  count?: number
}

export type TriggerOutcome = 'updated' | 'busy' | 'failed' | 'lost'

export interface TriggerResult {
  outcome: TriggerOutcome
  detail?: string
}

export interface PublishedStatsExpectation {
  generation: string
  collectedAt: string
  allCount: number
  /** False before generations are enabled: no stats source sidecar, gateway reports 'legacy'. */
  generationMode: boolean
}

function property(value: unknown, key: string): unknown {
  return typeof value === 'object' && value !== null ? Reflect.get(value, key) : undefined
}

/**
 * The stats Worker answers 200 {success: true} after an update, 200 {success: false,
 * skipped: 'already-running'} while another update holds its lease, and 500 {error} on failure.
 */
export function classifyTriggerResponse(status: number, body: unknown): TriggerResult {
  if (status === 200 && property(body, 'success') === true) return { outcome: 'updated' }
  if (property(body, 'skipped') === 'already-running') return { outcome: 'busy' }
  const error = property(body, 'error')
  return {
    outcome: 'failed',
    detail: `http_${status}${typeof error === 'string' ? `: ${error.slice(0, 200)}` : ''}`,
  }
}

function errorName(error: unknown): string {
  const name = property(error, 'name')
  return typeof name === 'string' ? name : 'unknown'
}

export async function sendStatsTrigger(workerUrl: string, workerKey: string): Promise<TriggerResult> {
  let response: Response
  try {
    response = await fetch(`${workerUrl}/trigger`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${workerKey}` },
      signal: AbortSignal.timeout(STATS_TRIGGER_TIMEOUT_MS),
    })
  } catch (error: unknown) {
    // The update may still finish, or keep its lease until it expires; the poll decides.
    return { outcome: 'lost', detail: errorName(error) }
  }
  if (response.status === 401 || response.status === 403)
    throw new Error('Stats trigger authentication failed')
  let body: unknown = null
  try {
    body = await response.json()
  } catch (error: unknown) {
    const name = errorName(error)
    if (name === 'TimeoutError' || name === 'AbortError') return { outcome: 'lost', detail: name }
  }
  return classifyTriggerResponse(response.status, body)
}

export async function waitForPublishedStats(options: {
  expected: PublishedStatsExpectation
  before: VideoStats | null
  readStats: () => Promise<VideoStats>
  readSource: () => Promise<StatsSource | null>
  readGatewayRanking: () => Promise<GatewayRanking>
  trigger: () => Promise<TriggerResult>
  log?: (message: string) => void
}): Promise<{ stats: VideoStats; ranking: GatewayRanking }> {
  const { expected, before } = options
  const log = options.log ?? ((message: string): void => console.log(message))
  const startedAt = Date.now()
  const beforeUpdatedAt = before?.metadata?.updatedAt
  let lastSeenUpdatedAt = beforeUpdatedAt
  let lastStatsChangeAt = startedAt
  let triggers = 0
  let lastTrigger: { at: number; outcome: TriggerOutcome } | null = null

  const shouldTrigger = (now: number): boolean => {
    // A trigger blocks until its update ends, so do not start one that could outlast the wait.
    if (triggers >= MAX_STATS_TRIGGERS || now - startedAt + STATS_TRIGGER_TIMEOUT_MS > STATS_WAIT_MS) return false
    if (!lastTrigger) return true
    if (lastTrigger.outcome === 'updated') return false
    if (lastTrigger.outcome === 'busy') return now - lastTrigger.at >= BUSY_TRIGGER_RETRY_MS
    return now - Math.max(lastTrigger.at, lastStatsChangeAt) >= IDLE_TRIGGER_RETRY_MS
  }

  for (;;) {
    const stats = await options.readStats()
    const updatedAt = stats.metadata?.updatedAt
    if (updatedAt !== lastSeenUpdatedAt) {
      lastSeenUpdatedAt = updatedAt
      lastStatsChangeAt = Date.now()
    }
    const source = expected.generationMode ? await options.readSource() : null
    const updatedMs = Date.parse(updatedAt ?? '')
    const fresh =
      updatedAt !== beforeUpdatedAt &&
      updatedMs > (Date.parse(beforeUpdatedAt ?? '') || 0) &&
      Date.now() - updatedMs < 15 * 60_000
    const matches =
      !expected.generationMode ||
      (source?.generation === expected.generation && source?.updatedAt === updatedAt)

    if (fresh && matches) {
      const totalVideos = stats.metadata?.totalVideos ?? 0
      if (!(totalVideos > 0) || totalVideos < (before?.metadata?.totalVideos || 0) * 0.5)
        throw new Error('Stats count drift')
      const ranking = await options.readGatewayRanking()
      if (
        ranking.updatedAt === expected.collectedAt &&
        ranking.count === expected.allCount &&
        ranking.generation === (expected.generationMode ? expected.generation : 'legacy')
      )
        return { stats, ranking }
    } else if (shouldTrigger(Date.now())) {
      triggers += 1
      const result = await options.trigger()
      lastTrigger = { at: Date.now(), outcome: result.outcome }
      log(
        `[Verify] Stats trigger ${triggers}: ${result.outcome}${result.detail ? ` (${result.detail})` : ''} ` +
        `after ${Math.round((Date.now() - startedAt) / 1000)}s`,
      )
    }

    if (Date.now() - startedAt >= STATS_WAIT_MS) break
    await new Promise((resolve) => setTimeout(resolve, STATS_POLL_INTERVAL_MS))
  }
  throw new Error(
    `Published generation did not reach video stats and production gateway within ${STATS_WAIT_MS / 60_000} minutes`,
  )
}
