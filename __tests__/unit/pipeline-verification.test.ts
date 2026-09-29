// @vitest-environment node
import { afterEach, describe, expect, it, vi } from 'vitest'
import { fetchVerifiedRanking } from '../../scripts/lib/verify-ranking-response'
import {
  classifyTriggerResponse,
  sendStatsTrigger,
  waitForPublishedStats,
  type TriggerResult,
  type VideoStats,
} from '../../scripts/lib/wait-for-published-stats'

const summary = {
  verifiedVia: 'production-router-service-binding',
  activeWorker: 'green',
  generation: 'legacy',
  updatedAt: '2026-09-21T00:00:00.000Z',
  count: 996,
}
afterEach(() => vi.unstubAllGlobals())
describe('publication verification client', () => {
  it('authenticates to the fixed Worker endpoint and never follows redirects', async () => {
    const fetch = vi.fn(async () => Response.json(summary))
    vi.stubGlobal('fetch', fetch)
    expect(
      await fetchVerifiedRanking('https://stats.example', 'test-key'),
    ).toEqual(summary)
    expect(fetch).toHaveBeenCalledWith(
      'https://stats.example/verify-ranking',
      expect.objectContaining({
        headers: { Authorization: 'Bearer test-key' },
        redirect: 'error',
      }),
    )
  })
  it.each([
    { count: 0 },
    { count: 1.5 },
    { count: '996' },
    { updatedAt: 'bad' },
    { verifiedVia: undefined },
    { activeWorker: 'blue-fallback' },
    { generation: '' },
  ])('rejects invalid summaries %j', async (invalid) => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => Response.json({ ...summary, ...invalid })),
    )
    await expect(
      fetchVerifiedRanking('https://stats.example', 'test-key'),
    ).rejects.toThrow('Invalid production gateway')
  })
  it('does not turn authorization failures into success or retry them', async () => {
    const fetch = vi.fn(
      async () => new Response('Unauthorized', { status: 401 }),
    )
    vi.stubGlobal('fetch', fetch)
    await expect(
      fetchVerifiedRanking('https://stats.example', 'bad'),
    ).rejects.toThrow('HTTP 401')
    expect(fetch).toHaveBeenCalledTimes(1)
  })
  it('does not send credentials over plaintext HTTP', async () => {
    const fetch = vi.fn()
    vi.stubGlobal('fetch', fetch)
    await expect(
      fetchVerifiedRanking('http://stats.example', 'test-key'),
    ).rejects.toThrow('HTTPS')
    expect(fetch).not.toHaveBeenCalled()
  })
})

