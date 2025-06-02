import { describe, it, expect, vi, beforeEach } from 'vitest'
import { GET } from '@/app/api/ranking/route'
import { kv } from '@vercel/kv'
import * as scraperModule from '@/lib/scraper'
import * as ngFilterModule from '@/lib/ng-filter'

vi.mock('@vercel/kv', () => ({
  kv: {
    get: vi.fn(),
    set: vi.fn(),
  },
}))

vi.mock('@/lib/scraper')
vi.mock('@/lib/ng-filter')

describe('タグ別ランキングの動的読み込み', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('ページ1でNGフィルタリング後100件を確保する', async () => {
    // モックデータの準備
    const mockItems = Array.from({ length: 100 }, (_, i) => ({
      rank: i + 1,
      id: `sm${100 + i}`,
      title: `テスト動画${i + 1}`,
      thumbURL: 'https://example.com/thumb.jpg',
      views: 1000,
      authorName: i % 20 === 0 ? '蠍媛' : `作者${i}`, // 5%がNG作者
    }))

    // スクレイピングのモック
    vi.spyOn(scraperModule, 'scrapeRankingPage')
      .mockImplementationOnce(async () => ({ 
        items: mockItems,
        popularTags: ['タグ1', 'タグ2']
      }))
      .mockImplementationOnce(async () => ({ 
        items: mockItems.slice(0, 10), // 2ページ目は10件
        popularTags: []
      }))

    // NGフィルタリングのモック（5%を除外）
    vi.spyOn(ngFilterModule, 'filterRankingData').mockImplementation(async ({ items }) => ({
      items: items.filter((item: any) => item.authorName !== '蠍媛'),
      newDerivedIds: []
    }) as any)

    // KVキャッシュなし
    vi.mocked(kv.get).mockResolvedValue(null)

    // APIリクエスト
    const request = new Request('http://localhost:3000/api/ranking?genre=other&period=24h&tag=インタビューシリーズ&page=1')
    const response = await GET(request)
    const data = await response.json()

    // アサーション
    expect(response.status).toBe(200)
    expect(Array.isArray(data)).toBe(true)
    expect(data.length).toBe(100) // ちょうど100件
    expect(data[0].rank).toBe(1)
    expect(data[99].rank).toBe(100)
    
    // NG作者が含まれていないことを確認
    expect(data.every((item: any) => item.authorName !== '蠍媛')).toBe(true)
    
    // 2ページ分取得したことを確認
    expect(scraperModule.scrapeRankingPage).toHaveBeenCalledTimes(2)
  })

  it('ページ2で正しいランク番号が割り当てられる', async () => {
    // モックデータ
    const mockItems = Array.from({ length: 100 }, (_, i) => ({
      rank: i + 1,
      id: `sm${200 + i}`,
      title: `ページ2動画${i + 1}`,
      thumbURL: 'https://example.com/thumb.jpg',
      views: 2000,
      authorName: `作者${i}`,
    }))

    vi.spyOn(scraperModule, 'scrapeRankingPage').mockResolvedValue({ 
      items: mockItems,
      popularTags: []
    })

    vi.spyOn(ngFilterModule, 'filterRankingData').mockImplementation(async ({ items }) => ({
      items: items,
      newDerivedIds: []
    }) as any)

    vi.mocked(kv.get).mockResolvedValue(null)

    const request = new Request('http://localhost:3000/api/ranking?genre=other&period=24h&tag=インタビューシリーズ&page=2')
    const response = await GET(request)
    const data = await response.json()

    expect(response.status).toBe(200)
    expect(data.length).toBe(100)
    expect(data[0].rank).toBe(101) // ページ2の最初は101
    expect(data[99].rank).toBe(200) // ページ2の最後は200
  })

  it('データが少ない場合はあるだけ返す', async () => {
    const mockItems = Array.from({ length: 30 }, (_, i) => ({
      rank: i + 1,
      id: `sm${300 + i}`,
      title: `最後の動画${i + 1}`,
      thumbURL: 'https://example.com/thumb.jpg',
      views: 3000,
      authorName: `作者${i}`,
    }))

    vi.spyOn(scraperModule, 'scrapeRankingPage').mockResolvedValue({ 
      items: mockItems,
      popularTags: []
    })

    vi.spyOn(ngFilterModule, 'filterRankingData').mockImplementation(async ({ items }) => ({
      items: items,
      newDerivedIds: []
    }) as any)

    vi.mocked(kv.get).mockResolvedValue(null)

    const request = new Request('http://localhost:3000/api/ranking?genre=other&period=24h&tag=インタビューシリーズ&page=3')
    const response = await GET(request)
    const data = await response.json()

    expect(response.status).toBe(200)
    expect(data.length).toBe(30) // 30件しかない
    expect(data[0].rank).toBe(201) // ページ3の最初
    expect(data[29].rank).toBe(230) // ページ3の最後
  })

  it('キャッシュからデータを取得してもNGフィルタリングを適用する', async () => {
    const cachedData = Array.from({ length: 100 }, (_, i) => ({
      rank: i + 1,
      id: `sm${100 + i}`,
      title: `キャッシュ動画${i + 1}`,
      thumbURL: 'https://example.com/thumb.jpg',
      views: 1000,
      authorName: i % 10 === 0 ? '蠍媛' : `作者${i}`, // 10%がNG作者
    }))

    vi.mocked(kv.get).mockResolvedValue(cachedData)

    vi.spyOn(ngFilterModule, 'filterRankingData').mockImplementation(async ({ items }) => ({
      items: items.filter((item: any) => item.authorName !== '蠍媛'),
      newDerivedIds: []
    }) as any)

    const request = new Request('http://localhost:3000/api/ranking?genre=other&period=24h&tag=インタビューシリーズ&page=1')
    const response = await GET(request)
    const data = await response.json()

    expect(response.status).toBe(200)
    expect(data.length).toBe(90) // 100件から10件フィルタリング
    expect(data.every((item: any) => item.authorName !== '蠍媛')).toBe(true)
  })
})