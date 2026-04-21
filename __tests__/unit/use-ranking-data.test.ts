import { renderHook, act } from '@testing-library/react'
import { useRankingData } from '@/hooks/use-ranking-data'
import type { RankingConfig } from '@/types/ranking-config'
import type { NGList } from '@/types/ng-list'

// Mocks
vi.mock('@/lib/ranking-cache', () => {
  return {
    rankingCache: {
      get: vi.fn(),
      set: vi.fn()
    }
  }
})

vi.mock('@/hooks/use-device-type', () => {
  return {
    useDeviceType: () => 'desktop',
    getDeviceBasedLimit: () => 100
  }
})

// Silence serverLog
vi.mock('@/lib/server-log', () => ({
  serverLog: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn()
  }
}))

vi.mock('@/lib/sentry/capture', () => ({
  captureBrowserRateLimit: vi.fn(),
  captureWebException: vi.fn()
}))

const baseNGList: NGList = {
  totalCount: 0,
  videoIds: [],
  authorIds: [],
  videoTitles: { exact: [], partial: [] },
  authorNames: { exact: [], partial: [] },
  tags: { exact: [], partial: [] },
  updatedAt: new Date().toISOString()
}

const baseConfig: RankingConfig = {
  genre: 'all',
  period: '24h',
  tag: undefined
}

const makeHook = (initialData = { items: [], popularTags: [] }) =>
  renderHook(() =>
    useRankingData({
      initialData,
      ngList: baseNGList,
      ngListVersion: 'v1'
    })
  )

describe('useRankingData', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
  })

  it('uses cache without setting loading spinner', async () => {
    const { rankingCache } = await import('@/lib/ranking-cache')
    ;(rankingCache.get as any).mockReturnValue({
      data: [{ id: '1', rank: 1, title: 't', authorName: 'a' }],
      popularTags: ['tag']
    })

    const hook = makeHook()

    await act(async () => {
      await hook.result.current.fetchRankingData(baseConfig)
    })

    expect(rankingCache.get).toHaveBeenCalled()
    expect(hook.result.current.loading).toBe(false)
    expect(hook.result.current.rankingData.length).toBe(1)
    expect(hook.result.current.error).toBeNull()
  })

  it('handles 429 without reload and stops loading', async () => {
    const { rankingCache } = await import('@/lib/ranking-cache')
    const { captureBrowserRateLimit } = await import('@/lib/sentry/capture')
    const { serverLog } = await import('@/lib/server-log')
    ;(rankingCache.get as any).mockReturnValue(undefined)

    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(null, {
      status: 429,
      headers: {
        'retry-after': '10'
      }
    })) as any)

    const hook = makeHook()

    await act(async () => {
      await hook.result.current.fetchRankingData(baseConfig)
    })

    expect(fetch).toHaveBeenCalled()
    expect(hook.result.current.loading).toBe(false)
    expect(hook.result.current.error).toContain('リクエストが集中')
    // 429 処理でデータは空のまま
    expect(hook.result.current.rankingData).toHaveLength(0)
    expect(serverLog.warn).not.toHaveBeenCalled()
    expect(captureBrowserRateLimit).toHaveBeenCalledWith(
      expect.objectContaining({
        surface: 'ranking-fetch',
        endpointFamily: '/api/ranking',
        fingerprint: ['browser-ranking-fetch-429'],
        tags: expect.objectContaining({
          genre: 'all',
          period: '24h',
          has_tag: false
        }),
        retryAfterSeconds: 10
      })
    )
  })

  it('fetches from API when cache miss and sets data', async () => {
    const { rankingCache } = await import('@/lib/ranking-cache')
    ;(rankingCache.get as any).mockReturnValue(undefined)

    const payload = {
      items: [{ id: '1', rank: 1, title: 'title', authorName: 'author' }],
      popularTags: ['p']
    }
    global.fetch = vi.fn().mockResolvedValue(
      new Response(JSON.stringify(payload), {
        status: 200,
        headers: { 'Content-Type': 'application/json' }
      })
    ) as any

    const hook = makeHook()

    await act(async () => {
      await hook.result.current.fetchRankingData(baseConfig)
    })

    expect(fetch).toHaveBeenCalled()
    expect(hook.result.current.loading).toBe(false)
    expect(hook.result.current.rankingData).toHaveLength(1)
    expect(hook.result.current.error).toBeNull()
  })

})
