import { describe, it, expect, vi, beforeEach } from 'vitest'
import { isProxyConfigured, scrapeRankingViaProxy } from '@/lib/proxy-scraper'

// fetchのモック
global.fetch = vi.fn()

describe('proxy-scraper', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    // 環境変数のリセット
    delete process.env.PROXY_URL
    delete process.env.PROXY_API_KEY
  })

  describe('isProxyConfigured', () => {
    it('プロキシURLとAPIキーが両方設定されている場合はtrueを返す', () => {
      process.env.PROXY_URL = 'https://proxy.example.com'
      process.env.PROXY_API_KEY = 'test-api-key'
      
      expect(isProxyConfigured()).toBe(true)
    })

    it('プロキシURLのみ設定されている場合はfalseを返す', () => {
      process.env.PROXY_URL = 'https://proxy.example.com'
      
      expect(isProxyConfigured()).toBe(false)
    })

    it('APIキーのみ設定されている場合はfalseを返す', () => {
      process.env.PROXY_API_KEY = 'test-api-key'
      
      expect(isProxyConfigured()).toBe(false)
    })

    it('どちらも設定されていない場合はfalseを返す', () => {
      expect(isProxyConfigured()).toBe(false)
    })
  })

  describe('scrapeRankingViaProxy', () => {
    const mockProxyResponse = {
      status: 200,
      body: `
        <div data-video-id="sm45033850" title="琴葉茜の無人巨大コロニー調査">
          <img src="https://example.com/thumb1.jpg">
          <span>18,047 再生</span>
          <span>692 コメント</span>
          <span>48 マイリスト</span>
        </div>
        <div data-video-id="sm45031223" title="静電気ドッキリを仕掛けるタクヤさん">
          <img src="https://example.com/thumb2.jpg">
          <span>15,593 再生</span>
          <span>250 コメント</span>
          <span>27 マイリスト</span>
        </div>
        <div data-video-id="so45006370" title="機動戦士Gundam GQuuuuuuX">
          <img src="https://example.com/thumb3.jpg">
          <span>110,054 再生</span>
        </div>
      `,
      headers: {}
    }

    beforeEach(() => {
      process.env.PROXY_URL = 'https://proxy.example.com'
      process.env.PROXY_API_KEY = 'test-api-key'
    })

    it('プロキシ経由で総合24時間ランキングを取得できる', async () => {
      const mockFetch = vi.mocked(fetch)
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockProxyResponse
      } as Response)

      const result = await scrapeRankingViaProxy('all', '24h')
      
      // Check if function was called
      expect(mockFetch).toHaveBeenCalled()

      expect(mockFetch).toHaveBeenCalledWith(
        'https://proxy.example.com',
        expect.objectContaining({
          method: 'POST',
          headers: expect.objectContaining({
            'Content-Type': 'application/json',
            'X-API-Key': 'test-api-key'
          }),
          body: expect.stringContaining('https://www.nicovideo.jp/ranking/genre/all?term=24h')
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
        json: async () => mockProxyResponse
      } as Response)

      const result = await scrapeRankingViaProxy('all', 'hour')

      expect(mockFetch).toHaveBeenCalledWith(
        'https://proxy.example.com',
        expect.objectContaining({
          body: expect.stringContaining('https://www.nicovideo.jp/ranking/genre/all?term=hour')
        })
      )

      expect(result.items.length).toBeGreaterThan(0)
    })

    it('タグ付きランキングをプロキシ経由で取得できる', async () => {
      const mockFetch = vi.mocked(fetch)
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockProxyResponse
      } as Response)

      const result = await scrapeRankingViaProxy('all', '24h', 'ゲーム')

      expect(mockFetch).toHaveBeenCalledWith(
        'https://proxy.example.com',
        expect.objectContaining({
          body: expect.stringContaining('tag=%E3%82%B2%E3%83%BC%E3%83%A0')
        })
      )
    })

    it('プロキシが設定されていない場合はエラーを投げる', async () => {
      delete process.env.PROXY_URL

      await expect(scrapeRankingViaProxy('all', '24h')).rejects.toThrow('PROXY_URL is not configured')
    })

    it('プロキシサーバーがエラーを返した場合はエラーを投げる', async () => {
      const mockFetch = vi.mocked(fetch)
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 503
      } as Response)

      await expect(scrapeRankingViaProxy('all', '24h')).rejects.toThrow('Proxy request failed: 503')
    })

    it('センシティブ動画が含まれることを確認', async () => {
      const mockFetch = vi.mocked(fetch)
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockProxyResponse
      } as Response)

      const result = await scrapeRankingViaProxy('all', '24h')
      
      const sensitiveVideos = result.items.filter(item => 
        item.title?.includes('静電気') || item.title?.includes('Gundam')
      )
      
      expect(sensitiveVideos).toHaveLength(2)
    })
  })
})