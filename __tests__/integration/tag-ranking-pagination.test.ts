import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
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

describe('タグ別ランキングの動的読み込み（300件まで）', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    // 環境変数をモック
    vi.stubEnv('CLOUDFLARE_KV_NAMESPACE_ID', 'test-namespace')
  })

  afterEach(() => {
    vi.unstubAllEnvs()
  })

  it('タグ別ランキングで最大300件を返す', async () => {
    // モックデータの準備（300件）
    const mockItems = Array.from({ length: 300 }, (_, i) => ({
      rank: i + 1,
      id: `sm${100 + i}`,
      title: `タグ動画 ${i + 1}`,
      thumbURL: `https://example.com/thumb${i + 1}.jpg`,
      views: 1000 - i,
      comments: 10,
      mylists: 5,
      likes: 1
    }))

    // Cloudflare KVから300件取得
    vi.mocked(getTagRanking).mockResolvedValue(mockItems)

    const request = new NextRequest('http://localhost:3000/api/ranking?genre=all&tag=音MAD', {
      method: 'GET',
    })

    const response = await GET(request)
    const data = await response.json()

    expect(response.status).toBe(200)
    expect(data.items).toHaveLength(300)
    expect(data.items[0].rank).toBe(1)
    expect(data.items[299].rank).toBe(300)
    expect(data.hasMore).toBe(false) // ページネーションなし
    expect(data.totalCached).toBe(300)
  })

  it('KVにデータがない場合は動的にスクレイピングして300件を取得', async () => {
    // KVから取得できない
    vi.mocked(getTagRanking).mockResolvedValue(null)

    // スクレイパーのモック（ページごとに100件ずつ返す）
    vi.mocked(scrapeRankingPage).mockImplementation(async (genre, period, tag, limit, page) => {
      const items = Array.from({ length: 100 }, (_, i) => ({
        rank: ((page || 1) - 1) * 100 + i + 1,
        id: `sm${((page || 1) - 1) * 100 + i + 1}`,
        title: `スクレイプ動画 ${((page || 1) - 1) * 100 + i + 1}`,
        thumbURL: `https://example.com/thumb${((page || 1) - 1) * 100 + i + 1}.jpg`,
        views: 2000 - ((page || 1) - 1) * 100 - i
      }))
      return { items, popularTags: [] }
    })

    // NGフィルタリングのモック（全て通過）
    vi.mocked(filterRankingItemsServer).mockImplementation(async (items) => ({
      filteredItems: items,
      newDerivedIds: []
    }))

    const request = new NextRequest('http://localhost:3000/api/ranking?genre=game&tag=RTA', {
      method: 'GET',
    })

    const response = await GET(request)
    const data = await response.json()

    expect(response.status).toBe(200)
    expect(data.items).toHaveLength(300)
    expect(data.items[0].rank).toBe(1)
    expect(data.items[299].rank).toBe(300)
    expect(data.hasMore).toBe(false)
    
    // スクレイパーが3回呼ばれたことを確認（300件取得のため）
    expect(scrapeRankingPage).toHaveBeenCalledTimes(3)
  })

  it('データが少ない場合はあるだけ返す', async () => {
    // 150件のモックデータ
    const mockItems = Array.from({ length: 150 }, (_, i) => ({
      rank: i + 1,
      id: `sm${200 + i}`,
      title: `少数動画 ${i + 1}`,
      thumbURL: `https://example.com/thumb${i + 1}.jpg`,
      views: 500 - i
    }))

    vi.mocked(getTagRanking).mockResolvedValue(mockItems)

    const request = new NextRequest('http://localhost:3000/api/ranking?genre=other&tag=MMD', {
      method: 'GET',
    })

    const response = await GET(request)
    const data = await response.json()

    expect(response.status).toBe(200)
    expect(data.items).toHaveLength(150)
    expect(data.hasMore).toBe(false)
    expect(data.totalCached).toBe(150)
  })

  it('NGフィルタリング後に300件を確保するため追加取得する', async () => {
    // KVから取得できない
    vi.mocked(getTagRanking).mockResolvedValue(null)

    let callCount = 0
    // スクレイパーのモック（最初の2ページは半分がNGでフィルタされる）
    vi.mocked(scrapeRankingPage).mockImplementation(async (genre, period, tag, limit, page) => {
      callCount++
      const items = Array.from({ length: 100 }, (_, i) => ({
        rank: ((page || 1) - 1) * 100 + i + 1,
        id: `sm${((page || 1) - 1) * 100 + i + 1}`,
        title: `動画 ${((page || 1) - 1) * 100 + i + 1}`,
        thumbURL: `https://example.com/thumb.jpg`,
        views: 1000
      }))
      return { items, popularTags: [] }
    })

    // NGフィルタリングのモック（最初の3ページは半分フィルタ、以降は全て通過）
    vi.mocked(filterRankingItemsServer).mockImplementation(async (items) => {
      if (callCount <= 3) {
        // 半分をフィルタ
        return {
          filteredItems: items.slice(0, 50),
          newDerivedIds: []
        }
      }
      // 全て通過
      return {
        filteredItems: items,
        newDerivedIds: []
      }
    })

    const request = new NextRequest('http://localhost:3000/api/ranking?genre=entertainment&tag=踊ってみた', {
      method: 'GET',
    })

    const response = await GET(request)
    const data = await response.json()

    expect(response.status).toBe(200)
    // APIは最大300件までしか返さない
    expect(data.items.length).toBeLessThanOrEqual(300)
    expect(data.items[0].rank).toBe(1) // ランク番号は再割り当てされる
    expect(data.hasMore).toBe(false)
    
    // 300件確保するために6ページ取得が必要（3ページ×50件 + 3ページ×100件 = 450件から350件フィルタ後）
    expect(scrapeRankingPage).toHaveBeenCalledTimes(6)
  })
})