import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'
import { GET } from '@/app/api/ranking/route'
import * as cloudflareKV from '@/lib/cloudflare-kv'
import * as scraperModule from '@/lib/scraper'
import * as ngFilterModule from '@/lib/ng-filter'

vi.mock('@/lib/cloudflare-kv', () => ({
  getTagRanking: vi.fn(),
  setTagRanking: vi.fn(),
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
    vi.mocked(cloudflareKV.getTagRanking).mockResolvedValue(null)

    // APIリクエスト
    const request = new NextRequest('http://localhost:3000/api/ranking?genre=other&period=24h&tag=インタビューシリーズ&page=1')
    const response = await GET(request)
    const data = await response.json()

    // アサーション
    expect(response.status).toBe(200)
    expect(data.items).toBeDefined()
    expect(data.hasMore).toBe(true) // 100件取得できたので次のページがある可能性
    expect(data.items.length).toBe(100) // ちょうど100件
    expect(data.items[0].rank).toBe(1)
    expect(data.items[99].rank).toBe(100)
    
    // NG作者が含まれていないことを確認
    expect(data.items.every((item: any) => item.authorName !== '蠍媛')).toBe(true)
    
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

    vi.mocked(cloudflareKV.getTagRanking).mockResolvedValue(null)

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
    vi.spyOn(scraperModule, 'scrapeRankingPage')
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

    vi.spyOn(ngFilterModule, 'filterRankingData').mockImplementation(async ({ items }) => ({
      items: items,
      newDerivedIds: []
    }) as any)

    vi.mocked(cloudflareKV.getTagRanking).mockResolvedValue(null)

    const request = new NextRequest('http://localhost:3000/api/ranking?genre=other&period=24h&tag=インタビューシリーズ&page=3')
    const response = await GET(request)
    const data = await response.json()

    expect(response.status).toBe(200)
    expect(data.items).toBeDefined()
    expect(data.items.length).toBe(90) // API は100件確保しようとして90件取得
    expect(data.items[0].rank).toBe(201) // ページ3の最初
    expect(data.items[89].rank).toBe(290) // ページ3の最後
  })

  it('cronが作成した300件のキャッシュからページ1を取得する', async () => {
    // cronが作成した300件のキャッシュ
    const cachedData = Array.from({ length: 300 }, (_, i) => ({
      rank: i + 1,
      id: `sm${100 + i}`,
      title: `キャッシュ動画${i + 1}`,
      thumbURL: 'https://example.com/thumb.jpg',
      views: 1000,
      authorName: `作者${i}`,
    }))

    vi.mocked(cloudflareKV.getTagRanking).mockResolvedValue(cachedData)

    const request = new NextRequest('http://localhost:3000/api/ranking?genre=other&period=24h&tag=インタビューシリーズ&page=1')
    const response = await GET(request)
    const data = await response.json()

    expect(response.status).toBe(200)
    expect(data.items).toBeDefined()
    expect(data.items.length).toBe(100) // 最初の100件
    expect(data.hasMore).toBe(true) // 300件中100件なのでまだある
    expect(data.totalCached).toBe(300) // キャッシュ総数
    expect(response.headers.get('X-Cache-Status')).toBe('HIT')
  })
})