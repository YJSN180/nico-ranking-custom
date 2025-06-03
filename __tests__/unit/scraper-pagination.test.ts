import { describe, expect, it, vi, beforeEach } from 'vitest'
import { scrapeRankingPage } from '@/lib/scraper'

// fetch のモック
global.fetch = vi.fn()

describe('scrapeRankingPage with pagination', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('should fetch up to 300 items using page parameter', async () => {
    // 各ページのモックレスポンスを準備
    const mockResponses = [
      // page 1
      {
        meta: { status: 200 },
        data: {
          items: Array.from({ length: 100 }, (_, i) => ({
            id: `sm${1000 + i}`,
            title: `動画タイトル ${i + 1}`,
            thumbnail: { url: `thumb${i + 1}.jpg` },
            count: { view: 1000 + i, comment: 10 + i, mylist: 5 + i },
            owner: { id: `user${i}`, name: `ユーザー${i}` }
          }))
        }
      },
      // page 2
      {
        meta: { status: 200 },
        data: {
          items: Array.from({ length: 100 }, (_, i) => ({
            id: `sm${2000 + i}`,
            title: `動画タイトル ${101 + i}`,
            thumbnail: { url: `thumb${101 + i}.jpg` },
            count: { view: 2000 + i, comment: 20 + i, mylist: 10 + i },
            owner: { id: `user${100 + i}`, name: `ユーザー${100 + i}` }
          }))
        }
      },
      // page 3
      {
        meta: { status: 200 },
        data: {
          items: Array.from({ length: 100 }, (_, i) => ({
            id: `sm${3000 + i}`,
            title: `動画タイトル ${201 + i}`,
            thumbnail: { url: `thumb${201 + i}.jpg` },
            count: { view: 3000 + i, comment: 30 + i, mylist: 15 + i },
            owner: { id: `user${200 + i}`, name: `ユーザー${200 + i}` }
          }))
        }
      }
    ]

    // fetchをモック
    let callCount = 0
    vi.mocked(fetch).mockImplementation(async (url) => {
      const urlStr = url.toString()
      
      // pageパラメータを確認
      if (urlStr.includes('page=1') || (!urlStr.includes('page=') && callCount === 0)) {
        callCount++
        return {
          ok: true,
          json: async () => mockResponses[0]
        } as Response
      } else if (urlStr.includes('page=2')) {
        return {
          ok: true,
          json: async () => mockResponses[1]
        } as Response
      } else if (urlStr.includes('page=3')) {
        return {
          ok: true,
          json: async () => mockResponses[2]
        } as Response
      }
      
      return {
        ok: false,
        status: 404
      } as Response
    })

    // 300件取得をテスト
    const result = await scrapeRankingPage('other', 'hour', undefined, 300)
    
    expect(result.items).toHaveLength(300)
    expect(result.items[0]?.id).toBe('sm1000')
    expect(result.items[0]?.title).toBe('動画タイトル 1')
    expect(result.items[99]?.id).toBe('sm1099')
    expect(result.items[99]?.title).toBe('動画タイトル 100')
    expect(result.items[100]?.id).toBe('sm2000')
    expect(result.items[100]?.title).toBe('動画タイトル 101')
    expect(result.items[199]?.id).toBe('sm2099')
    expect(result.items[199]?.title).toBe('動画タイトル 200')
    expect(result.items[200]?.id).toBe('sm3000')
    expect(result.items[200]?.title).toBe('動画タイトル 201')
    expect(result.items[299]?.id).toBe('sm3099')
    expect(result.items[299]?.title).toBe('動画タイトル 300')
    
    // 正しいランク番号が設定されているか
    expect(result.items[0]?.rank).toBe(1)
    expect(result.items[99]?.rank).toBe(100)
    expect(result.items[100]?.rank).toBe(101)
    expect(result.items[199]?.rank).toBe(200)
    expect(result.items[200]?.rank).toBe(201)
    expect(result.items[299]?.rank).toBe(300)
  })

  it('should handle less than 300 items gracefully', async () => {
    // 250件のみ存在する場合
    const mockResponses = [
      // page 1: 100件
      {
        meta: { status: 200 },
        data: {
          items: Array.from({ length: 100 }, (_, i) => ({
            id: `sm${1000 + i}`,
            title: `動画タイトル ${i + 1}`,
            thumbnail: { url: `thumb${i + 1}.jpg` },
            count: { view: 1000 + i }
          }))
        }
      },
      // page 2: 100件
      {
        meta: { status: 200 },
        data: {
          items: Array.from({ length: 100 }, (_, i) => ({
            id: `sm${2000 + i}`,
            title: `動画タイトル ${101 + i}`,
            thumbnail: { url: `thumb${101 + i}.jpg` },
            count: { view: 2000 + i }
          }))
        }
      },
      // page 3: 50件のみ
      {
        meta: { status: 200 },
        data: {
          items: Array.from({ length: 50 }, (_, i) => ({
            id: `sm${3000 + i}`,
            title: `動画タイトル ${201 + i}`,
            thumbnail: { url: `thumb${201 + i}.jpg` },
            count: { view: 3000 + i }
          }))
        }
      }
    ]

    vi.mocked(fetch).mockImplementation(async (url) => {
      const urlStr = url.toString()
      
      if (urlStr.includes('page=1') || !urlStr.includes('page=')) {
        return {
          ok: true,
          json: async () => mockResponses[0]
        } as Response
      } else if (urlStr.includes('page=2')) {
        return {
          ok: true,
          json: async () => mockResponses[1]
        } as Response
      } else if (urlStr.includes('page=3')) {
        return {
          ok: true,
          json: async () => mockResponses[2]
        } as Response
      }
      
      return {
        ok: false,
        status: 404
      } as Response
    })

    const result = await scrapeRankingPage('other', 'hour', undefined, 300)
    
    expect(result.items).toHaveLength(250)
    expect(result.items[249]?.id).toBe('sm3049')
    expect(result.items[249]?.rank).toBe(250)
  })

  it('should respect limit parameter', async () => {
    // 150件のみ要求
    const mockResponse = {
      meta: { status: 200 },
      data: {
        items: Array.from({ length: 100 }, (_, i) => ({
          id: `sm${1000 + i}`,
          title: `動画タイトル ${i + 1}`,
          thumbnail: { url: `thumb${i + 1}.jpg` },
          count: { view: 1000 + i }
        }))
      }
    }

    vi.mocked(fetch).mockResolvedValue({
      ok: true,
      json: async () => mockResponse
    } as Response)

    const result = await scrapeRankingPage('other', 'hour', undefined, 150)
    
    // 150件要求したが、2ページ分（200件）取得することを期待
    expect(vi.mocked(fetch)).toHaveBeenCalledTimes(2)
  })
})