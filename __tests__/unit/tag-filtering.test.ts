import { describe, it, expect, vi, beforeEach } from 'vitest'
import { scrapeRankingPage } from '@/lib/scraper'

// fetchのモック
global.fetch = vi.fn()

describe('Tag Filtering', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('scrapeRankingPage with tag filtering', () => {
    it('should fetch ranking with tag parameter when specified', async () => {
      const mockResponse = {
        meta: { status: 200 },
        data: {
          items: [
            {
              id: 'sm001',
              title: 'VOCALOID Song 1',
              thumbnail: { largeUrl: 'https://example.com/thumb1.jpg' },
              count: { view: 1000, comment: 100, mylist: 10, like: 50 },
              owner: { id: 'user1', name: 'Producer 1', iconUrl: 'https://example.com/icon1.jpg' },
              tags: [{ name: 'VOCALOID' }, { name: '初音ミク' }]
            },
            {
              id: 'sm002',
              title: 'VOCALOID Song 2',
              thumbnail: { largeUrl: 'https://example.com/thumb2.jpg' },
              count: { view: 2000, comment: 200, mylist: 20, like: 100 },
              owner: { id: 'user2', name: 'Producer 2', iconUrl: 'https://example.com/icon2.jpg' },
              tags: [{ name: 'VOCALOID' }, { name: '初音ミク' }]
            }
          ]
        }
      }

      ;(global.fetch as any).mockResolvedValueOnce({
        ok: true,
        json: async () => mockResponse
      })

      const result = await scrapeRankingPage('vocaloid', '24h', '初音ミク')

      // タグパラメータを含むURLが呼ばれたことを確認
      expect(fetch).toHaveBeenCalledWith(
        expect.stringContaining('tag=%E5%88%9D%E9%9F%B3%E3%83%9F%E3%82%AF'),
        expect.any(Object)
      )
      
      expect(result.items.length).toBe(2)
      expect(result.items[0]?.title).toBe('VOCALOID Song 1')
    })

    it('should return up to 200 items without tag filter', async () => {
      // 200件のアイテムを生成
      const items = Array.from({ length: 200 }, (_, i) => ({
        id: `sm${i + 1}`,
        title: `Video ${i + 1}`,
        thumbnail: { largeUrl: `https://example.com/thumb${i + 1}.jpg` },
        count: { view: 1000 * (i + 1), comment: 100, mylist: 10, like: 50 }
      }))

      const mockResponse = {
        meta: { status: 200 },
        data: { items }
      }

      // HTMLレスポンスのモック
      const htmlResponse = '<html><body>Ranking page</body></html>'

      ;(global.fetch as any)
        .mockResolvedValueOnce({
          ok: true,
          json: async () => mockResponse
        })
        .mockResolvedValueOnce({
          ok: true,
          text: async () => htmlResponse
        })

      const result = await scrapeRankingPage('all', '24h')
      
      // タグフィルタなしの場合、最大200件まで取得
      expect(result.items.length).toBeLessThanOrEqual(200)
    })

    it('should fetch popular tags for a genre', async () => {
      const mockRankingResponse = {
        meta: { status: 200 },
        data: {
          items: [
            {
              id: 'sm001',
              title: 'Video 1',
              thumbnail: { largeUrl: 'https://example.com/thumb1.jpg' },
              count: { view: 1000, comment: 100, mylist: 10, like: 50 }
            }
          ]
        }
      }

      const mockPopularTagsResponse = {
        meta: { status: 200 },
        data: {
          tags: ['例のアレ', '真夏の夜の淫夢', 'ホモと見るシリーズ', 'BB先輩劇場']
        }
      }

      const htmlResponse = '<html><body>Ranking page</body></html>'

      ;(global.fetch as any)
        .mockResolvedValueOnce({
          ok: true,
          json: async () => mockRankingResponse
        })
        .mockResolvedValueOnce({
          ok: true,
          text: async () => htmlResponse
        })
        .mockResolvedValueOnce({
          ok: true,
          json: async () => mockPopularTagsResponse
        })

      const result = await scrapeRankingPage('other', '24h')
      
      expect(result.popularTags).toBeDefined()
      expect(result.popularTags).toContain('例のアレ')
    })
  })
})