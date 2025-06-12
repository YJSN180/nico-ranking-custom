import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { RankingItem } from '@/types/ranking'

// fetch モック
const mockFetch = vi.fn()
global.fetch = mockFetch

describe('scraper.ts - Extended Coverage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  const mockRankingHTML = `
    <html>
      <head>
        <meta name="server-response" content="{&quot;data&quot;:{&quot;response&quot;:{&quot;$getTeibanRanking&quot;:{&quot;data&quot;:{&quot;items&quot;:[{&quot;id&quot;:&quot;sm123&quot;,&quot;title&quot;:&quot;Test Video&quot;,&quot;thumbnail&quot;:{&quot;url&quot;:&quot;https://example.com/thumb.M&quot;},&quot;count&quot;:{&quot;view&quot;:1000,&quot;comment&quot;:100,&quot;mylist&quot;:50,&quot;like&quot;:200},&quot;tags&quot;:[&quot;tag1&quot;,&quot;tag2&quot;],&quot;owner&quot;:{&quot;id&quot;:&quot;user123&quot;,&quot;name&quot;:&quot;Test User&quot;,&quot;iconUrl&quot;:&quot;https://example.com/icon.jpg&quot;},&quot;registeredAt&quot;:&quot;2024-01-01T00:00:00Z&quot;}]},&quot;$getTeibanRankingFeaturedKeyAndTrendTags&quot;:{&quot;data&quot;:{&quot;trendTags&quot;:[&quot;trend1&quot;,&quot;trend2&quot;]}}}}}}">
      </head>
    </html>
  `

  const mockVideoPageHTML = `
    <html>
      <body>
        <div class="TagList">
          <a class="TagItem">VideoTag1</a>
          <a class="TagItem">VideoTag2</a>
          <a class="TagItem">VideoTag3</a>
        </div>
      </body>
    </html>
  `

  describe('scrapeRankingPage', () => {
    it('ランキングページを正しくスクレイピング', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        text: async () => mockRankingHTML
      })

      const module = await import('@/lib/scraper')
      const result = await module.scrapeRankingPage('all', '24h')

      expect(mockFetch).toHaveBeenCalledWith(
        'https://www.nicovideo.jp/ranking/genre/all?term=24h',
        expect.objectContaining({
          headers: expect.objectContaining({
            'User-Agent': expect.stringContaining('Googlebot')
          })
        })
      )

      expect(result.items).toHaveLength(1)
      expect(result.items[0]).toMatchObject({
        rank: 1,
        id: 'sm123',
        title: 'Test Video',
        views: 1000,
        comments: 100,
        mylists: 50,
        likes: 200
      })
    })

    it('hourly期間でも正しく動作', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        text: async () => mockRankingHTML
      })

      const module = await import('@/lib/scraper')
      await module.scrapeRankingPage('game', 'hour')

      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('term=hour'),
        expect.any(Object)
      )
    })

    it('タグ指定でランキングを取得', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        text: async () => mockRankingHTML
      })

      const module = await import('@/lib/scraper')
      await module.scrapeRankingPage('all', '24h', 'VOCALOID')

      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('tag=VOCALOID'),
        expect.any(Object)
      )
    })

    it('ページ指定でランキングを取得', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        text: async () => mockRankingHTML
      })

      const module = await import('@/lib/scraper')
      await module.scrapeRankingPage('all', '24h', undefined, 2)

      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('page=2'),
        expect.any(Object)
      )
    })

    it('チャンネル動画も正しく処理', async () => {
      const channelHTML = mockRankingHTML.replace(
        '"owner":{"id":"user123","name":"Test User","iconUrl":"https://example.com/icon.jpg"}',
        '"channel":{"id":"ch123","name":"Test Channel","iconUrl":"https://example.com/ch-icon.jpg"}'
      )

      mockFetch.mockResolvedValueOnce({
        ok: true,
        text: async () => channelHTML
      })

      const module = await import('@/lib/scraper')
      const result = await module.scrapeRankingPage('all', '24h')

      expect(result.items[0]).toMatchObject({
        authorId: 'ch123',
        authorName: 'Test Channel',
        authorIcon: 'https://example.com/ch-icon.jpg'
      })
    })

    it('エラー時は空の結果を返す', async () => {
      mockFetch.mockRejectedValueOnce(new Error('Network error'))

      const module = await import('@/lib/scraper')
      const result = await module.scrapeRankingPage('all', '24h')

      expect(result.items).toEqual([])
    })

    it('403エラーの場合も空の結果を返す', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 403
      })

      const module = await import('@/lib/scraper')
      const result = await module.scrapeRankingPage('all', '24h')

      expect(result.items).toEqual([])
    })

    it('サムネイルURLを.Mから.Lに変換', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        text: async () => mockRankingHTML
      })

      const module = await import('@/lib/scraper')
      const result = await module.scrapeRankingPage('all', '24h')

      expect(result.items[0].thumbURL).toBe('https://example.com/thumb.L')
    })

    it('リトライロジックが動作する', async () => {
      // 1回目失敗、2回目成功
      mockFetch
        .mockRejectedValueOnce(new Error('Temporary error'))
        .mockResolvedValueOnce({
          ok: true,
          text: async () => mockRankingHTML
        })

      const module = await import('@/lib/scraper')
      const result = await module.scrapeRankingPage('all', '24h')

      expect(mockFetch).toHaveBeenCalledTimes(2)
      expect(result.items).toHaveLength(1)
    })
  })

  describe('scrapeVideoPage', () => {
    it('動画ページからタグを取得', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        text: async () => mockVideoPageHTML
      })

      const module = await import('@/lib/scraper')
      const tags = await module.scrapeVideoPage('sm123')

      expect(mockFetch).toHaveBeenCalledWith(
        'https://www.nicovideo.jp/watch/sm123',
        expect.objectContaining({
          headers: expect.objectContaining({
            'User-Agent': expect.stringContaining('Googlebot')
          })
        })
      )

      expect(tags).toEqual(['VideoTag1', 'VideoTag2', 'VideoTag3'])
    })

    it('エラー時は空配列を返す', async () => {
      mockFetch.mockRejectedValueOnce(new Error('Network error'))

      const module = await import('@/lib/scraper')
      const tags = await module.scrapeVideoPage('sm123')

      expect(tags).toEqual([])
    })

    it('タグが見つからない場合は空配列を返す', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        text: async () => '<html><body></body></html>'
      })

      const module = await import('@/lib/scraper')
      const tags = await module.scrapeVideoPage('sm123')

      expect(tags).toEqual([])
    })
  })

  describe('scrapeRankingWithTags', () => {
    it('ランキングデータにタグ情報を追加', async () => {
      // ランキングページ
      mockFetch.mockResolvedValueOnce({
        ok: true,
        text: async () => mockRankingHTML
      })

      // 動画ページ
      mockFetch.mockResolvedValueOnce({
        ok: true,
        text: async () => mockVideoPageHTML
      })

      const module = await import('@/lib/scraper')
      const result = await module.scrapeRankingWithTags('all', '24h')

      expect(mockFetch).toHaveBeenCalledTimes(2)
      expect(result.items[0].tags).toEqual(['VideoTag1', 'VideoTag2', 'VideoTag3'])
    })

    it('複数ページのランキングを取得', async () => {
      const page1HTML = mockRankingHTML
      const page2HTML = mockRankingHTML.replace('sm123', 'sm456').replace('Test Video', 'Test Video 2')

      mockFetch
        // ページ1
        .mockResolvedValueOnce({
          ok: true,
          text: async () => page1HTML
        })
        // ページ1の動画タグ
        .mockResolvedValueOnce({
          ok: true,
          text: async () => mockVideoPageHTML
        })
        // ページ2
        .mockResolvedValueOnce({
          ok: true,
          text: async () => page2HTML
        })
        // ページ2の動画タグ
        .mockResolvedValueOnce({
          ok: true,
          text: async () => mockVideoPageHTML
        })

      const module = await import('@/lib/scraper')
      const result = await module.scrapeRankingWithTags('all', '24h', undefined, 2)

      expect(result.items).toHaveLength(2)
      expect(result.items[0].id).toBe('sm123')
      expect(result.items[1].id).toBe('sm456')
    })

    it('タグ取得エラーでも処理を継続', async () => {
      mockFetch
        .mockResolvedValueOnce({
          ok: true,
          text: async () => mockRankingHTML
        })
        .mockRejectedValueOnce(new Error('Tag fetch error'))

      const module = await import('@/lib/scraper')
      const result = await module.scrapeRankingWithTags('all', '24h')

      expect(result.items).toHaveLength(1)
      expect(result.items[0].tags).toEqual(['tag1', 'tag2']) // 元のタグを保持
    })
  })

  describe('extractGenreTrendTags', () => {
    it('トレンドタグを正しく抽出', async () => {
      const htmlWithTrendTags = mockRankingHTML.replace(
        '"trendTags":["trend1","trend2"]',
        '"trendTags":["人気タグ1","人気タグ2","人気タグ3"]'
      )

      mockFetch.mockResolvedValueOnce({
        ok: true,
        text: async () => htmlWithTrendTags
      })

      const module = await import('@/lib/scraper')
      const tags = await module.extractGenreTrendTags('all', '24h')

      expect(tags).toEqual(['人気タグ1', '人気タグ2', '人気タグ3'])
    })

    it('トレンドタグがない場合は空配列を返す', async () => {
      const htmlWithoutTrendTags = mockRankingHTML.replace(
        '"$getTeibanRankingFeaturedKeyAndTrendTags"',
        '"other"'
      )

      mockFetch.mockResolvedValueOnce({
        ok: true,
        text: async () => htmlWithoutTrendTags
      })

      const module = await import('@/lib/scraper')
      const tags = await module.extractGenreTrendTags('all', '24h')

      expect(tags).toEqual([])
    })

    it('エラー時は空配列を返す', async () => {
      mockFetch.mockRejectedValueOnce(new Error('Network error'))

      const module = await import('@/lib/scraper')
      const tags = await module.extractGenreTrendTags('all', '24h')

      expect(tags).toEqual([])
    })
  })

  describe('ジャンルID変換', () => {
    it('正しいジャンルIDでリクエスト', async () => {
      const genres = [
        { genre: 'all', id: 'all' },
        { genre: 'game', id: 'game' },
        { genre: 'anime', id: 'anime' },
        { genre: 'technology', id: 'technology' },
        { genre: 'other', id: 'other' }
      ]

      mockFetch.mockResolvedValue({
        ok: true,
        text: async () => mockRankingHTML
      })

      const module = await import('@/lib/scraper')
      
      for (const { genre, id } of genres) {
        await module.scrapeRankingPage(genre, '24h')
        expect(mockFetch).toHaveBeenLastCalledWith(
          expect.stringContaining(`/ranking/genre/${id}`),
          expect.any(Object)
        )
      }
    })
  })

  describe('データ正規化', () => {
    it('不完全なデータも正しく処理', async () => {
      const incompleteHTML = mockRankingHTML.replace(
        '"count":{"view":1000,"comment":100,"mylist":50,"like":200}',
        '"count":{"view":1000}' // comment, mylist, likeがない
      )

      mockFetch.mockResolvedValueOnce({
        ok: true,
        text: async () => incompleteHTML
      })

      const module = await import('@/lib/scraper')
      const result = await module.scrapeRankingPage('all', '24h')

      expect(result.items[0]).toMatchObject({
        views: 1000,
        comments: undefined,
        mylists: undefined,
        likes: undefined
      })
    })

    it('異なる時刻フィールドも処理', async () => {
      const startTimeHTML = mockRankingHTML.replace(
        '"registeredAt":"2024-01-01T00:00:00Z"',
        '"startTime":"2024-02-01T00:00:00Z"'
      )

      mockFetch.mockResolvedValueOnce({
        ok: true,
        text: async () => startTimeHTML
      })

      const module = await import('@/lib/scraper')
      const result = await module.scrapeRankingPage('all', '24h')

      expect(result.items[0].registeredAt).toBe('2024-02-01T00:00:00Z')
    })
  })
})