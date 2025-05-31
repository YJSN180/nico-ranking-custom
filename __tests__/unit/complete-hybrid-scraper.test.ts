import { describe, it, expect, vi, beforeEach } from 'vitest'
import { fetchRanking, fetchMultipleRankings, GENRES } from '@/lib/complete-hybrid-scraper'

// Mock fetch and global fetch
const mockFetch = vi.fn()
;(global as any).fetch = mockFetch

describe('complete-hybrid-scraper', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('fetchRanking', () => {
    it('should extract popular tags from HTML dynamically', async () => {
      const mockHTML = `
        <html>
          <head>
            <meta name="server-response" content="{&quot;data&quot;:{&quot;response&quot;:{&quot;$getTeibanRanking&quot;:{&quot;data&quot;:{&quot;featuredKey&quot;:&quot;ramuboyn&quot;,&quot;label&quot;:&quot;その他&quot;,&quot;items&quot;:[{&quot;id&quot;:&quot;sm123&quot;,&quot;title&quot;:&quot;Test Video&quot;,&quot;thumbnail&quot;:{&quot;url&quot;:&quot;https://example.com/thumb.jpg&quot;},&quot;count&quot;:{&quot;view&quot;:1000}}]}}}}}">
          </head>
          <body>
            <div class="RankingMainContainer">
              <a class="PopularTag" href="/ranking/genre/ramuboyn?tag=料理">料理</a>
              <a class="PopularTag" href="/ranking/genre/ramuboyn?tag=動物">動物</a>
              <a class="PopularTag" href="/ranking/genre/ramuboyn?tag=自然">自然</a>
              <a class="PopularTag" href="/ranking/genre/ramuboyn?tag=科学">科学</a>
              <a class="PopularTag" href="/ranking/genre/ramuboyn?tag=歴史">歴史</a>
            </div>
          </body>
        </html>
      `

      mockFetch.mockResolvedValueOnce({
        ok: true,
        text: async () => mockHTML
      })

      const result = await fetchRanking('ramuboyn', null, '24h')

      expect(result.popularTags).toEqual(['料理', '動物', '自然', '科学', '歴史'])
      expect(result.genre).toBe('ramuboyn')
      expect(result.label).toBe('その他')
      expect(result.items).toHaveLength(1)
      expect(result.items[0]).toEqual({
        rank: 1,
        id: 'sm123',
        title: 'Test Video',
        thumbURL: 'https://example.com/thumb.jpg',
        views: 1000
      })
    })

    it('should extract popular tags from alternative pattern', async () => {
      const mockHTML = `
        <html>
          <head>
            <meta name="server-response" content="{&quot;data&quot;:{&quot;response&quot;:{&quot;$getTeibanRanking&quot;:{&quot;data&quot;:{&quot;featuredKey&quot;:&quot;4eet3ca4&quot;,&quot;label&quot;:&quot;ゲーム&quot;,&quot;items&quot;:[]}}}}}">
          </head>
          <body>
            <section class="RankingMainContainer">
              <div>
                <a href="/ranking/genre/4eet3ca4?tag=ゆっくり実況">ゆっくり実況</a>
                <a href="/ranking/genre/4eet3ca4?tag=VOICEROID実況">VOICEROID実況</a>
                <a href="/ranking/genre/4eet3ca4?tag=実況プレイ動画">実況プレイ動画</a>
              </div>
            </section>
          </body>
        </html>
      `

      mockFetch.mockResolvedValueOnce({
        ok: true,
        text: async () => mockHTML
      })

      const result = await fetchRanking('4eet3ca4', null, '24h')

      expect(result.popularTags).toEqual(['ゆっくり実況', 'VOICEROID実況', '実況プレイ動画'])
    })

    it('should exclude "すべて" tag from popular tags', async () => {
      const mockHTML = `
        <html>
          <head>
            <meta name="server-response" content="{&quot;data&quot;:{&quot;response&quot;:{&quot;$getTeibanRanking&quot;:{&quot;data&quot;:{&quot;featuredKey&quot;:&quot;all&quot;,&quot;label&quot;:&quot;総合&quot;,&quot;items&quot;:[]}}}}}">
          </head>
          <body>
            <div class="RankingMainContainer">
              <a class="PopularTag" href="/ranking/genre/all">すべて</a>
              <a class="PopularTag" href="/ranking/genre/all?tag=音楽">音楽</a>
              <a class="PopularTag" href="/ranking/genre/all?tag=ゲーム">ゲーム</a>
            </div>
          </body>
        </html>
      `

      mockFetch.mockResolvedValueOnce({
        ok: true,
        text: async () => mockHTML
      })

      const result = await fetchRanking('all', null, '24h')

      expect(result.popularTags).toEqual(['音楽', 'ゲーム'])
      expect(result.popularTags).not.toContain('すべて')
    })

    it('should throw error for 例のソレ genre', async () => {
      await expect(fetchRanking('d2um7mc4', null, '24h')).rejects.toThrow('例のソレジャンルは対応していません')
    })

    it('should handle tag-based rankings', async () => {
      const mockHTML = `
        <html>
          <head>
            <meta name="server-response" content="{&quot;data&quot;:{&quot;response&quot;:{&quot;$getTeibanRanking&quot;:{&quot;data&quot;:{&quot;featuredKey&quot;:&quot;ramuboyn&quot;,&quot;label&quot;:&quot;その他&quot;,&quot;items&quot;:[{&quot;id&quot;:&quot;sm456&quot;,&quot;title&quot;:&quot;料理動画&quot;,&quot;thumbnail&quot;:{&quot;url&quot;:&quot;https://example.com/thumb2.jpg&quot;},&quot;count&quot;:{&quot;view&quot;:2000}}]}}}}}">
          </head>
          <body></body>
        </html>
      `

      mockFetch.mockResolvedValueOnce({
        ok: true,
        text: async () => mockHTML
      })

      const result = await fetchRanking('ramuboyn', '料理', '24h')

      expect(result.tag).toBe('料理')
      expect(result.items[0]?.title).toBe('料理動画')
    })

    it('should use correct Googlebot User-Agent', async () => {
      const mockHTML = `
        <html>
          <head>
            <meta name="server-response" content="{&quot;data&quot;:{&quot;response&quot;:{&quot;$getTeibanRanking&quot;:{&quot;data&quot;:{&quot;featuredKey&quot;:&quot;all&quot;,&quot;label&quot;:&quot;総合&quot;,&quot;items&quot;:[]}}}}}">
          </head>
        </html>
      `

      mockFetch.mockResolvedValueOnce({
        ok: true,
        text: async () => mockHTML
      })

      await fetchRanking('all', null, '24h')

      expect(mockFetch).toHaveBeenCalledWith(
        'https://www.nicovideo.jp/ranking/genre/all?term=24h',
        {
          headers: {
            'User-Agent': 'Googlebot/2.1 (+http://www.google.com/bot.html)',
            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
            'Accept-Language': 'ja,en-US;q=0.9,en;q=0.8'
          }
        }
      )
    })
  })

  describe('fetchMultipleRankings', () => {
    it('should fetch multiple rankings in parallel', async () => {
      const mockHTML = (genre: string, tag: string | null) => `
        <html>
          <head>
            <meta name="server-response" content="{&quot;data&quot;:{&quot;response&quot;:{&quot;$getTeibanRanking&quot;:{&quot;data&quot;:{&quot;featuredKey&quot;:&quot;${genre}&quot;,&quot;label&quot;:&quot;Test&quot;,&quot;items&quot;:[{&quot;id&quot;:&quot;sm${genre}${tag || ''}&quot;,&quot;title&quot;:&quot;Test&quot;,&quot;thumbnail&quot;:{&quot;url&quot;:&quot;https://example.com/thumb.jpg&quot;},&quot;count&quot;:{&quot;view&quot;:1000}}]}}}}}">
          </head>
        </html>
      `

      mockFetch
        .mockResolvedValueOnce({ ok: true, text: async () => mockHTML('all', null) })
        .mockResolvedValueOnce({ ok: true, text: async () => mockHTML('4eet3ca4', null) })
        .mockResolvedValueOnce({ ok: true, text: async () => mockHTML('ramuboyn', '料理') })

      const combinations = [
        { genre: 'all', tag: null, term: '24h' },
        { genre: '4eet3ca4', tag: null, term: '24h' },
        { genre: 'ramuboyn', tag: '料理', term: '24h' }
      ]

      const results = await fetchMultipleRankings(combinations)

      expect(results).toHaveLength(3)
      expect(results[0]?.genre).toBe('all')
      expect(results[1]?.genre).toBe('4eet3ca4')
      expect(results[2]?.genre).toBe('ramuboyn')
      expect(results[2]?.tag).toBe('料理')
    })

    it('should filter out failed requests', async () => {
      mockFetch
        .mockResolvedValueOnce({ ok: true, text: async () => '<html><head><meta name="server-response" content="{&quot;data&quot;:{&quot;response&quot;:{&quot;$getTeibanRanking&quot;:{&quot;data&quot;:{&quot;featuredKey&quot;:&quot;all&quot;,&quot;label&quot;:&quot;総合&quot;,&quot;items&quot;:[]}}}}}" /></head></html>' })
        .mockRejectedValueOnce(new Error('Network error'))
        .mockResolvedValueOnce({ ok: false, status: 403 })

      const combinations = [
        { genre: 'all', tag: null, term: '24h' },
        { genre: '4eet3ca4', tag: null, term: '24h' },
        { genre: 'ramuboyn', tag: null, term: '24h' }
      ]

      const results = await fetchMultipleRankings(combinations)

      expect(results).toHaveLength(1)
      expect(results[0]?.genre).toBe('all')
    })
  })

  describe('GENRES constant', () => {
    it('should not include 例のソレ genre', () => {
      expect(GENRES).not.toHaveProperty('rei_sore')
      expect(Object.values(GENRES).find(g => g.id === 'd2um7mc4')).toBeUndefined()
    })

    it('should include all standard genres', () => {
      expect(GENRES.all.id).toBe('all')
      expect(GENRES.game.id).toBe('4eet3ca4')
      expect(GENRES.other.id).toBe('ramuboyn')
      expect(Object.keys(GENRES)).toHaveLength(19)
    })
  })
})