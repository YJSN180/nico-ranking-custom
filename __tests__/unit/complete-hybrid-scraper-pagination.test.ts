import { describe, expect, it, vi, beforeEach } from 'vitest'
import { fetchRanking } from '@/lib/complete-hybrid-scraper'

// fetch のモック
global.fetch = vi.fn()

// NGフィルタリングをモック
vi.mock('@/lib/ng-filter', () => ({
  filterRankingData: vi.fn((data) => data)
}))

describe('fetchRanking with pagination', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  // HTMLレスポンスを生成するヘルパー関数
  function createMockHtml(items: any[], page: number = 1) {
    const serverResponse = {
      data: {
        response: {
          $getTeibanRanking: {
            data: {
              items,
              label: '総合',
              hasNext: page < 3
            }
          },
          $getTeibanRankingFeaturedKeyAndTrendTags: {
            data: {
              trendTags: ['タグ1', 'タグ2', 'タグ3']
            }
          }
        }
      }
    }
    
    const encodedData = JSON.stringify(serverResponse)
      .replace(/"/g, '&quot;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
    
    return `
      <!DOCTYPE html>
      <html>
      <head>
        <meta name="server-response" content="${encodedData}">
      </head>
      <body>
        <!-- ランキング content -->
      </body>
      </html>
    `
  }

  it('should fetch up to 300 items using page parameter', async () => {
    // 各ページのモックアイテム
    const mockPages = [
      // page 1
      Array.from({ length: 100 }, (_, i) => ({
        id: `sm${1000 + i}`,
        title: `動画タイトル ${i + 1}`,
        thumbnail: { url: `thumb${i + 1}.jpg` },
        count: { view: 1000 + i, comment: 10 + i, mylist: 5 + i, like: 20 + i },
        owner: { id: `user${i}`, name: `ユーザー${i}` },
        registeredAt: new Date().toISOString()
      })),
      // page 2
      Array.from({ length: 100 }, (_, i) => ({
        id: `sm${2000 + i}`,
        title: `動画タイトル ${101 + i}`,
        thumbnail: { url: `thumb${101 + i}.jpg` },
        count: { view: 2000 + i, comment: 20 + i, mylist: 10 + i, like: 30 + i },
        owner: { id: `user${100 + i}`, name: `ユーザー${100 + i}` },
        registeredAt: new Date().toISOString()
      })),
      // page 3
      Array.from({ length: 100 }, (_, i) => ({
        id: `sm${3000 + i}`,
        title: `動画タイトル ${201 + i}`,
        thumbnail: { url: `thumb${201 + i}.jpg` },
        count: { view: 3000 + i, comment: 30 + i, mylist: 15 + i, like: 40 + i },
        owner: { id: `user${200 + i}`, name: `ユーザー${200 + i}` },
        registeredAt: new Date().toISOString()
      }))
    ]

    // fetchをモック
    vi.mocked(fetch).mockImplementation(async (url) => {
      const urlStr = url.toString()
      
      if (urlStr.includes('page=2')) {
        return {
          ok: true,
          text: async () => createMockHtml(mockPages[1] || [], 2)
        } as Response
      } else if (urlStr.includes('page=3')) {
        return {
          ok: true,
          text: async () => createMockHtml(mockPages[2] || [], 3)
        } as Response
      } else {
        // page=1 またはpageパラメータなし
        return {
          ok: true,
          text: async () => createMockHtml(mockPages[0] || [], 1)
        } as Response
      }
    })

    // 300件取得をテスト
    const result = await fetchRanking('other', null, 'hour', 300)
    
    expect(result.items).toHaveLength(300)
    expect(result.items[0]?.id).toBe('sm1000')
    expect(result.items[0]?.title).toBe('動画タイトル 1')
    expect(result.items[0]?.rank).toBe(1)
    expect(result.items[99]?.id).toBe('sm1099')
    expect(result.items[99]?.rank).toBe(100)
    expect(result.items[100]?.id).toBe('sm2000')
    expect(result.items[100]?.title).toBe('動画タイトル 101')
    expect(result.items[100]?.rank).toBe(101)
    expect(result.items[199]?.rank).toBe(200)
    expect(result.items[200]?.id).toBe('sm3000')
    expect(result.items[200]?.rank).toBe(201)
    expect(result.items[299]?.rank).toBe(300)
    
    // 人気タグも取得できているか
    expect(result.popularTags).toEqual(['タグ1', 'タグ2', 'タグ3'])
    
    // 3回のfetch呼び出しを確認
    expect(vi.mocked(fetch)).toHaveBeenCalledTimes(3)
  })

  it('should handle less than 300 items gracefully', async () => {
    // 250件のみ存在する場合
    const mockPages = [
      // page 1: 100件
      Array.from({ length: 100 }, (_, i) => ({
        id: `sm${1000 + i}`,
        title: `動画タイトル ${i + 1}`,
        thumbnail: { url: `thumb${i + 1}.jpg` },
        count: { view: 1000 + i }
      })),
      // page 2: 100件
      Array.from({ length: 100 }, (_, i) => ({
        id: `sm${2000 + i}`,
        title: `動画タイトル ${101 + i}`,
        thumbnail: { url: `thumb${101 + i}.jpg` },
        count: { view: 2000 + i }
      })),
      // page 3: 50件のみ
      Array.from({ length: 50 }, (_, i) => ({
        id: `sm${3000 + i}`,
        title: `動画タイトル ${201 + i}`,
        thumbnail: { url: `thumb${201 + i}.jpg` },
        count: { view: 3000 + i }
      }))
    ]

    vi.mocked(fetch).mockImplementation(async (url) => {
      const urlStr = url.toString()
      
      if (urlStr.includes('page=2')) {
        return {
          ok: true,
          text: async () => createMockHtml(mockPages[1] || [], 2)
        } as Response
      } else if (urlStr.includes('page=3')) {
        return {
          ok: true,
          text: async () => createMockHtml(mockPages[2] || [], 3)
        } as Response
      } else {
        return {
          ok: true,
          text: async () => createMockHtml(mockPages[0] || [], 1)
        } as Response
      }
    })

    const result = await fetchRanking('other', null, 'hour', 300)
    
    expect(result.items).toHaveLength(250)
    expect(result.items[249]?.id).toBe('sm3049')
    expect(result.items[249]?.rank).toBe(250)
  })

  it('should respect limit parameter', async () => {
    // 150件のみ要求
    const mockPages = [
      Array.from({ length: 100 }, (_, i) => ({
        id: `sm${1000 + i}`,
        title: `動画タイトル ${i + 1}`,
        thumbnail: { url: `thumb${i + 1}.jpg` },
        count: { view: 1000 + i }
      })),
      Array.from({ length: 100 }, (_, i) => ({
        id: `sm${2000 + i}`,
        title: `動画タイトル ${101 + i}`,
        thumbnail: { url: `thumb${101 + i}.jpg` },
        count: { view: 2000 + i }
      }))
    ]

    vi.mocked(fetch).mockImplementation(async (url) => {
      const urlStr = url.toString()
      
      if (urlStr.includes('page=2')) {
        return {
          ok: true,
          text: async () => createMockHtml(mockPages[1] || [], 2)
        } as Response
      } else {
        return {
          ok: true,
          text: async () => createMockHtml(mockPages[0] || [], 1)
        } as Response
      }
    })

    const result = await fetchRanking('other', null, 'hour', 150)
    
    expect(result.items).toHaveLength(150)
    expect(result.items[149]?.rank).toBe(150)
    
    // 2ページ分取得することを確認
    expect(vi.mocked(fetch)).toHaveBeenCalledTimes(2)
    expect(vi.mocked(fetch)).toHaveBeenCalledWith(
      expect.stringContaining('https://www.nicovideo.jp/ranking/genre/other?term=hour'),
      expect.any(Object)
    )
    expect(vi.mocked(fetch)).toHaveBeenCalledWith(
      expect.stringContaining('https://www.nicovideo.jp/ranking/genre/other?term=hour&page=2'),
      expect.any(Object)
    )
  })
})