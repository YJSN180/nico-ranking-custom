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
