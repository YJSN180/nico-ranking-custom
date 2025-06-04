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
    it('プロキシURLとAPIキーが両方設定されている場合はtrueを返す', () => {
      process.env.PROXY_URL = 'https://proxy.example.com'
      process.env.PROXY_API_KEY = 'test-api-key'
      
      expect(isProxyConfigured()).toBe(true)
    })

    it('プロキシURLのみ設定されている場合はtrueを返す', () => {
      process.env.PROXY_URL = 'https://proxy.example.com'
      
      expect(isProxyConfigured()).toBe(true)
    })

    it('APIキーのみ設定されている場合はfalseを返す', () => {
      process.env.PROXY_API_KEY = 'test-api-key'
      
      expect(isProxyConfigured()).toBe(false)
    })

    it('どちらも設定されていない場合はfalseを返す', () => {
      expect(isProxyConfigured()).toBe(false)
    })
  })

  describe.skip('scrapeRankingViaProxy', () => {
    const mockServerData = {
      data: {
        response: {
          $getTeibanRanking: {
            data: {
              genreKey: 'all',
              items: [
                {
                  contentId: 'sm45033850',
                  title: '琴葉茜の無人巨大コロニー調査',
                  viewCount: 18047,
                  commentCount: 692,
                  mylistCount: 48,
                  thumbnailUrlPc: 'https://example.com/thumb1.jpg'
                },
                {
                  contentId: 'sm45031223',
                  title: '静電気ドッキリを仕掛けるタクヤさん',
                  viewCount: 15593,
                  commentCount: 250,
                  mylistCount: 27,
                  thumbnailUrlPc: 'https://example.com/thumb2.jpg'
                },
                {
                  contentId: 'so45006370',
                  title: '機動戦士Gundam GQuuuuuuX',
                  viewCount: 110054,
                  commentCount: 0,
                  mylistCount: 0,
                  thumbnailUrlPc: 'https://example.com/thumb3.jpg'
                }
              ]
            }
          }
        }
      }
    }
    
    const encodedData = JSON.stringify(mockServerData)
      .replace(/"/g, '&quot;')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/'/g, '&#39;')
    
    const mockHtmlResponse = `
      <html>
        <head>
          <meta name="server-response" content="${encodedData}">
        </head>
      </html>
    `

    beforeEach(() => {
      process.env.PROXY_URL = 'https://proxy.example.com'
      process.env.PROXY_API_KEY = 'test-api-key'
    })

    it('プロキシ経由で総合24時間ランキングを取得できる', async () => {
      const mockFetch = vi.mocked(fetch)
      mockFetch.mockResolvedValueOnce({
        ok: true,
        text: async () => mockHtmlResponse
      } as Response)

      const result = await scrapeRankingViaProxy('all', '24h')
      
      // Check if function was called
      expect(mockFetch).toHaveBeenCalled()

      expect(mockFetch).toHaveBeenCalledWith(
        'https://www.nicovideo.jp/ranking/genre/all?term=24h',
        expect.objectContaining({
          headers: expect.objectContaining({
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
            'Accept': 'text/html,application/xhtml+xml',
            'Accept-Language': 'ja',
            'Cookie': 'sensitive_material_status=accept'
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
      expect(result.items[1]).toMatchObject({
        rank: 2,
        id: 'sm45031223',
        title: '静電気ドッキリを仕掛けるタクヤさん',
        views: 15593
      })
      expect(result.items[2]).toMatchObject({
        rank: 3,
        id: 'so45006370',
        title: '機動戦士Gundam GQuuuuuuX',
        views: 110054
      })
    })

    it('プロキシ経由で毎時ランキングを取得できる', async () => {
      const mockFetch = vi.mocked(fetch)
      mockFetch.mockResolvedValueOnce({
        ok: true,
        text: async () => mockHtmlResponse
      } as Response)

      const result = await scrapeRankingViaProxy('all', 'hour')

      expect(mockFetch).toHaveBeenCalledWith(
        'https://www.nicovideo.jp/ranking/genre/all?term=hour',
        expect.objectContaining({
          headers: expect.objectContaining({
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
          })
        })
      )

      expect(result.items.length).toBeGreaterThan(0)
    })

    it('タグ付きランキングをプロキシ経由で取得できる', async () => {
      const mockFetch = vi.mocked(fetch)
      mockFetch.mockResolvedValueOnce({
        ok: true,
        text: async () => mockHtmlResponse
      } as Response)

      const result = await scrapeRankingViaProxy('all', '24h', 'ゲーム')

      expect(mockFetch).toHaveBeenCalledWith(
        'https://www.nicovideo.jp/ranking/genre/all?term=24h&tag=%E3%82%B2%E3%83%BC%E3%83%A0',
        expect.anyObject()
      )
    })

    it('プロキシが設定されていない場合はエラーを投げる', async () => {
      delete process.env.PROXY_URL

      await expect(scrapeRankingViaProxy('all', '24h')).rejects.toThrow('プロキシが設定されていません')
    })

    it('プロキシサーバーがエラーを返した場合はエラーを投げる', async () => {
      const mockFetch = vi.mocked(fetch)
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 503,
        text: async () => 'Service Unavailable'
      } as Response)

      await expect(scrapeRankingViaProxy('all', '24h')).rejects.toThrow()
    })

    it('センシティブ動画が含まれることを確認', async () => {
      const mockFetch = vi.mocked(fetch)
      mockFetch.mockResolvedValueOnce({
        ok: true,
        text: async () => mockHtmlResponse
      } as Response)

      const result = await scrapeRankingViaProxy('all', '24h')
      
      const sensitiveVideos = result.items.filter(item => 
        item.title?.includes('静電気') || item.title?.includes('Gundam')
      )
      
      expect(sensitiveVideos).toHaveLength(2)
    })
  })
})