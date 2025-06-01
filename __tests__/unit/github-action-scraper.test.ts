import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { RankingItem } from '@/types/ranking'
import type { RankingGenre } from '@/types/ranking-config'

// モック
vi.mock('node-fetch', () => ({
  default: vi.fn()
}))

describe('GitHub Action Scraper', () => {
  let fetch: any
  
  beforeEach(() => {
    vi.clearAllMocks()
    fetch = vi.mocked((globalThis as any).fetch || require('node-fetch').default)
  })

  describe('scrapeRankingData', () => {
    it('should fetch ranking data with popular tags for a genre', async () => {
      // モックHTMLレスポンス
      const mockHTML = `
        <html>
          <head>
            <meta name="server-response" content="{&quot;data&quot;:{&quot;response&quot;:{&quot;$getTeibanRanking&quot;:{&quot;data&quot;:{&quot;featuredKey&quot;:&quot;ojnwtgrg&quot;,&quot;label&quot;:&quot;ゲーム&quot;,&quot;items&quot;:[{&quot;id&quot;:&quot;sm123&quot;,&quot;title&quot;:&quot;Test Game Video&quot;,&quot;thumbnail&quot;:{&quot;url&quot;:&quot;https://example.com/thumb.jpg&quot;},&quot;count&quot;:{&quot;view&quot;:1000}}]}},&quot;$getTeibanRankingFeaturedKeyAndTrendTags&quot;:{&quot;data&quot;:{&quot;trendTags&quot;:[&quot;マインクラフト&quot;,&quot;ゆっくり実況&quot;,&quot;RTA&quot;,&quot;ポケモン&quot;,&quot;スプラトゥーン&quot;]}}}}}">
          </head>
        </html>
      `
      
      fetch.mockResolvedValueOnce({
        ok: true,
        text: async () => mockHTML
      })
      
      // Dynamic importを使用
      const { scrapeRankingData } = await import('@/scripts/github-action-scraper')
      const result = await scrapeRankingData('game', '24h')
      
      expect(result).toHaveProperty('genre', 'game')
      expect(result).toHaveProperty('items')
      expect(result.items).toHaveLength(1)
      expect(result.items[0]).toMatchObject({
        rank: 1,
        id: 'sm123',
        title: 'Test Game Video',
        views: 1000
      })
      expect(result).toHaveProperty('popularTags')
      expect(result.popularTags).toEqual(['マインクラフト', 'ゆっくり実況', 'RTA', 'ポケモン', 'スプラトゥーン'])
      expect(result).toHaveProperty('scrapedAt')
    })

    it('should handle multiple genres sequentially', async () => {
      const genres: RankingGenre[] = ['game', 'anime', 'vocaloid']
      const mockResponses = [
        { genre: 'game', tags: ['マインクラフト', 'RTA'] },
        { genre: 'anime', tags: ['アニメ', '2025冬'] },
        { genre: 'vocaloid', tags: ['初音ミク', 'オリジナル曲'] }
      ]
      
      mockResponses.forEach((resp, index) => {
        const mockHTML = `
          <meta name="server-response" content="{&quot;data&quot;:{&quot;response&quot;:{&quot;$getTeibanRanking&quot;:{&quot;data&quot;:{&quot;featuredKey&quot;:&quot;${resp.genre}&quot;,&quot;items&quot;:[]}},&quot;$getTeibanRankingFeaturedKeyAndTrendTags&quot;:{&quot;data&quot;:{&quot;trendTags&quot;:[${resp.tags.map(t => `&quot;${t}&quot;`).join(',')}]}}}}}">
        `
        fetch.mockResolvedValueOnce({
          ok: true,
          text: async () => mockHTML
        })
      })
      
      const { scrapeAllGenres } = await import('@/scripts/github-action-scraper')
      const results = await scrapeAllGenres(genres)
      
      expect(results).toHaveLength(3)
      expect(results[0]?.popularTags).toEqual(['マインクラフト', 'RTA'])
      expect(results[1]?.popularTags).toEqual(['アニメ', '2025冬'])
      expect(results[2]?.popularTags).toEqual(['初音ミク', 'オリジナル曲'])
    })

    it('should handle errors gracefully', async () => {
      fetch.mockRejectedValueOnce(new Error('Network error'))
      
      const { scrapeRankingData } = await import('@/scripts/github-action-scraper')
      const result = await scrapeRankingData('game', '24h')
      
      expect(result).toHaveProperty('genre', 'game')
      expect(result).toHaveProperty('error', 'Network error')
      expect(result.items).toEqual([])
      expect(result.popularTags).toEqual([])
    })
  })

  describe('updateKVData', () => {
    it('should send scraped data to KV update API', async () => {
      const mockData = {
        genre: 'game' as RankingGenre,
        items: [{ rank: 1, id: 'sm123', title: 'Test', views: 1000, thumbURL: '' }],
        popularTags: ['タグ1', 'タグ2'],
        scrapedAt: new Date().toISOString()
      }
      
      fetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ success: true })
      })
      
      const { updateKVData } = await import('@/scripts/github-action-scraper')
      const result = await updateKVData(mockData, 'https://example.com/api', 'test-secret')
      
      expect(result).toBe(true)
      expect(fetch).toHaveBeenCalledWith(
        'https://example.com/api/kv-update',
        expect.objectContaining({
          method: 'POST',
          headers: expect.objectContaining({
            'Content-Type': 'application/json',
            'X-Cron-Secret': 'test-secret'
          }),
          body: JSON.stringify(mockData)
        })
      )
    })

    it('should handle API errors', async () => {
      fetch.mockResolvedValueOnce({
        ok: false,
        status: 401,
        statusText: 'Unauthorized'
      })
      
      const { updateKVData } = await import('@/scripts/github-action-scraper')
      const result = await updateKVData({} as any, 'https://example.com/api', 'wrong-secret')
      
      expect(result).toBe(false)
    })
  })

  describe('main workflow', () => {
    it('should scrape all genres and update KV', async () => {
      // 環境変数をモック
      process.env.VERCEL_URL = 'example.vercel.app'
      process.env.CRON_SECRET = 'test-secret'
      
      // モックレスポンス
      const genres = ['game', 'anime']
      genres.forEach(genre => {
        fetch.mockResolvedValueOnce({
          ok: true,
          text: async () => `<meta name="server-response" content="{&quot;data&quot;:{&quot;response&quot;:{&quot;$getTeibanRanking&quot;:{&quot;data&quot;:{&quot;items&quot;:[]}},&quot;$getTeibanRankingFeaturedKeyAndTrendTags&quot;:{&quot;data&quot;:{&quot;trendTags&quot;:[]}}}}}">`
        })
      })
      
      // KV更新のモック
      genres.forEach(() => {
        fetch.mockResolvedValueOnce({
          ok: true,
          json: async () => ({ success: true })
        })
      })
      
      const { main } = await import('@/scripts/github-action-scraper')
      const result = await main()
      
      expect(result.success).toBe(true)
      expect(result.updated).toHaveLength(2)
      expect(result.failed).toHaveLength(0)
    })
  })
})