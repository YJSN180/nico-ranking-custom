'use client'
// ブラウザ側 Sentry の遅延ローダー
// @sentry/nextjs のクライアント SDK は gzip 後 約150KB（初期 JS の約4割）あり、同期 import すると
// 初期描画（LCP）と帯域・メインスレッドを競合する。そこで SDK は動的 import にし、
// window load 後のアイドル時、または最初の captureWebException 時のどちらか早い方で
// 1 回だけ初期化する。初期化までに起きた未捕捉エラー / unhandledrejection はここで一時バッファし、
// 初期化した時点で送る（instrumentation-client.ts が最初にバッファを開始する）。
import type * as SentryModule from '@sentry/nextjs'
import {
  getSentryEnvironment,
  isProductionSentryEnvironment,
  isSentryEnabled,
  normalizeTransactionName,
  scrubBreadcrumb,
  scrubDynamicSamplingContext,
  scrubEvent,
  scrubSpan,
} from '@/lib/sentry/shared'

export type SentryClientModule = typeof SentryModule

const EARLY_ERROR_BUFFER_MAX = 10

let loader: Promise<SentryClientModule> | null = null
const earlyErrors: unknown[] = []
let bufferingEarlyErrors = false

function bufferEarlyError(error: unknown): void {
  if (earlyErrors.length >= EARLY_ERROR_BUFFER_MAX) return
  earlyErrors.push(error)
}

function onEarlyError(event: ErrorEvent): void {
  bufferEarlyError(event.error ?? event.message)
}

function onEarlyRejection(event: PromiseRejectionEvent): void {
  bufferEarlyError(event.reason)
}

/**
 * SDK の初期化までに起きた未捕捉エラー / unhandledrejection を溜め始める（最大 10 件）。
 * 外すのは初期化した時点（loadSentryClient）。SDK の取得中に外すと、その間のエラーを取りこぼす
 */
export function startBufferingEarlyErrors(): void {
  if (bufferingEarlyErrors || typeof window === 'undefined') return
  bufferingEarlyErrors = true
  window.addEventListener('error', onEarlyError)
  window.addEventListener('unhandledrejection', onEarlyRejection)
}

// 初期化の直後に同期で呼ぶ。SDK のグローバルハンドラは init で入るので、同じ処理の中でバッファを
// 外せば、間に空白（取りこぼし）も重なり（二重送信）もできない
function flushEarlyErrors(Sentry: SentryClientModule): void {
  if (bufferingEarlyErrors) {
    window.removeEventListener('error', onEarlyError)
    window.removeEventListener('unhandledrejection', onEarlyRejection)
    bufferingEarlyErrors = false
  }
  for (const error of earlyErrors.splice(0)) {
    Sentry.captureException(error instanceof Error ? error : new Error(String(error)))
  }
}

function initClient(Sentry: SentryClientModule): void {
  // 二重初期化を防ぐ（HMR やテストで複数回呼ばれても安全）
  if (Sentry.getClient()) return
  const environment = getSentryEnvironment()
  const dsn = process.env.NEXT_PUBLIC_SENTRY_DSN
  Sentry.init({
    dsn,
    enabled: isSentryEnabled(dsn, environment),
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
    beforeSendSpan: scrubSpan,
    beforeBreadcrumb: (breadcrumb) => scrubBreadcrumb(breadcrumb),
  })
  // trace ヘッダー（baggage）の transaction 名は beforeSend を通らないので、ここで伏せる
  Sentry.getClient()?.on('createDsc', scrubDynamicSamplingContext)
}

/**
 * SDK を読み込み、未初期化なら初期化して返す（多重呼び出しは同じ Promise を共有）。
 * 初期化した時点で、それまでに溜めたエラーを送る。
 * 読み込みに失敗したら（通信断などのチャンク取得失敗）次の呼び出しで読み直す。溜めたエラーは残す
 */
export function loadSentryClient(): Promise<SentryClientModule> {
  if (!loader) {
    loader = import('@sentry/nextjs').then(
      (Sentry) => {
        initClient(Sentry)
        flushEarlyErrors(Sentry)
        return Sentry
      },
      (error: unknown) => {
        loader = null
        throw error
      }
    )
  }
  return loader
}

/** 既に読み込み開始済みか（App Router の遷移を SDK に渡すかの判定に使う） */
export function isSentryClientLoading(): boolean {
  return loader !== null
}

/** テスト用: ローダー状態をリセット */
export function resetSentryClientLoaderForTests(): void {
  loader = null
}