describe('waiting for the published generation to reach video stats', () => {
  const MINUTE = 60_000
  const expected = {
    generation: '200-1',
    collectedAt: '2026-09-24T20:20:00.000Z',
    allCount: 996,
    generationMode: true,
  }
  const gateway = {
    verifiedVia: 'production-router-service-binding',
    activeWorker: 'green',
    generation: '200-1',
    updatedAt: expected.collectedAt,
    count: 996,
  }

  // A stats Worker whose KV value and R2 source change only when an update completes.
  function statsWorker(startedAt: number) {
    const before: VideoStats = {
      metadata: { updatedAt: new Date(startedAt - 3 * MINUTE).toISOString(), totalVideos: 10_000 },
    }
    let stats = before
    let source: { generation: string; updatedAt: string } | null = {
      generation: '199-1',
      updatedAt: before.metadata?.updatedAt ?? '',
    }
    return {
      before,
      completeUpdate(totalVideos = 10_200) {
        const updatedAt = new Date(Date.now()).toISOString()
        stats = { metadata: { updatedAt, totalVideos } }
        source = { generation: expected.generation, updatedAt }
      },
      readStats: vi.fn(async () => stats),
      readSource: vi.fn(async () => source),
      readGatewayRanking: vi.fn(async () => gateway),
    }
  }

  function track<T>(promise: Promise<T>) {
    let state = 'pending'
    promise.then(() => { state = 'resolved' }, (error: Error) => { state = `rejected:${error.message}` })
    return { promise, state: () => state }
  }

  afterEach(() => {
    vi.useRealTimers()
    vi.restoreAllMocks()
  })

  it('re-sends a trigger that met a busy stats lease and waits for the update one cycle later', async () => {
    vi.useFakeTimers()
    const startedAt = Date.now()
    const worker = statsWorker(startedAt)
    const triggerTimes: number[] = []
    // Another update holds the stats lease for the first 6 minutes; the next trigger performs the update.
    const trigger = vi.fn(async (): Promise<TriggerResult> => {
      triggerTimes.push(Date.now() - startedAt)
      if (Date.now() - startedAt < 6 * MINUTE) return { outcome: 'busy' }
      await new Promise((resolve) => setTimeout(resolve, 45_000))
      worker.completeUpdate()
      return { outcome: 'updated' }
    })

    const run = track(waitForPublishedStats({ expected, before: worker.before, ...worker, trigger, log: () => {} }))
    await vi.advanceTimersByTimeAsync(6 * MINUTE)
    expect(run.state()).toBe('pending')
    await vi.advanceTimersByTimeAsync(2 * MINUTE)

    expect(run.state()).toBe('resolved')
    await expect(run.promise).resolves.toMatchObject({ ranking: gateway, stats: { metadata: { totalVideos: 10_200 } } })
    expect(triggerTimes[0]).toBe(0)
    for (let i = 1; i < triggerTimes.length; i += 1) {
      expect(triggerTimes[i] - triggerTimes[i - 1]).toBeGreaterThanOrEqual(MINUTE)
    }
    expect(triggerTimes.at(-1)).toBeGreaterThanOrEqual(6 * MINUTE)
  })

  it('accepts an update made by the scheduled run after a lost trigger response', async () => {
    vi.useFakeTimers()
    const startedAt = Date.now()
    const worker = statsWorker(startedAt)
    const trigger = vi.fn(async (): Promise<TriggerResult> => ({ outcome: 'lost', detail: 'TimeoutError' }))
    // The next scheduled run writes the new generation 10 minutes after publication.
    setTimeout(() => worker.completeUpdate(), 10 * MINUTE)

    const run = track(waitForPublishedStats({ expected, before: worker.before, ...worker, trigger, log: () => {} }))
    await vi.advanceTimersByTimeAsync(9 * MINUTE)
    expect(run.state()).toBe('pending')
    await vi.advanceTimersByTimeAsync(2 * MINUTE)

    expect(run.state()).toBe('resolved')
    // Without a readable answer the trigger is re-sent only after the stats stayed idle for 3 minutes.
    expect(trigger).toHaveBeenCalledTimes(4)
  })

  it('gives up after about 12 minutes when the stats never reach the new generation', async () => {
    vi.useFakeTimers()
    const worker = statsWorker(Date.now())
    const trigger = vi.fn(async (): Promise<TriggerResult> => ({ outcome: 'busy' }))

    const run = track(waitForPublishedStats({ expected, before: worker.before, ...worker, trigger, log: () => {} }))
    await vi.advanceTimersByTimeAsync(11 * MINUTE)
    expect(run.state()).toBe('pending')
    await vi.advanceTimersByTimeAsync(2 * MINUTE)

    expect(run.state()).toBe(
      'rejected:Published generation did not reach video stats and production gateway within 12 minutes',
    )
    expect(trigger.mock.calls.length).toBeLessThanOrEqual(8)
    expect(worker.readGatewayRanking).not.toHaveBeenCalled()
  })

  it('does not start a trigger that could run past the 12 minute wait', async () => {
    vi.useFakeTimers()
    const startedAt = Date.now()
    const worker = statsWorker(startedAt)
    const triggerTimes: number[] = []
    const trigger = vi.fn(async (): Promise<TriggerResult> => {
      triggerTimes.push(Date.now() - startedAt)
      return { outcome: 'failed', detail: 'http_500' }
    })

    const run = track(waitForPublishedStats({ expected, before: worker.before, ...worker, trigger, log: () => {} }))
    await vi.advanceTimersByTimeAsync(13 * MINUTE)

    expect(run.state()).toMatch(/^rejected:/)
    // Failed answers are retried after 3 idle minutes, and none starts in the last 2 minutes.
    expect(triggerTimes).toEqual([0, 3 * MINUTE, 6 * MINUTE, 9 * MINUTE])
  })

  it('still fails fast when the new stats lost more than half of the videos', async () => {
    vi.useFakeTimers()
    const worker = statsWorker(Date.now())
    const trigger = vi.fn(async (): Promise<TriggerResult> => {
      worker.completeUpdate(4_000)
      return { outcome: 'updated' }
    })

    const run = track(waitForPublishedStats({ expected, before: worker.before, ...worker, trigger, log: () => {} }))
    await vi.advanceTimersByTimeAsync(30_000)

    expect(run.state()).toBe('rejected:Stats count drift')
  })

  it('verifies legacy publications without reading the stats source', async () => {
    vi.useFakeTimers()
    const worker = statsWorker(Date.now())
    worker.readGatewayRanking.mockResolvedValue({ ...gateway, generation: 'legacy' })
    const trigger = vi.fn(async (): Promise<TriggerResult> => {
      worker.completeUpdate()
      return { outcome: 'updated' }
    })

    const run = track(waitForPublishedStats({
      expected: { ...expected, generationMode: false },
      before: worker.before,
      ...worker,
      trigger,
      log: () => {},
    }))
    await vi.advanceTimersByTimeAsync(30_000)

    expect(run.state()).toBe('resolved')
    expect(worker.readSource).not.toHaveBeenCalled()
  })
})

describe('stats trigger responses', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

  it.each([
    [200, { success: true, totalVideos: 10_200, updatedAt: '2026-09-24T20:51:22.000Z' }, 'updated'],
    [200, { success: false, skipped: 'already-running' }, 'busy'],
    [500, { error: 'Failed to fetch video stats' }, 'failed'],
  ])('classifies HTTP %s %j as %s', (status, body, outcome) => {
    expect(classifyTriggerResponse(status, body).outcome).toBe(outcome)
  })

  it('posts with a timeout longer than one stats update and reads the lease answer', async () => {
    const timeout = vi.spyOn(AbortSignal, 'timeout')
    const fetch = vi.fn(async (_url: string, _init?: RequestInit) => Response.json({ success: false, skipped: 'already-running' }))
    vi.stubGlobal('fetch', fetch)

    await expect(sendStatsTrigger('https://stats.example', 'test-key')).resolves.toEqual({ outcome: 'busy' })
    expect(fetch).toHaveBeenCalledWith('https://stats.example/trigger', expect.objectContaining({
      method: 'POST',
      headers: { Authorization: 'Bearer test-key' },
    }))
    expect(timeout).toHaveBeenCalledWith(120_000)
  })

  it('treats a lost response as unknown but still rejects bad credentials', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => {
      throw new DOMException('The operation was aborted due to timeout', 'TimeoutError')
    }))
    await expect(sendStatsTrigger('https://stats.example', 'test-key')).resolves.toEqual({
      outcome: 'lost',
      detail: 'TimeoutError',
    })

    vi.stubGlobal('fetch', vi.fn(async () => new Response('Unauthorized', { status: 401 })))
    await expect(sendStatsTrigger('https://stats.example', 'bad')).rejects.toThrow('Stats trigger authentication failed')
  })
})
