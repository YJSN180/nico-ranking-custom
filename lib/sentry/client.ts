'use client'
// ブラウザ側 Sentry の遅延ローダー
// @sentry/nextjs のクライアント SDK は gzip 後 約150KB（初期 JS の約4割）あり、同期 import すると
// 初期描画（LCP）と帯域・メインスレッドを競合する。そこで SDK は動的 import にし、
// window load 後のアイドル時、または最初の captureWebException 時のどちらか早い方で
// 1 回だけ初期化する。初期化前に起きたエラーは instrumentation-client.ts が一時バッファし、
// 初期化後に送信する。
import type * as SentryModule from '@sentry/nextjs'
import {
  getSentryEnvironment,
  isProductionSentryEnvironment,
  normalizeTransactionName,
  scrubBreadcrumb,
  scrubEvent,
} from '@/lib/sentry/shared'

export type SentryClientModule = typeof SentryModule

let loader: Promise<SentryClientModule> | null = null

function initClient(Sentry: SentryClientModule): void {
  // 二重初期化を防ぐ（HMR やテストで複数回呼ばれても安全）
  if (Sentry.getClient()) return
  const environment = getSentryEnvironment()
  const dsn = process.env.NEXT_PUBLIC_SENTRY_DSN
  Sentry.init({
    dsn,
    enabled: Boolean(dsn),
    environment,
    sendDefaultPii: false,
    replaysOnErrorSampleRate: 0,
    replaysSessionSampleRate: 0,
    integrations: [
      Sentry.browserTracingIntegration({
        beforeStartSpan: (options) => ({
          ...options,
          name: normalizeTransactionName(options.name) || options.name,
        }),
      }),
    ],
    tracePropagationTargets: [
      /^\/api\//,
      /^https:\/\/nico-rank\.com\/api\//,
      /^https?:\/\/localhost:3000\/api\//,
    ],
    tracesSampler: () => (isProductionSentryEnvironment(environment) ? 0.05 : 1),
    beforeSend: (event) => scrubEvent(event),
    beforeSendTransaction: (event) => scrubEvent(event),
    beforeBreadcrumb: (breadcrumb) => scrubBreadcrumb(breadcrumb),
  })
}

/** SDK を読み込み、未初期化なら初期化して返す（多重呼び出しは同じ Promise を共有） */
export function loadSentryClient(): Promise<SentryClientModule> {
  if (!loader) {
    loader = import('@sentry/nextjs').then((Sentry) => {
      initClient(Sentry)
      return Sentry
    })
  }
  return loader
}

/** 既に読み込み開始済みか（初期化前のエラーをバッファするかの判定に使う） */
export function isSentryClientLoading(): boolean {
  return loader !== null
}

/** テスト用: ローダー状態をリセット */
export function resetSentryClientLoaderForTests(): void {
  loader = null
}
