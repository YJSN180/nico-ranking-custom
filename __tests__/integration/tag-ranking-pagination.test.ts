import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'
import { GET } from '@/app/api/ranking/route'
import { getTagRanking, getGenreRanking } from '@/lib/cloudflare-kv'
import { scrapeRankingPage } from '@/lib/scraper'
import { filterRankingItemsServer } from '@/lib/ng-filter-server'
import { addToServerDerivedNGList } from '@/lib/ng-list-server'

vi.mock('@/lib/cloudflare-kv', () => ({
  getTagRanking: vi.fn(),
  setTagRanking: vi.fn(),
  getGenreRanking: vi.fn(),
}))

vi.mock('@/lib/scraper', () => ({
  scrapeRankingPage: vi.fn(),
}))

vi.mock('@/lib/ng-filter-server', () => ({
  filterRankingItemsServer: vi.fn(),
  filterRankingDataServer: vi.fn(),
}))

vi.mock('@/lib/ng-list-server', () => ({
  addToServerDerivedNGList: vi.fn(),
  getServerNGList: vi.fn().mockResolvedValue({
    videoIds: [],
    videoTitles: [],
    authorIds: [],
    authorNames: [],
    derivedVideoIds: [],
  }),
}))

describe('タグ別ランキングの動的読み込み', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    // 環境変数をモック
    vi.stubEnv('CLOUDFLARE_KV_NAMESPACE_ID', 'test-namespace')
  })

  afterEach(() => {
    vi.unstubAllEnvs()
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

    // スクレイピングのモック - 複数回呼ばれるので、ページごとに異なるデータを返す
    let callCount = 0
    vi.mocked(scrapeRankingPage).mockImplementation(async () => {
      callCount++
      const pageItems = Array.from({ length: 100 }, (_, i) => ({
        rank: (callCount - 1) * 100 + i + 1,
        id: `sm${(callCount - 1) * 100 + 100 + i}`,
        title: `テスト動画${(callCount - 1) * 100 + i + 1}`,
        thumbURL: 'https://example.com/thumb.jpg',
        views: 1000,
        authorName: i % 20 === 0 ? '蠍媛' : `作者${(callCount - 1) * 100 + i}`,
      }))
      return { 
        items: pageItems,
        popularTags: callCount === 1 ? ['タグ1', 'タグ2'] : []
      }
    })

    // NGフィルタリングのモック - 動的に実装
    vi.mocked(filterRankingItemsServer).mockImplementation(async (items) => {
      const filtered = items.filter((item: any) => item.authorName !== '蠍媛')
      return {
        filteredItems: filtered,
        newDerivedIds: [],
        filteredCount: items.length - filtered.length
      }
    })

    // KVキャッシュなし
    vi.mocked(getTagRanking).mockResolvedValue(null)
    
    // 派生NGリストへの追加をモック
    vi.mocked(addToServerDerivedNGList).mockResolvedValue(undefined)

    // APIリクエスト
    const request = new NextRequest('http://localhost:3000/api/ranking?genre=other&period=24h&tag=インタビューシリーズ&page=1')
    const response = await GET(request)
    
    // アサーション
    expect(response.status).toBe(200)
    
    const data = await response.json()
    expect(data.items).toBeDefined()
    
    // APIは300件確保しようとするため、4回フェッチして380件（95×4）取得
    expect(data.totalCached).toBeGreaterThanOrEqual(300)
    expect(data.hasMore).toBe(true) // 380件あるので次のページがある
    expect(data.items.length).toBe(100) // ページ1は100件
    expect(data.items[0].rank).toBe(1)
    expect(data.items[99].rank).toBe(100)
    
    // NG作者が含まれていないことを確認
    expect(data.items.every((item: any) => item.authorName !== '蠍媛')).toBe(true)
    
    // 4回フェッチされたことを確認（300件以上確保するため）
    expect(scrapeRankingPage).toHaveBeenCalledTimes(4)
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

    vi.mocked(scrapeRankingPage).mockResolvedValue({ 
      items: mockItems,
      popularTags: []
    })

    vi.mocked(filterRankingItemsServer).mockImplementation(async (items) => ({
      filteredItems: items,
      newDerivedIds: [],
      filteredCount: 0
    }))

    vi.mocked(getTagRanking).mockResolvedValue(null)

    const request = new NextRequest('http://localhost:3000/api/ranking?genre=other&period=24h&tag=インタビューシリーズ&page=2')
    const response = await GET(request)
    const data = await response.json()

    expect(response.status).toBe(200)
    expect(data.items).toBeDefined()
    expect(data.items.length).toBe(100)
    expect(data.items[0].rank).toBe(101) // ページ2の最初は101
    expect(data.items[99].rank).toBe(200) // ページ2の最後は200
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

    // 最初の呼び出しで30件返す
    vi.mocked(scrapeRankingPage)
      .mockResolvedValueOnce({ 
        items: mockItems,
        popularTags: []
      })
      // 2回目の呼び出しで60件返す（合計90件にする）
      .mockResolvedValueOnce({ 
        items: Array.from({ length: 60 }, (_, i) => ({
          rank: 31 + i,
          id: `sm${330 + i}`,
          title: `追加動画${i + 1}`,
          thumbURL: 'https://example.com/thumb.jpg',
          views: 3000,
          authorName: `作者${30 + i}`,
        })),
        popularTags: []
      })
      // 3回目の呼び出しで空を返す
      .mockResolvedValueOnce({ 
        items: [],
        popularTags: []
      })

    vi.mocked(filterRankingItemsServer).mockImplementation(async (items) => ({
      filteredItems: items,
      newDerivedIds: [],
      filteredCount: 0
    }))

    vi.mocked(getTagRanking).mockResolvedValue(null)

    const request = new NextRequest('http://localhost:3000/api/ranking?genre=other&period=24h&tag=インタビューシリーズ&page=3')
    const response = await GET(request)
    const data = await response.json()

    expect(response.status).toBe(200)
    expect(data.items).toBeDefined()
    expect(data.items.length).toBe(0) // ページ3（201-300位）にはアイテムがない（90件しか取得できなかったため）
    expect(data.hasMore).toBe(false) // これ以上のページはない
    expect(data.totalCached).toBe(90) // 取得できた総数
  })

  it('cronが作成した500件のキャッシュからページ1を取得する', async () => {
    // cronが作成した500件のキャッシュ
    const cachedData = Array.from({ length: 500 }, (_, i) => ({
      rank: i + 1,
      id: `sm${100 + i}`,
      title: `キャッシュ動画${i + 1}`,
      thumbURL: 'https://example.com/thumb.jpg',
      views: 1000,
      authorName: `作者${i}`,
    }))

    vi.mocked(getTagRanking).mockResolvedValue(cachedData)

    const request = new NextRequest('http://localhost:3000/api/ranking?genre=other&period=24h&tag=インタビューシリーズ&page=1')
    const response = await GET(request)
    const data = await response.json()

    expect(response.status).toBe(200)
    expect(data.items).toBeDefined()
    expect(data.items.length).toBe(100) // 最初の100件
    expect(data.hasMore).toBe(true) // 500件中100件なのでまだある
    expect(data.totalCached).toBe(500) // キャッシュ総数
    expect(response.headers.get('X-Cache-Status')).toBe('CF-HIT')
  })
})