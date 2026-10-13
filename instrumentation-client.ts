'use client'
// ブラウザ側 Sentry のエントリ。SDK 本体（gzip 約150KB）は静的 import せず、
// lib/sentry/client.ts の遅延ローダー経由で window load 後のアイドル時に初期化する。
// 初期化までに発生した未捕捉エラー / unhandledrejection は、ここで最初に開始するバッファに溜め、
// 初期化した時点で送る（captureWebException が先に SDK を読み込んだ場合も同じ）。
import { isSentryClientLoading, loadSentryClient, startBufferingEarlyErrors } from '@/lib/sentry/client'

let started = false

function startSentry(): void {
  if (started) return
  started = true
  // 読み込みに失敗してもバッファは残る。次の captureWebException や遷移の通知で読み直す
  loadSentryClient().catch(() => {})
}

function scheduleStart(): void {
  if (typeof window.requestIdleCallback === 'function') {
    window.requestIdleCallback(startSentry, { timeout: 5000 })
  } else {
    window.setTimeout(startSentry, 1000)
  }
}

if (typeof window !== 'undefined') {
  // アプリのコード（ハイドレーション）より前に実行される。ここからバッファを開始する
  startBufferingEarlyErrors()
  if (document.readyState === 'complete') {
    scheduleStart()
  } else {
    window.addEventListener('load', scheduleStart, { once: true })
  }
}

// Next.js の App Router 遷移フック。SDK の読み込みが始まっていれば（アイドル時の開始、または
// captureWebException が先に読み込んだ場合）読み込み後に転送する。まだ何も読み込んでいない
// うちの遷移のために SDK を読み込むことはしない（初期表示の帯域を取らない。遷移中のエラーは
// バッファが拾う）
export function onRouterTransitionStart(href: string, navigationType: string): void {
  if (!isSentryClientLoading()) return
  loadSentryClient()
    .then((Sentry) => Sentry.captureRouterTransitionStart(href, navigationType))
    .catch(() => {})
}
