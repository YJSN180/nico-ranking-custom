import { describe, expect, it, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'
import { POST } from '@/app/api/cron/fetch/route'
import { kv } from '@vercel/kv'
import { scrapeRankingPage } from '@/lib/scraper'
import { filterRankingData } from '@/lib/ng-filter'
import type { RankingItem } from '@/types/ranking'

// モック
vi.mock('@vercel/kv', () => ({
  kv: {
    set: vi.fn()
  }
}))

vi.mock('@/lib/scraper', () => ({
  scrapeRankingPage: vi.fn()
}))

vi.mock('@/lib/ng-filter', () => ({
  filterRankingData: vi.fn()
}))

describe('Cron job with 300 items collection', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    process.env.CRON_SECRET = 'test-secret'
  })

  it('should collect 300 items after NG filtering', async () => {
    // 各ページのモックデータ（NGフィルタリング前）
    const createPageItems = (page: number) => 
      Array.from({ length: 100 }, (_, i) => ({
        rank: (page - 1) * 100 + i + 1,
        id: `sm${page}${i.toString().padStart(3, '0')}`,
        title: `動画タイトル ページ${page} ${i + 1}`,
        thumbURL: `https://example.com/thumb${page}${i}.jpg`,
        views: 1000 * page + i
      }))

    // scrapeRankingPageのモック（5ページ分）
    vi.mocked(scrapeRankingPage).mockImplementation(async (genre, term, tag, limit, page = 1) => {
      const items = createPageItems(page)
      return {
        items,
        popularTags: page === 1 ? ['タグ1', 'タグ2', 'タグ3'] : []
      }
    })

    // NGフィルタリングのモック（20%の動画を除外）
    vi.mocked(filterRankingData).mockImplementation(async ({ items }) => {
      const filtered = items.filter((_, index) => index % 5 !== 0) // 5個に1個を除外
      return { items: filtered as RankingItem[], popularTags: [] }
    })

    // リクエストを作成
    const request = new NextRequest('http://localhost:3000/api/cron/fetch', {
      method: 'POST',
      headers: {
        'authorization': 'Bearer test-secret'
      }
    })

    const response = await POST(request)
    const data = await response.json()

    expect(response.status).toBe(200)
    expect(data.success).toBe(true)

    // KVへの保存を確認（allジャンルの24h）
    const savedCall = vi.mocked(kv.set).mock.calls.find(
      call => call[0] === 'ranking-all-24h'
    )

    expect(savedCall).toBeDefined()
    const savedData = savedCall![1] as { items: RankingItem[], popularTags: string[] }
    
    // 300件保存されていることを確認
    expect(savedData.items).toHaveLength(300)
    expect(savedData.popularTags).toEqual(['タグ1', 'タグ2', 'タグ3'])
    
    // ランク番号が正しく振り直されているか確認
    expect(savedData.items[0]?.rank).toBe(1)
    expect(savedData.items[299]?.rank).toBe(300)
    
    // 4ページ分のデータ取得を確認（80件×3ページ + 60件×1ページ = 300件）
    const scraperCalls = vi.mocked(scrapeRankingPage).mock.calls.filter(
      call => call[0] === 'all' && call[1] === '24h'
    )
    expect(scraperCalls.length).toBeGreaterThanOrEqual(4)
  })

  it('should handle case when not enough items available', async () => {
    // 2ページ分しかデータがない場合
    vi.mocked(scrapeRankingPage).mockImplementation(async (genre, term, tag, limit, page = 1) => {
      if (page <= 2) {
        return {
          items: Array.from({ length: 100 }, (_, i) => ({
            rank: (page - 1) * 100 + i + 1,
            id: `sm${page}${i}`,
            title: `限定動画 ${(page - 1) * 100 + i + 1}`,
            thumbURL: `thumb.jpg`,
            views: 1000
          })),
          popularTags: page === 1 ? ['限定タグ'] : []
        }
      }
      return { items: [], popularTags: [] }
    })

    // フィルタリングなし
    vi.mocked(filterRankingData).mockImplementation(async ({ items }) => ({
      items: items as RankingItem[],
      popularTags: []
    }))

    const request = new NextRequest('http://localhost:3000/api/cron/fetch', {
      method: 'POST',
      headers: {
        'authorization': 'Bearer test-secret'
      }
    })

    const response = await POST(request)
    expect(response.status).toBe(200)

    // 200件のみ保存されることを確認
    const savedCall = vi.mocked(kv.set).mock.calls.find(
      call => call[0] === 'ranking-all-24h'
    )
    const savedData = savedCall![1] as { items: RankingItem[], popularTags: string[] }
    
    expect(savedData.items).toHaveLength(200)
  })
})