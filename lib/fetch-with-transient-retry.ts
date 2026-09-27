// 上流の一時障害だけを 1 回だけ再試行する fetch（SSR と /api/ranking/full のランキング取得で使う）。
// ランキングの上流（/api/ranking → ゲートウェイ → R2）は、R2 の get が一時的に失敗する（10001）と 500 を返す。
// ゲートウェイは 200 以外を Cache API に保存しないので、少し待った再試行は R2 に届く。
// 429（レート制限）と 4xx は再試行しても直らないので、そのまま返す。
// 期限（init.signal）は再試行を含む全体に掛かり、切れたら待たずにそのまま投げる。

const TRANSIENT_STATUSES = new Set([500, 502, 503, 504])
const DEFAULT_RETRY_DELAY_MS = 300

export interface TransientRetryOptions {
  /** 再試行までの待ち（ミリ秒） */
  retryDelayMs?: number
}

/** ms だけ待つ。signal が中断されたらすぐに戻る（続く fetch が中断として投げる） */
function wait(ms: number, signal: AbortSignal | undefined): Promise<void> {
  return new Promise((resolve) => {
    if (signal?.aborted) {
      resolve()
      return
    }
    const done = (): void => {
      clearTimeout(timer)
      signal?.removeEventListener('abort', done)
      resolve()
    }
    const timer = setTimeout(done, ms)
    signal?.addEventListener('abort', done, { once: true })
  })
}

export async function fetchWithTransientRetry(
  input: string | URL,
  init: RequestInit = {},
  options: TransientRetryOptions = {}
): Promise<Response> {
  const signal = init.signal ?? undefined
  try {
    const response = await fetch(input, init)
    if (!TRANSIENT_STATUSES.has(response.status)) return response
    // 失敗した応答の本文は使わない（接続を早く返す）
    await response.body?.cancel().catch(() => undefined)
  } catch (error) {
    // 通信エラー（fetch は TypeError で失敗する）だけを一時障害とみなす。期限切れ・中断は再試行しない
    if (signal?.aborted || !(error instanceof TypeError)) throw error
  }
  await wait(options.retryDelayMs ?? DEFAULT_RETRY_DELAY_MS, signal)
  signal?.throwIfAborted()
  return fetch(input, init)
}
