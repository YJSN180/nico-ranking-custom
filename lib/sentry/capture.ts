import * as Sentry from '@sentry/nextjs'
import { buildSafeTags } from './shared'

type CaptureOptions = {
  contexts?: Record<string, Record<string, unknown>>
  extras?: Record<string, unknown>
  fingerprint?: string[]
  level?: Sentry.SeverityLevel
  tags?: Record<string, string | number | boolean | null | undefined>
}

export function captureWebException(error: unknown, options: CaptureOptions = {}) {
  const normalizedError = error instanceof Error ? error : new Error(String(error))

  Sentry.withScope((scope) => {
    for (const [key, value] of Object.entries(buildSafeTags(options.tags || {}))) {
      scope.setTag(key, value)
    }

    for (const [key, value] of Object.entries(options.contexts || {})) {
      scope.setContext(key, value)
    }

    for (const [key, value] of Object.entries(options.extras || {})) {
      scope.setExtra(key, value)
    }

    if (options.fingerprint) {
      scope.setFingerprint(options.fingerprint)
    }

    if (options.level) {
      scope.setLevel(options.level)
    }

    Sentry.captureException(normalizedError)
  })
}

const RATE_LIMIT_CAPTURE_WINDOW_MS = 60_000
const lastRateLimitCaptureAt = new Map<string, number>()

type BrowserRateLimitOptions = {
  endpointFamily: string
  fingerprint: string[]
  retryAfterSeconds?: number
  surface: string
  tags?: Record<string, string | number | boolean | null | undefined>
}

export function captureBrowserRateLimit(options: BrowserRateLimitOptions) {
  const key = `${options.surface}:${options.endpointFamily}`
  const now = Date.now()
  const lastCapturedAt = lastRateLimitCaptureAt.get(key) || 0

  if (now - lastCapturedAt < RATE_LIMIT_CAPTURE_WINDOW_MS) {
    return
  }

  lastRateLimitCaptureAt.set(key, now)

  captureWebException(new Error(`${options.surface} rate limited (429)`), {
    level: 'warning',
    fingerprint: options.fingerprint,
    tags: {
      runtime: 'browser',
      surface: options.surface,
      endpoint_family: options.endpointFamily,
      status_code: 429,
      ...(options.tags || {}),
    },
    extras: {
      retry_after_seconds: options.retryAfterSeconds,
    },
  })
}
