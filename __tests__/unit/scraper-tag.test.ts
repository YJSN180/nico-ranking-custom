import { describe, it, expect, vi, beforeEach } from 'vitest'
import { scrapeRankingPage, fetchPopularTags } from '@/lib/scraper'

// fetchをモック
global.fetch = vi.fn()

describe.skip('Scraper Tag Functionality', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('should fetch ranking with tag parameter', async () => {
    const mockResponse = {
      meta: { status: 200 },
      data: {
        items: [
          {
            id: 'sm1234',
            title: 'Test Video',
            thumbnail: { largeUrl: 'https://example.com/thumb.jpg' },
            count: { view: 1000, comment: 50, mylist: 10, like: 100 },
            owner: { id: 'user123', name: 'Test User', iconUrl: 'https://example.com/icon.jpg' },
            registeredAt: '2024-01-01T00:00:00Z'
          }
        ]
      }
    }

    vi.mocked(global.fetch).mockResolvedValueOnce({
      ok: true,
      json: async () => mockResponse
    } as Response)

    const result = await scrapeRankingPage('game', '24h', 'ゲーム実況')

    // URLにtagパラメータが含まれることを確認
    expect(global.fetch).toHaveBeenCalledWith(
      'https://nvapi.nicovideo.jp/v1/ranking/genre/game?term=24h&tag=%E3%82%B2%E3%83%BC%E3%83%A0%E5%AE%9F%E6%B3%81',
      expect.objectContaining({
        headers: expect.objectContaining({
          'X-Frontend-Id': '6'
        })
      })
    )

    expect(result.items).toHaveLength(1)
    expect(result.items[0]).toMatchObject({
      id: 'sm1234',
      title: 'Test Video',
      views: 1000
    })
  })

  it('should fetch ranking without tag parameter when not specified', async () => {
    const mockResponse = {
      meta: { status: 200 },
      data: { items: [] }
    }

    vi.mocked(global.fetch).mockResolvedValueOnce({
      ok: true,
      json: async () => mockResponse
    } as Response)

    await scrapeRankingPage('all', '24h')

    // tagパラメータなしでURLが構築されることを確認
    expect(global.fetch).toHaveBeenCalledWith(
      'https://nvapi.nicovideo.jp/v1/ranking/genre/all?term=24h',
      expect.any(Object)
    )
  })

  it('should fetch popular tags for a genre', async () => {
    const mockResponse = {
      meta: { status: 200 },
      data: {
        startAt: '2025-05-20T00:00:00+09:00',
        tags: ['ゲーム実況', 'RTA', 'Minecraft']
      }
    }

    vi.mocked(global.fetch).mockResolvedValueOnce({
      ok: true,
      json: async () => mockResponse
    } as Response)

    const tags = await fetchPopularTags('game')

    expect(global.fetch).toHaveBeenCalledWith(
      'https://nvapi.nicovideo.jp/v1/genres/game/popular-tags',
      expect.objectContaining({
        headers: expect.objectContaining({
          'X-Frontend-Id': '6'
        })
      })
    )

    expect(tags).toEqual(['ゲーム実況', 'RTA', 'Minecraft'])
  })

  it('should return empty array when popular tags API fails', async () => {
    vi.mocked(global.fetch).mockResolvedValueOnce({
      ok: false,
      status: 404
    } as Response)

    const tags = await fetchPopularTags('game')

    expect(tags).toEqual([])
  })

  it('should not fetch individual video tags when using tag parameter', async () => {
    const mockResponse = {
      meta: { status: 200 },
      data: {
        items: Array(10).fill(null).map((_, i) => ({
          id: `sm${i}`,
          title: `Video ${i}`,
          thumbnail: { largeUrl: 'https://example.com/thumb.jpg' },
          count: { view: 1000 },
          owner: { id: 'user123', name: 'Test User' },
          registeredAt: '2024-01-01T00:00:00Z'
        }))
      }
    }

    vi.mocked(global.fetch).mockResolvedValueOnce({
      ok: true,
      json: async () => mockResponse
    } as Response)

    const result = await scrapeRankingPage('game', '24h', 'ゲーム実況')

    // fetchが1回だけ呼ばれることを確認（個別のタグ取得がないこと）
    expect(global.fetch).toHaveBeenCalledTimes(1)
    expect(result.items).toHaveLength(10)
  })
})