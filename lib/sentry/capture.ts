import type * as SentryTypes from '@sentry/nextjs'
import { buildSafeTags } from './shared'

type CaptureOptions = {
  contexts?: Record<string, Record<string, unknown>>
  extras?: Record<string, unknown>
  fingerprint?: string[]
  level?: SentryTypes.SeverityLevel
  tags?: Record<string, string | number | boolean | null | undefined>
}

// SDK は静的 import しない（ブラウザ側では gzip 約150KB の SDK を初期バンドルから外すため）。
// サーバー側は instrumentation.ts で初期化済みのモジュールをそのまま使い、
// ブラウザ側は lib/sentry/client.ts の遅延ローダー（初回呼び出しで初期化）を経由する。
async function getSentry(): Promise<typeof SentryTypes> {
  if (typeof window === 'undefined') {
    return import('@sentry/nextjs')
  }
  const { loadSentryClient } = await import('./client')
  return loadSentryClient()
}

export function captureWebException(error: unknown, options: CaptureOptions = {}): Promise<void> {
  const normalizedError = error instanceof Error ? error : new Error(String(error))

  return getSentry()
    .then((Sentry) => {
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
    })
    .catch(() => {
      // 監視は任意機能: SDK の読み込み失敗でアプリ側の処理を止めない
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

export function captureBrowserRateLimit(options: BrowserRateLimitOptions): void {
  const key = `${options.surface}:${options.endpointFamily}`
  const now = Date.now()
  const lastCapturedAt = lastRateLimitCaptureAt.get(key) || 0

  if (now - lastCapturedAt < RATE_LIMIT_CAPTURE_WINDOW_MS) {
    return
  }

  lastRateLimitCaptureAt.set(key, now)

  void captureWebException(new Error(`${options.surface} rate limited (429)`), {
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
