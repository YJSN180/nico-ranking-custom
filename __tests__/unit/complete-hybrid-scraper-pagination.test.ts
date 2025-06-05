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

  it('should fetch 100 items per page (page 1 by default)', async () => {
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

    // 100件取得をテスト（デフォルトはページ1）
    const result = await fetchRanking('other', null, 'hour')
    
    expect(result.items).toHaveLength(100)
    expect(result.items[0]?.id).toBe('sm1000')
    expect(result.items[0]?.title).toBe('動画タイトル 1')
    expect(result.items[0]?.rank).toBe(1)
    expect(result.items[99]?.id).toBe('sm1099')
    expect(result.items[99]?.rank).toBe(100)
    
    // 人気タグも取得できているか
    expect(result.popularTags).toEqual(['タグ1', 'タグ2', 'タグ3'])
    
    // 1回のfetch呼び出しを確認（1ページのみ）
    expect(vi.mocked(fetch)).toHaveBeenCalledTimes(1)
  })

  it('should fetch specific page when page parameter is provided', async () => {
    // ページ2を指定して取得
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
      // page 3: 100件
      Array.from({ length: 100 }, (_, i) => ({
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

    const result = await fetchRanking('other', null, 'hour', 100, 2)
    
    expect(result.items).toHaveLength(100)
    expect(result.items[0]?.id).toBe('sm2000')
    expect(result.items[0]?.rank).toBe(101) // ページ2の最初は101位
    expect(result.items[99]?.id).toBe('sm2099')
    expect(result.items[99]?.rank).toBe(200)
    
    // 1回のfetch呼び出しを確認（ページ2のみ）
    expect(vi.mocked(fetch)).toHaveBeenCalledTimes(1)
    expect(vi.mocked(fetch)).toHaveBeenCalledWith(
      expect.stringContaining('page=2'),
      expect.any(Object)
    )
  })

  it('should respect limit parameter when less than 100', async () => {
    // 50件のみ要求
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

    const result = await fetchRanking('other', null, 'hour', 50)
    
    expect(result.items).toHaveLength(50)
    expect(result.items[0]?.id).toBe('sm1000')
    expect(result.items[49]?.id).toBe('sm1049')
    expect(result.items[49]?.rank).toBe(50)
    
    // 1ページ分のみ取得
    expect(vi.mocked(fetch)).toHaveBeenCalledTimes(1)
    expect(vi.mocked(fetch)).toHaveBeenCalledWith(
      expect.stringContaining('https://www.nicovideo.jp/ranking/genre/ramuboyn?term=hour'),
      expect.any(Object)
    )
  })
})