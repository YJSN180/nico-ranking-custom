export class HttpFailure extends Error {
  constructor(
    public status: number,
    public retryAfterMs = 0,
  ) {
    super(`Upstream HTTP ${status}`)
  }
}

export async function retry<T>(
  operation: () => Promise<T>,
  options: {
    attempts?: number
    budgetMs?: number
    sleep?: (ms: number) => Promise<void>
  } = {},
): Promise<T> {
  const started = Date.now()
  const sleep =
    options.sleep ?? ((ms) => new Promise((resolve) => setTimeout(resolve, ms)))
  const attempts = options.attempts ?? 5
  for (let i = 0; ; i++) {
    try {
      return await operation()
    } catch (error: any) {
      const status = error.status ?? error.$metadata?.httpStatusCode
      const transient =
        [408, 429, 500, 502, 503, 504].includes(status) ||
        (!status &&
          (error instanceof TypeError ||
            ['TimeoutError', 'AbortError'].includes(error.name) ||
            ['ECONNRESET', 'ETIMEDOUT', 'EAI_AGAIN'].includes(error.code)))
      const delay = Math.max(
        error.retryAfterMs || 0,
        Math.min(30_000, 2000 * 2 ** i) + Math.random() * 1000,
      )
      if (
        !transient ||
        i + 1 >= attempts ||
        Date.now() - started + delay > (options.budgetMs ?? 180_000)
      )
        throw error
      await sleep(delay)
    }
  }
}

export async function fetchChecked(url: string, init: RequestInit = {}) {
  return retry(async () => {
    const response = await fetch(url, {
      ...init,
      signal: AbortSignal.timeout(20_000),
    })
    if (!response.ok) {
      const after = response.headers.get('retry-after')
      const delay = after
        ? Number.isFinite(Number(after))
          ? Number(after) * 1000
          : Date.parse(after) - Date.now()
        : 0
      await response.body?.cancel()
      throw new HttpFailure(response.status, Math.max(0, delay || 0))
    }
    return response
  })
}

export async function mapLimit<T>(
  items: T[],
  limit: number,
  task: (item: T) => Promise<void>,
) {
  let next = 0
  let failure: unknown
  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, async () => {
      while (!failure && next < items.length) {
        const item = items[next++]
        try {
          await task(item)
        } catch (error) {
          failure = error
        }
      }
    }),
  )
  if (failure) throw failure
}
