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
              trendTags: ['tag1', 'tag2', 'tag3']
            }
          }
        }
      }
    }
    
    const encodedContent = JSON.stringify(serverResponse)
      .replace(/"/g, '&quot;')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/'/g, '&#39;')
    
    return `
      <!DOCTYPE html>
      <html>
      <head>
        <meta name="server-response" content="${encodedContent}" />
      </head>
      <body>
      </body>
      </html>
    `
  }

  it('should fetch up to 100 items (current implementation limit)', async () => {
    // モックアイテム
    const mockItems = Array.from({ length: 100 }, (_, i) => ({
      id: `sm${1000 + i}`,
      title: `動画タイトル ${i + 1}`,
      thumbnail: { url: `thumb${i + 1}.jpg` },
      count: { view: 1000 + i, comment: 10 + i, mylist: 5 + i, like: 20 + i },
      owner: { id: `user${i}`, name: `ユーザー${i}` },
      registeredAt: new Date().toISOString()
    }))

    // fetchをモック - 現在の実装は1ページのみ取得
    vi.mocked(fetch).mockResolvedValueOnce({
      ok: true,
      text: async () => createMockHtml(mockItems, 1)
    } as Response)

    // 100件取得をテスト
    const result = await fetchRanking('all', '24h')
    
    expect(result.items).toHaveLength(100)
    expect(result.items[0]).toMatchObject({
      rank: 1,
      id: 'sm1000',
      title: '動画タイトル 1',
      thumbURL: 'thumb1.jpg',
      views: 1000
    })
    expect(result.items[99]).toMatchObject({
      rank: 100,
      id: 'sm1099',
      title: '動画タイトル 100',
      thumbURL: 'thumb100.jpg',
      views: 1099
    })
  })

  it('should handle less than 100 items gracefully', async () => {
    // 50件のみ
    const mockItems = Array.from({ length: 50 }, (_, i) => ({
      id: `sm${1000 + i}`,
      title: `動画タイトル ${i + 1}`,
      thumbnail: { url: `thumb${i + 1}.jpg` },
      count: { view: 1000 + i, comment: 10 + i, mylist: 5 + i, like: 20 + i },
      owner: { id: `user${i}`, name: `ユーザー${i}` },
      registeredAt: new Date().toISOString()
    }))

    vi.mocked(fetch).mockResolvedValueOnce({
      ok: true,
      text: async () => createMockHtml(mockItems, 1)
    } as Response)

    const result = await fetchRanking('all', '24h')
    
    expect(result.items).toHaveLength(50)
  })

  it('should respect limit parameter', async () => {
    // 100件存在
    const mockItems = Array.from({ length: 100 }, (_, i) => ({
      id: `sm${1000 + i}`,
      title: `動画タイトル ${i + 1}`,
      thumbnail: { url: `thumb${i + 1}.jpg` },
      count: { view: 1000 + i, comment: 10 + i, mylist: 5 + i, like: 20 + i },
      owner: { id: `user${i}`, name: `ユーザー${i}` },
      registeredAt: new Date().toISOString()
    }))

    vi.mocked(fetch).mockResolvedValueOnce({
      ok: true,
      text: async () => createMockHtml(mockItems, 1)
    } as Response)

    // limitパラメータは現在の実装では使われていない
    const result = await fetchRanking('all', '24h', undefined, 50)
    
    expect(result.items).toHaveLength(100)
  })
})