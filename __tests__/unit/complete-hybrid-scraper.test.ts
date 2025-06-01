import { describe, it, expect, vi, beforeEach } from 'vitest'
import { fetchRanking, fetchMultipleRankings } from '@/lib/complete-hybrid-scraper'
import { GENRE_ID_MAP } from '@/lib/genre-mapping'
import type { RankingGenre } from '@/types/ranking-config'

// Mock fetch and global fetch
const mockFetch = vi.fn()
;(global as any).fetch = mockFetch

describe('complete-hybrid-scraper', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('fetchRanking', () => {
    const mockHTML = (genreId: string, tag: string | null) => {
      const serverData = {
        data: {
          response: {
            $getTeibanRanking: {
              data: {
                featuredKey: genreId,
                label: "テストジャンル",
                tag: tag,
                items: [{
                  id: "sm1",
                  title: "テスト動画",
                  thumbnail: { url: "https://example.com/thumb.jpg" },
                  count: { view: 1000, comment: 50, mylist: 10, like: 100 },
                  owner: { id: "user123", name: "テストユーザー", iconUrl: "https://example.com/icon.jpg" },
                  registeredAt: "2025-01-01T00:00:00+09:00"
                }]
              }
            },
            $getTeibanRankingFeaturedKeyAndTrendTags: {
              data: {
                trendTags: ["人気タグ1", "人気タグ2"]
              }
            }
          }
        }
      }
      const encodedData = JSON.stringify(serverData)
        .replace(/"/g, '&quot;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
      
      return `<html><head><meta name="server-response" content="${encodedData}" /></head><body></body></html>`
    }

    it('should fetch ranking with popular tags from trendTags', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        text: async () => mockHTML('all', null)
      })

      const result = await fetchRanking('all', null, '24h')

      expect(result.items).toHaveLength(1)
      expect(result.items[0]).toMatchObject({
        rank: 1,
        id: 'sm1',
        title: 'テスト動画',
        thumbURL: 'https://example.com/thumb.jpg',
        views: 1000
      })
      expect(result.popularTags).toEqual(['人気タグ1', '人気タグ2'])
      expect(result.genre).toBe('e9uj2uks') // 'all'のID
      expect(result.label).toBe('テストジャンル')
    })

    it('should fetch tag-specific ranking', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        text: async () => mockHTML('4eet3ca4', '料理')
      })

      const result = await fetchRanking('game', '料理', '24h')

      expect(mockFetch).toHaveBeenCalledWith(
        'https://www.nicovideo.jp/ranking/genre/4eet3ca4?term=24h&tag=%E6%96%99%E7%90%86',
        expect.any(Object)
      )
      expect(result.genre).toBe('4eet3ca4')
    })

    it('should handle missing trendTags gracefully', async () => {
      const htmlWithoutTrendTags = `
<html>
  <head>
    <meta name="server-response" content="{&quot;data&quot;:{&quot;response&quot;:{&quot;$getTeibanRanking&quot;:{&quot;data&quot;:{&quot;featuredKey&quot;:&quot;all&quot;,&quot;label&quot;:&quot;総合&quot;,&quot;items&quot;:[{&quot;id&quot;:&quot;sm1&quot;,&quot;title&quot;:&quot;テスト&quot;,&quot;thumbnail&quot;:{&quot;url&quot;:&quot;test.jpg&quot;},&quot;count&quot;:{&quot;view&quot;:100}}]}}}}" />
  </head>
  <body>
    <a href="/ranking/genre/all?tag=タグ1">タグ1</a>
    <a href="/ranking/genre/all?tag=タグ2">タグ2</a>
  </body>
</html>
      `

      mockFetch.mockResolvedValueOnce({
        ok: true,
        text: async () => htmlWithoutTrendTags
      })

      const result = await fetchRanking('all', null, '24h')

      expect(result.popularTags).toEqual(['タグ1', 'タグ2'])
    })

    it('should handle empty ranking data', async () => {
      const emptyHTML = `
<html>
  <head>
    <meta name="server-response" content="{&quot;data&quot;:{&quot;response&quot;:{&quot;$getTeibanRanking&quot;:{&quot;data&quot;:{&quot;items&quot;:[]}}}}}" />
  </head>
</html>
      `

      mockFetch.mockResolvedValueOnce({
        ok: true,
        text: async () => emptyHTML
      })

      const result = await fetchRanking('all', null, '24h')

      expect(result.items).toEqual([])
      expect(result.popularTags).toEqual([])
    })

    it('should throw error when server-response meta tag is missing', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        text: async () => '<html><body>No meta tag</body></html>'
      })

      await expect(fetchRanking('all', null, '24h')).rejects.toThrow('server-responseメタタグが見つかりません')
    })

    it('should throw error when fetch fails', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 403
      })

      await expect(fetchRanking('all', null, '24h')).rejects.toThrow('Fetch failed: 403')
    })
  })

  describe('fetchMultipleRankings', () => {
    it('should fetch multiple rankings concurrently', async () => {
      const mockHTML = (genreId: string) => `
<html>
  <head>
    <meta name="server-response" content="{&quot;data&quot;:{&quot;response&quot;:{&quot;$getTeibanRanking&quot;:{&quot;data&quot;:{&quot;featuredKey&quot;:&quot;${genreId}&quot;,&quot;label&quot;:&quot;${genreId}&quot;,&quot;items&quot;:[{&quot;id&quot;:&quot;${genreId}_1&quot;,&quot;title&quot;:&quot;Test&quot;,&quot;thumbnail&quot;:{&quot;url&quot;:&quot;test.jpg&quot;},&quot;count&quot;:{&quot;view&quot;:100}}]}}}}}" />
  </head>
</html>
      `

      mockFetch
        .mockResolvedValueOnce({ ok: true, text: async () => mockHTML('e9uj2uks') })
        .mockResolvedValueOnce({ ok: true, text: async () => mockHTML('4eet3ca4') })
        .mockResolvedValueOnce({ ok: true, text: async () => mockHTML('zc49b03a') })

      const genres: RankingGenre[] = ['all', 'game', 'anime']
      const results = await fetchMultipleRankings(genres, '24h')

      expect(results.size).toBe(3)
      expect(results.get('all')?.items).toHaveLength(1)
      expect(results.get('game')?.items).toHaveLength(1)
      expect(results.get('anime')?.items).toHaveLength(1)
    })

    it('should handle partial failures gracefully', async () => {
      mockFetch
        .mockResolvedValueOnce({ 
          ok: true, 
          text: async () => `<html><head><meta name="server-response" content="{&quot;data&quot;:{&quot;response&quot;:{&quot;$getTeibanRanking&quot;:{&quot;data&quot;:{&quot;featuredKey&quot;:&quot;e9uj2uks&quot;,&quot;items&quot;:[{&quot;id&quot;:&quot;sm1&quot;,&quot;title&quot;:&quot;Test&quot;,&quot;thumbnail&quot;:{&quot;url&quot;:&quot;test.jpg&quot;},&quot;count&quot;:{&quot;view&quot;:100}}]}}}}}" /></head></html>` 
        })
        .mockRejectedValueOnce(new Error('Network error'))
        .mockResolvedValueOnce({ ok: false, status: 403 })

      const genres: RankingGenre[] = ['all', 'game', 'anime']
      const results = await fetchMultipleRankings(genres, '24h')

      expect(results.size).toBe(3)
      expect(results.get('all')?.items).toHaveLength(1)
      expect(results.get('game')?.items).toEqual([])
      expect(results.get('anime')?.items).toEqual([])
    })

    it('should respect concurrency limit', async () => {
      const mockHTML = () => `<html><head><meta name="server-response" content="{&quot;data&quot;:{&quot;response&quot;:{&quot;$getTeibanRanking&quot;:{&quot;data&quot;:{&quot;items&quot;:[]}}}}}" /></head></html>`
      
      mockFetch.mockImplementation(() => 
        new Promise(resolve => 
          setTimeout(() => resolve({ ok: true, text: async () => mockHTML() }), 100)
        )
      )

      const genres: RankingGenre[] = ['all', 'game', 'anime', 'vocaloid', 'music', 'other']
      const startTime = Date.now()
      
      await fetchMultipleRankings(genres, '24h')
      
      const duration = Date.now() - startTime
      
      // 同時実行数が3なので、6ジャンルは2バッチ（200ms + レート制限1000ms）
      expect(duration).toBeGreaterThanOrEqual(1200)
      expect(mockFetch).toHaveBeenCalledTimes(6)
    })
  })

  describe('GENRE_ID_MAP', () => {
    it('should contain all required genres', () => {
      const requiredGenres: RankingGenre[] = [
        'all', 'game', 'anime', 'vocaloid', 'voicesynthesis',
        'entertainment', 'music', 'sing', 'dance', 'play',
        'commentary', 'cooking', 'travel', 'nature', 'vehicle',
        'technology', 'society', 'mmd', 'vtuber', 'radio',
        'sports', 'animal', 'other'
      ]

      requiredGenres.forEach(genre => {
        expect(GENRE_ID_MAP).toHaveProperty(genre)
        expect(GENRE_ID_MAP[genre]).toBeTruthy()
      })
    })

    it('should have correct IDs for known genres', () => {
      expect(GENRE_ID_MAP.all).toBe('e9uj2uks')
      expect(GENRE_ID_MAP.game).toBe('4eet3ca4')
      expect(GENRE_ID_MAP.anime).toBe('zc49b03a')
      expect(GENRE_ID_MAP.vocaloid).toBe('dshv5do5')
    })
  })
})