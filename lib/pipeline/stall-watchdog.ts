/**
 * Fails a collection group that stops making progress, with a summary of what the
 * process is still waiting on, instead of idling silently until the 65 minute deadline.
 */

export const GROUP_STALL_TIMEOUT_MS = 10 * 60_000
const GROUP_STALL_CHECK_INTERVAL_MS = 30_000

export interface StallReport {
  idleMs: number
  lastProgress: string
  activeResources: Record<string, number>
}

export interface StallWatchdog {
  stop: () => void
}

export interface GroupStallWatchdogOptions {
  stallMs?: number
  checkIntervalMs?: number
  exit?: (code: number) => void
  getActiveResources?: () => string[]
}

type ProgressListener = (label: string) => void

let progressListener: ProgressListener | null = null

/** Marks progress for the active watchdog. Without a watchdog this is a no-op. */
export function reportPipelineProgress(label: string): void {
  progressListener?.(label)
}

export function summarizeActiveResources(resources: readonly string[]): Record<string, number> {
  const counts = new Map<string, number>()
  for (const resource of resources) counts.set(resource, (counts.get(resource) ?? 0) + 1)
  return Object.fromEntries([...counts.entries()].sort((a, b) => b[1] - a[1]))
}

function currentActiveResources(): string[] {
  return typeof process.getActiveResourcesInfo === 'function' ? process.getActiveResourcesInfo() : []
}

function startStallWatchdog(options: {
  stallMs: number
  checkIntervalMs: number
  getActiveResources: () => string[]
  onStall: (report: StallReport) => void
}): StallWatchdog {
  let lastProgressAt = Date.now()
  let lastProgress = 'watchdog started'
  const listener: ProgressListener = (label) => {
    lastProgressAt = Date.now()
    lastProgress = label
  }

  const timer = setInterval(() => {
    const idleMs = Date.now() - lastProgressAt
    if (idleMs < options.stallMs) return
    stop()
    options.onStall({
      idleMs,
      lastProgress,
      activeResources: summarizeActiveResources(options.getActiveResources()),
    })
  }, options.checkIntervalMs)
  // The group's own deadline keeps the process alive; the watchdog must not extend it.
  timer.unref()
  progressListener = listener

  function stop(): void {
    clearInterval(timer)
    if (progressListener === listener) progressListener = null
  }

  return { stop }
}

export function startGroupStallWatchdog(groupId: number, options: GroupStallWatchdogOptions = {}): StallWatchdog {
  const exit = options.exit ?? ((code: number): void => process.exit(code))
  return startStallWatchdog({
    stallMs: options.stallMs ?? GROUP_STALL_TIMEOUT_MS,
    checkIntervalMs: options.checkIntervalMs ?? GROUP_STALL_CHECK_INTERVAL_MS,
    getActiveResources: options.getActiveResources ?? currentActiveResources,
    onStall: (report) => {
      console.error(
        `Group ${groupId} made no progress for ${Math.round(report.idleMs / 1000)}s ` +
        `(last progress: ${report.lastProgress}); active resources: ${JSON.stringify(report.activeResources)}. ` +
        'Failing now so the job can be re-run.',
      )
      exit(1)
    },
  })
}
