'use client'
// ブラウザ側 Sentry のエントリ。SDK 本体（gzip 約150KB）は静的 import せず、
// lib/sentry/client.ts の遅延ローダー経由で window load 後のアイドル時に初期化する。
// 初期化前に発生した未捕捉エラー / unhandledrejection は小さなバッファに溜め、初期化後に送る。
import { loadSentryClient } from '@/lib/sentry/client'

const EARLY_ERROR_BUFFER_MAX = 10
const earlyErrors: unknown[] = []
let started = false

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

function startSentry(): void {
  if (started) return
  started = true
  window.removeEventListener('error', onEarlyError)
  window.removeEventListener('unhandledrejection', onEarlyRejection)
  void loadSentryClient().then((Sentry) => {
    for (const error of earlyErrors.splice(0)) {
      Sentry.captureException(error instanceof Error ? error : new Error(String(error)))
    }
  })
}

function scheduleStart(): void {
  if (typeof window.requestIdleCallback === 'function') {
    window.requestIdleCallback(startSentry, { timeout: 5000 })
  } else {
    window.setTimeout(startSentry, 1000)
  }
}

if (typeof window !== 'undefined') {
  window.addEventListener('error', onEarlyError)
  window.addEventListener('unhandledrejection', onEarlyRejection)
  if (document.readyState === 'complete') {
    scheduleStart()
  } else {
    window.addEventListener('load', scheduleStart, { once: true })
  }
}

// Next.js の App Router 遷移フック。SDK 読み込み後に転送する（読み込み前の遷移は捨てる）
export function onRouterTransitionStart(href: string, navigationType: string): void {
  if (!started) return
  void loadSentryClient().then((Sentry) => Sentry.captureRouterTransitionStart(href, navigationType))
}
