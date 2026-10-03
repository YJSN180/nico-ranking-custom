/** Per-isolate coalescing of upstream work, never of user/NG decisions. */
type Flight = {
  controller: AbortController
  promise: Promise<unknown>
  waiters: number
}
const flightsByFetch = new WeakMap<typeof fetch, Map<string, Flight>>()
const MAX_FLIGHTS = 256

export function shareSearchRequest<T>(
  fetchImpl: typeof fetch,
  key: string,
  timeoutMs: number,
  signal: AbortSignal | undefined,
  load: (signal: AbortSignal) => Promise<T>,
): Promise<T> {
  if (signal?.aborted) return Promise.reject(signal.reason)
  let flights = flightsByFetch.get(fetchImpl)
  if (!flights) {
    flights = new Map()
    flightsByFetch.set(fetchImpl, flights)
  }
  const fullKey = `${timeoutMs}:${key}`
  let flight = flights.get(fullKey)
  if (!flight) {
    if (flights.size >= MAX_FLIGHTS)
      return Promise.reject(new Error('search_upstream_busy'))
    const controller = new AbortController()
    flight = { controller, promise: Promise.resolve(), waiters: 0 }
    const entry = flight
    const entries = flights
    const timer = setTimeout(
      () =>
        controller.abort(
          new DOMException('Search upstream timed out', 'TimeoutError'),
        ),
      timeoutMs,
    )
    const aborted = new Promise<never>((_, reject) => {
      controller.signal.addEventListener(
        'abort',
        () => reject(controller.signal.reason),
        { once: true },
      )
    })
    entry.promise = Promise.race([
      Promise.resolve().then(() => {
        controller.signal.throwIfAborted()
        return load(controller.signal)
      }),
      aborted,
    ]).finally(() => {
      clearTimeout(timer)
      if (entries.get(fullKey) === entry) entries.delete(fullKey)
    })
    flights.set(fullKey, entry)
  }
  const entry = flight
  entry.waiters++
  return new Promise<T>((resolve, reject) => {
    let done = false
    const finish = (error: boolean, value: unknown) => {
      if (done) return
      done = true
      signal?.removeEventListener('abort', onAbort)
      if (--entry.waiters === 0) {
        if (flights.get(fullKey) === entry) flights.delete(fullKey)
        entry.controller.abort(
          new DOMException('No search waiters', 'AbortError'),
        )
      }
      if (error) reject(value)
      else resolve(value as T)
    }
    const onAbort = () => finish(true, signal?.reason)
    signal?.addEventListener('abort', onAbort, { once: true })
    entry.promise.then(
      (value) => finish(false, value),
      (error) => finish(true, error),
    )
  })
}
