// 外部呼び出しの時間予算に使う AbortSignal の小道具。
// Next.js と Cloudflare Worker（lib/search/nico-page-search.ts 経由）の両方から使うため依存を持たない。

/** どれか 1 つが中断されたら中断されるシグナル（undefined は無視する）。理由は最初に中断されたものを引き継ぐ */
export function anySignal(signals: ReadonlyArray<AbortSignal | undefined>): AbortSignal {
  const list = signals.filter((signal): signal is AbortSignal => signal !== undefined)
  if (list.length === 1) return list[0]
  if (typeof AbortSignal.any === 'function') return AbortSignal.any(list)
  const controller = new AbortController()
  for (const signal of list) {
    if (signal.aborted) {
      controller.abort(signal.reason)
      break
    }
    signal.addEventListener('abort', () => controller.abort(signal.reason), { once: true })
  }
  return controller.signal
}

/** 1 回の呼び出しのタイムアウトと、全体の期限（任意）を合わせたシグナル */
export function withTimeout(timeoutMs: number, overall?: AbortSignal): AbortSignal {
  return anySignal([AbortSignal.timeout(timeoutMs), overall])
}
