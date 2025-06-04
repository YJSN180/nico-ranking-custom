import { describe, it, expect, vi, beforeEach } from 'vitest'
import { isProxyConfigured, scrapeRankingViaProxy } from '@/lib/proxy-scraper'

// fetchのモック
global.fetch = vi.fn()

describe('proxy-scraper', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    // 環境変数のリセット
    delete process.env.PROXY_URL
    delete process.env.PROXY_HOST
    delete process.env.PROXY_PORT
    delete process.env.PROXY_API_KEY
  })

  describe('isProxyConfigured', () => {
    it('プロキシURLが設定されている場合はtrueを返す', () => {
      process.env.PROXY_URL = 'https://proxy.example.com'
      
      expect(isProxyConfigured()).toBe(true)
    })

    it('プロキシホストとポートが設定されている場合はtrueを返す', () => {
      process.env.PROXY_HOST = 'proxy.example.com'
      process.env.PROXY_PORT = '8080'
      
      expect(isProxyConfigured()).toBe(true)
    })

    it('プロキシURLのみ設定されている場合はtrueを返す', () => {
      process.env.PROXY_URL = 'https://proxy.example.com'
      
      expect(isProxyConfigured()).toBe(true)
    })

    it('どちらも設定されていない場合はfalseを返す', () => {
      expect(isProxyConfigured()).toBe(false)
    })
  })

  describe('scrapeRankingViaProxy', () => {
    const createMockHTML = (genreId: string) => {
      const serverResponse = {
        data: {
          response: {
            $getTeibanRanking: {
              data: {
                featuredKey: genreId,
                label: 'テストジャンル',
                items: [
                  {
                    id: 'sm45033850',
                    title: '琴葉茜の無人巨大コロニー調査',
                    thumbnail: { url: 'https://example.com/thumb1.jpg' },
                    count: { view: 18047, comment: 692, mylist: 48 },
                    registeredAt: '2024-01-01T00:00:00+09:00'
                  },
                  {
                    id: 'sm45031223',
                    title: '静電気ドッキリを仕掛けるタクヤさん',
                    thumbnail: { url: 'https://example.com/thumb2.jpg' },
                    count: { view: 15593, comment: 250, mylist: 27 },
                    registeredAt: '2024-01-01T00:00:00+09:00'
                  },
                  {
                    id: 'so45006370',
                    title: '機動戦士Gundam GQuuuuuuX',
                    thumbnail: { url: 'https://example.com/thumb3.jpg' },
                    count: { view: 110054 },
                    registeredAt: '2024-01-01T00:00:00+09:00'
                  }
                ]
              }
            }
          }
        }
      }
      
      const encodedContent = JSON.stringify(serverResponse)
        .replace(/"/g, '&quot;')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/'/g, '&#39;')
      
      return `<html><head><meta name="server-response" content="${encodedContent}" /></head><body></body></html>`
    }

    beforeEach(() => {
      process.env.PROXY_URL = 'https://proxy.example.com'
      process.env.PROXY_API_KEY = 'test-api-key'
    })

    it('プロキシ経由で総合24時間ランキングを取得できる', async () => {
      const mockFetch = vi.mocked(fetch)
      mockFetch.mockResolvedValueOnce({
        ok: true,
        text: async () => createMockHTML('all')
      } as Response)

      const result = await scrapeRankingViaProxy('all', '24h')
      
      expect(mockFetch).toHaveBeenCalledWith(
        'https://www.nicovideo.jp/ranking/genre/all?term=24h',
        expect.objectContaining({
          headers: expect.objectContaining({
            'User-Agent': expect.stringContaining('Mozilla')
          })
        })
      )

      expect(result.items).toHaveLength(3)
      expect(result.items[0]).toMatchObject({
        rank: 1,
        id: 'sm45033850',
        title: '琴葉茜の無人巨大コロニー調査',
        views: 18047
      })
    })

    it('プロキシ経由で毎時ランキングを取得できる', async () => {
      const mockFetch = vi.mocked(fetch)
      mockFetch.mockResolvedValueOnce({
        ok: true,
        text: async () => createMockHTML('all')
      } as Response)

      const result = await scrapeRankingViaProxy('all', 'hour')

      expect(mockFetch).toHaveBeenCalledWith(
        'https://www.nicovideo.jp/ranking/genre/all?term=hour',
        expect.any(Object)
      )

      expect(result.items.length).toBeGreaterThan(0)
    })

    it('タグ付きランキングをプロキシ経由で取得できる', async () => {
      const mockFetch = vi.mocked(fetch)
      mockFetch.mockResolvedValueOnce({
        ok: true,
        text: async () => createMockHTML('all')
      } as Response)

      const result = await scrapeRankingViaProxy('all', '24h', 'ゲーム')

      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('tag=%E3%82%B2%E3%83%BC%E3%83%A0'),
        expect.any(Object)
      )
    })

    it('プロキシが設定されていない場合はエラーを投げる', async () => {
      delete process.env.PROXY_URL
      delete process.env.PROXY_HOST

      await expect(scrapeRankingViaProxy('all', '24h')).rejects.toThrow('プロキシが設定されていません')
    })

    it('プロキシサーバーがエラーを返した場合はエラーを投げる', async () => {
      const mockFetch = vi.mocked(fetch)
      mockFetch.mockRejectedValueOnce(new Error('fetch failed'))

      await expect(scrapeRankingViaProxy('all', '24h')).rejects.toThrow('fetch failed')
    })

    it('センシティブ動画が含まれることを確認', async () => {
      const mockFetch = vi.mocked(fetch)
      mockFetch.mockResolvedValueOnce({
        ok: true,
        text: async () => createMockHTML('all')
      } as Response)

      const result = await scrapeRankingViaProxy('all', '24h')
      
      const sensitiveVideos = result.items.filter(item => 
        item.title?.includes('静電気') || item.title?.includes('Gundam')
      )
      
      expect(sensitiveVideos).toHaveLength(2)
    })
  })
})