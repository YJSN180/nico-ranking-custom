import { describe, it, expect, vi, beforeEach } from 'vitest'
import { fetchNicoRanking } from '@/lib/fetch-rss'

// 環境変数のモック
const originalEnv = process.env

describe('Cloudflare Proxy Integration', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    // 環境変数をリセット
    process.env = { ...originalEnv }
  })

  describe('fetchNicoRanking with proxy', () => {
    it('should use proxy URL when CLOUDFLARE_PROXY_URL is set', async () => {
      // 環境変数を設定
      process.env.CLOUDFLARE_PROXY_URL = 'https://test-proxy.workers.dev'
      
      // fetchをモック
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        text: async () => `<?xml version="1.0" encoding="UTF-8"?>
          <rss version="2.0">
            <channel>
              <title>Test Ranking</title>
              <item>
                <title>Test Video</title>
                <link>https://www.nicovideo.jp/watch/sm123456</link>
                <description><![CDATA[<p class="nico-info"><img alt="sm123456" src="https://test.jpg"/></p>]]></description>
              </item>
            </channel>
          </rss>`
      })
      global.fetch = mockFetch

      await fetchNicoRanking('24h', 'all')

      // プロキシURLが使用されていることを確認
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('https://test-proxy.workers.dev?url='),
        expect.objectContaining({ headers: {} })
      )
    })

    it('should handle tag ranking with proxy', async () => {
      process.env.CLOUDFLARE_PROXY_URL = 'https://test-proxy.workers.dev'
      
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        text: async () => `<?xml version="1.0" encoding="UTF-8"?>
          <rss version="2.0">
            <channel>
              <title>Tag Ranking</title>
            </channel>
          </rss>`
      })
      global.fetch = mockFetch

      await fetchNicoRanking('24h', 'all', 'VOCALOID')

      // タグランキングURLが正しくエンコードされていることを確認
      const callArg = mockFetch.mock.calls[0]?.[0] as string
      expect(callArg).toContain('test-proxy.workers.dev')
      expect(callArg).toContain(encodeURIComponent('ranking/tag/VOCALOID'))
      expect(callArg).toContain(encodeURIComponent('term=24h'))
    })

    it('should fallback to direct access when proxy is not set', async () => {
      delete process.env.CLOUDFLARE_PROXY_URL
      
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        text: async () => '<rss></rss>'
      })
      global.fetch = mockFetch

      await fetchNicoRanking()

      // 直接アクセスの場合はGooglebot UAが使用される
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('nicovideo.jp'),
        expect.objectContaining({
          headers: expect.objectContaining({
            'User-Agent': expect.stringContaining('Googlebot')
          })
        })
      )
    })
  })
})