import { describe, it, expect, vi, beforeEach } from 'vitest'
import { scrapeRankingPage, fetchVideoTagsBatch } from '@/lib/scraper'
import type { RankingItem } from '@/types/ranking'

// モックデータ
const mockRankingItems = [
  {
    id: 'sm001',
    title: 'Video 1',
    thumbURL: 'https://example.com/thumb1.jpg',
    count: { view: 1000, comment: 100, mylist: 10, like: 50 }
  },
  {
    id: 'sm002',
    title: 'Video 2',
    thumbURL: 'https://example.com/thumb2.jpg',
    count: { view: 2000, comment: 200, mylist: 20, like: 100 }
  },
  {
    id: 'sm003',
    title: 'Video 3',
    thumbURL: 'https://example.com/thumb3.jpg',
    count: { view: 3000, comment: 300, mylist: 30, like: 150 }
  }
]

const mockTagsData = new Map([
  ['sm001', ['例のアレ', 'タグA', 'タグB']],
  ['sm002', ['例のアレ', 'タグC']],
  ['sm003', ['タグA', 'タグD']]
])

// fetchをモック
global.fetch = vi.fn()

// Helper function to generate HTML response with meta tag
function generateHTMLResponse(genreId: string, label: string, items: any[], popularTags: string[] = []): string {
  const serverData = {
    data: {
      response: {
        $getTeibanRanking: {
          data: {
            featuredKey: genreId,
            label: label,
            items: items
          }
        },
        $getTeibanRankingFeaturedKeyAndTrendTags: {
          data: {
            trendTags: popularTags
          }
        }
      }
    }
  }
  
  const metaContent = JSON.stringify(serverData).replace(/"/g, '&quot;')
  
  const popularTagsHTML = popularTags.map(tag => 
    `<a class="PopularTag" href="/ranking/genre/${genreId}?tag=${encodeURIComponent(tag)}">${tag}</a>`
  ).join('\n')
  
  return `
    <html>
      <head>
        <meta name="server-response" content="${metaContent}">
      </head>
      <body>
        <div class="RankingMainContainer">
          ${popularTagsHTML}
        </div>
      </body>
    </html>
  `
}

describe('Tag Filtering', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('fetchVideoTagsBatch', () => {
    it('should fetch tags for multiple videos in parallel', async () => {
      const videoIds = ['sm001', 'sm002', 'sm003']
      
      // タグAPIのレスポンスをモック
      vi.mocked(fetch).mockImplementation((url) => {
        const urlStr = url.toString()
        if (urlStr.includes('/videos/sm001/tags')) {
          return Promise.resolve({
            ok: true,
            json: () => Promise.resolve({
              data: {
                tags: [
                  { name: '例のアレ', isLocked: true },
                  { name: 'タグA', isLocked: false },
                  { name: 'タグB', isLocked: false }
                ]
              }
            })
          } as Response)
        } else if (urlStr.includes('/videos/sm002/tags')) {
          return Promise.resolve({
            ok: true,
            json: () => Promise.resolve({
              data: {
                tags: [
                  { name: '例のアレ', isLocked: true },
                  { name: 'タグC', isLocked: false }
                ]
              }
            })
          } as Response)
        } else if (urlStr.includes('/videos/sm003/tags')) {
          return Promise.resolve({
            ok: true,
            json: () => Promise.resolve({
              data: {
                tags: [
                  { name: 'タグA', isLocked: false },
                  { name: 'タグD', isLocked: false }
                ]
              }
            })
          } as Response)
        }
        return Promise.reject(new Error('Unknown URL'))
      })
      
      const result = await fetchVideoTagsBatch(videoIds)
      
      expect(result.size).toBe(3)
      expect(result.get('sm001')).toEqual(['例のアレ', 'タグA', 'タグB'])
      expect(result.get('sm002')).toEqual(['例のアレ', 'タグC'])
      expect(result.get('sm003')).toEqual(['タグA', 'タグD'])
    })

    it('should handle API errors gracefully', async () => {
      const videoIds = ['sm001', 'sm_error']
      
      vi.mocked(fetch).mockImplementation((url) => {
        const urlStr = url.toString()
        if (urlStr.includes('/videos/sm001/tags')) {
          return Promise.resolve({
            ok: true,
            json: () => Promise.resolve({
              data: { tags: [{ name: 'タグA' }] }
            })
          } as Response)
        }
        // エラーレスポンス
        return Promise.resolve({
          ok: false,
          status: 404
        } as Response)
      })
      
      const result = await fetchVideoTagsBatch(videoIds)
      
      expect(result.size).toBe(2)
      expect(result.get('sm001')).toEqual(['タグA'])
      expect(result.get('sm_error')).toEqual([]) // エラー時は空配列
    })
  })

  describe('scrapeRankingPage with tag filtering', () => {
    it('should return up to 200 items without tag filter', async () => {
      // 200件のモックデータを生成
      const mockItems = Array.from({ length: 200 }, (_, i) => ({
        type: 'essential',
        id: `sm${String(i + 1).padStart(3, '0')}`,
        title: `Video ${i + 1}`,
        thumbnail: { url: `https://example.com/thumb${i + 1}.jpg` },
        count: { view: (i + 1) * 1000, comment: (i + 1) * 10, mylist: i + 1, like: (i + 1) * 5 }
      }))
      
      const mockHTML = generateHTMLResponse('all', '総合', mockItems)
      
      vi.mocked(fetch).mockResolvedValueOnce({
        ok: true,
        text: () => Promise.resolve(mockHTML)
      } as Response)
      
      const result = await scrapeRankingPage('all', '24h')
      
      expect(result.items).toHaveLength(200)
      expect(result.items[0]?.rank).toBe(1)
      expect(result.items[199]?.rank).toBe(200)
    })

    it('should pass tag parameter to nvapi', async () => {
      // ランキングAPIのモック（タグパラメータ付き）
      vi.mocked(fetch).mockImplementation((url) => {
        const urlStr = url.toString()
        
        if (urlStr.includes('/ranking/genre/ramuboyn') && urlStr.includes('tag=%E4%BE%8B%E3%81%AE%E3%82%A2%E3%83%AC')) {
          // タグでフィルタリングした結果を返す
          const filteredItems = mockRankingItems.filter(item => 
            item.id === 'sm001' || item.id === 'sm002'
          )
          const mockHTML = generateHTMLResponse('ramuboyn', 'その他', filteredItems, ['料理', '動物'])
          return Promise.resolve({
            ok: true,
            text: () => Promise.resolve(mockHTML)
          } as Response)
        }
        
        return Promise.reject(new Error('Unknown URL'))
      })
      
      const result = await scrapeRankingPage('ramuboyn', '24h', '例のアレ')
      
      // nvapiがフィルタリング済みの結果を返すので、そのまま使用
      expect(result.items).toHaveLength(2)
      expect(result.items[0]?.id).toBe('sm001')
      expect(result.items[0]?.rank).toBe(1)
      expect(result.items[1]?.id).toBe('sm002')
      expect(result.items[1]?.rank).toBe(2)
      
      // タグパラメータが正しくエンコードされてURLに含まれることを確認
      expect(fetch).toHaveBeenCalledWith(
        expect.stringContaining('tag=%E4%BE%8B%E3%81%AE%E3%82%A2%E3%83%AC'),
        expect.any(Object)
      )
    })

    it('should fetch popular tags for a genre (not from ranking data)', async () => {
      // ジャンルが'all'以外でタグパラメータがない場合、タグ集計は行わず
      // 人気タグAPIから取得する
      vi.mocked(fetch).mockImplementation((url) => {
        const urlStr = url.toString()
        
        if (urlStr.includes('/ranking/genre/')) {
          const popularTags = ['料理', '動物', '自然', '科学', '歴史']
          const mockHTML = generateHTMLResponse('ramuboyn', 'その他', mockRankingItems.slice(0, 50), popularTags)
          return Promise.resolve({
            ok: true,
            text: () => Promise.resolve(mockHTML)
          } as Response)
        }
        
        if (urlStr.includes('/videos/') && urlStr.includes('/tags')) {
          const videoId = urlStr.match(/\/videos\/(sm\d+)\/tags/)?.[1]
          const tags = mockTagsData.get(videoId!) || []
          return Promise.resolve({
            ok: true,
            json: () => Promise.resolve({
              data: {
                tags: tags.map(name => ({ name, isLocked: false }))
              }
            })
          } as Response)
        }
        
        return Promise.reject(new Error('Unknown URL'))
      })
      
      const result = await scrapeRankingPage('ramuboyn', '24h')
      
      // 最適化により上位50件のみタグを取得、並列度5
      // 3個のアイテムしかないので、実際の呼び出しは 1(ランキング) + 3(タグ) = 4回
      expect(fetch).toHaveBeenCalledTimes(4)
      expect(result.popularTags).toBeDefined()
      expect(result.popularTags?.length).toBeGreaterThan(0)
    })
  })

  describe('Performance considerations', () => {
    it('should fetch tags with appropriate concurrency', async () => {
      const videoIds = Array.from({ length: 30 }, (_, i) => `sm${i + 1}`)
      let concurrentRequests = 0
      let maxConcurrent = 0
      
      vi.mocked(fetch).mockImplementation(() => {
        concurrentRequests++
        maxConcurrent = Math.max(maxConcurrent, concurrentRequests)
        
        return new Promise((resolve) => {
          setTimeout(() => {
            concurrentRequests--
            resolve({
              ok: true,
              json: () => Promise.resolve({
                data: { tags: [] }
              })
            } as Response)
          }, 5) // 5ms delay to simulate network
        })
      })
      
      await fetchVideoTagsBatch(videoIds, 10) // 並列度10
      
      // 並列度が10を超えないことを確認
      expect(maxConcurrent).toBeLessThanOrEqual(10)
      expect(maxConcurrent).toBeGreaterThan(1) // 並列処理されていることを確認
    }, 10000) // 10秒のタイムアウト
  })
})