// @vitest-environment node
import { afterEach, describe, expect, it, vi } from 'vitest'
import { shareSearchRequest } from '@/lib/search/shared-request'
import { createEnrichmentQueue } from '@/lib/search/enrichment-queue'
import { fetchTagDetailsForVideos } from '@/lib/search/realtime-tags'
import { clearOwnerInfoCache, fetchOwnerInfo } from '@/lib/search/owner-info'
const deferred = <T>() => {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((r) => {
    resolve = r
  })
  return { promise, resolve }
}
afterEach(() => vi.useRealTimers())

describe('shared upstream requests', () => {
  it('coalesces concurrent callers and isolates one caller cancellation', async () => {
    const response = deferred<string>()
    const a = new AbortController(),
      b = new AbortController()
    const fetchImpl = vi.fn() as unknown as typeof fetch
    let upstream!: AbortSignal
    const load = vi.fn((signal: AbortSignal) => {
      upstream = signal
      return response.promise
    })
    const first = shareSearchRequest(fetchImpl, 'url', 1000, a.signal, load)
    const second = shareSearchRequest(fetchImpl, 'url', 1000, b.signal, load)
    await Promise.resolve()
    a.abort()
    await expect(first).rejects.toMatchObject({ name: 'AbortError' })
    expect(upstream.aborted).toBe(false)
    response.resolve('ok')
    await expect(second).resolves.toBe('ok')
    expect(load).toHaveBeenCalledTimes(1)
  })
  it('cancels upstream after the last waiter leaves and admits a new retry', async () => {
    const fetchImpl = vi.fn() as unknown as typeof fetch
    const abort = new AbortController()
    let upstream!: AbortSignal
    const pending = shareSearchRequest(
      fetchImpl,
      'url',
      1000,
      abort.signal,
      (signal) => {
        upstream = signal
        return new Promise(() => {})
      },
    )
    await Promise.resolve()
    abort.abort()
    await expect(pending).rejects.toMatchObject({ name: 'AbortError' })
    expect(upstream.aborted).toBe(true)
    await expect(
      shareSearchRequest(
        fetchImpl,
        'url',
        1000,
        undefined,
        async () => 'retry',
      ),
    ).resolves.toBe('retry')
  })
  it('does not retain failures and bounds even a loader ignoring abort', async () => {
    vi.useFakeTimers()
    const fetchImpl = vi.fn() as unknown as typeof fetch
    const pending = shareSearchRequest(
      fetchImpl,
      'url',
      10,
      undefined,
      () => new Promise(() => {}),
    )
    const assertion = expect(pending).rejects.toMatchObject({
      name: 'TimeoutError',
    })
    await vi.advanceTimersByTimeAsync(10)
    await assertion
    await expect(
      shareSearchRequest(fetchImpl, 'url', 10, undefined, async () => {
        throw new Error('failed')
      }),
    ).rejects.toThrow('failed')
    await expect(
      shareSearchRequest(fetchImpl, 'url', 10, undefined, async () => 'ok'),
    ).resolves.toBe('ok')
  })
  it('caps simultaneous keys without starting excess upstream work', async () => {
    const fetchImpl = vi.fn() as unknown as typeof fetch
    const abort = new AbortController()
    const pending = Array.from({ length: 256 }, (_, i) =>
      shareSearchRequest(
        fetchImpl,
        String(i),
        1000,
        abort.signal,
        () => new Promise(() => {}),
      ),
    )
    const settled = Promise.allSettled(pending)
    const load = vi.fn(async () => 'bad')
    await expect(
      shareSearchRequest(fetchImpl, 'overflow', 1000, undefined, load),
    ).rejects.toThrow('busy')
    expect(load).not.toHaveBeenCalled()
    abort.abort()
    await settled
  })
})

it('shares tag requests, caches metadata for 60 seconds, and retries expired metadata', async () => {
  vi.useFakeTimers()
  const fetchImpl = vi.fn(async () =>
    Response.json({
      data: {
        tag: { items: [{ name: 'x', isLocked: true }] },
        owner: { id: 1 },
      },
    }),
  )
  const get = () => fetchTagDetailsForVideos(['sm1'], { fetchImpl })
  const [a, b] = await Promise.all([get(), get()])
  expect(a).toEqual(b)
  expect(fetchImpl).toHaveBeenCalledTimes(1)
  await get()
  expect(fetchImpl).toHaveBeenCalledTimes(1)
  await vi.advanceTimersByTimeAsync(60_001)
  await get()
  expect(fetchImpl).toHaveBeenCalledTimes(2)
})
it('shares owner misses while keeping each caller result independent', async () => {
  clearOwnerInfoCache()
  const fetchImpl = vi.fn(async () =>
    Response.json({
      data: { user: { id: 1, nickname: 'synthetic', icons: {} } },
    }),
  )
  const results = await Promise.all(
    [1, 2].map(() =>
      fetchOwnerInfo({ userIds: ['1'], channelVideoIds: [] }, { fetchImpl }),
    ),
  )
  expect(fetchImpl).toHaveBeenCalledTimes(1)
  expect(results[0]).toEqual(results[1])
})
it('runs at most two enrichment batches, proceeds after failure, and removes cancelled queued jobs', async () => {
  const queue = createEnrichmentQueue(2)
  const release = deferred<void>()
  let active = 0,
    maximum = 0
  const task = async () => {
    active++
    maximum = Math.max(maximum, active)
    await release.promise
    active--
  }
  const first = queue.run(task),
    second = queue.run(task)
  const abort = new AbortController()
  const cancelled = vi.fn(async () => {})
  const third = queue.run(cancelled, abort.signal)
  const failed = queue.run(async () => {
    throw new Error('failed batch')
  })
  const failure = expect(failed).rejects.toThrow('failed batch')
  const last = vi.fn(async () => {})
  const fourth = queue.run(last)
  await Promise.resolve()
  expect(maximum).toBe(2)
  abort.abort()
  release.resolve()
  await Promise.all([first, second, third, fourth, failure])
  expect(cancelled).not.toHaveBeenCalled()
  expect(last).toHaveBeenCalledTimes(1)
})
