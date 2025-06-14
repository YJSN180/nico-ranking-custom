import { describe, expect, it, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'
import { POST } from '@/app/api/cron/fetch/route'
import { kv } from '@/lib/simple-kv'
import { scrapeRankingPage } from '@/lib/scraper'
import { filterRankingData } from '@/lib/ng-filter'
import { setRankingToKV } from '@/lib/cloudflare-kv'
import type { RankingItem } from '@/types/ranking'

// モック
vi.mock('@/lib/simple-kv', () => ({
  kv: {
    set: vi.fn(),
    get: vi.fn()
  }
}))

vi.mock('@/lib/scraper', () => ({
  scrapeRankingPage: vi.fn()
}))

vi.mock('@/lib/ng-filter', () => ({
  filterRankingData: vi.fn()
}))

vi.mock('@/lib/cloudflare-kv', () => ({
  setRankingToKV: vi.fn()
}))

// setTimeoutのモック（レート制限の待機をスキップ）
global.setTimeout = vi.fn((callback) => {
  callback()
  return 0 as any
}) as any

describe('Cron job with 500 items collection', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    process.env.CRON_SECRET = 'test-secret'
    // KV getのモックをセットアップ（重複実行チェック用）
    vi.mocked(kv.get).mockResolvedValue(null)
  })

  it('should collect 500 items after NG filtering', async () => {
    // 各ページのモックデータ（NGフィルタリング前）
    const createPageItems = (page: number) => 
      Array.from({ length: 100 }, (_, i) => ({
        rank: (page - 1) * 100 + i + 1,
        id: `sm${page}${i.toString().padStart(3, '0')}`,
        title: `動画タイトル ページ${page} ${i + 1}`,
        thumbURL: `https://example.com/thumb${page}${i}.jpg`,
        views: 1000 * page + i
      }))

    // scrapeRankingPageのモック（7ページ分）
    vi.mocked(scrapeRankingPage).mockImplementation(async (genre, term, tag, limit, page = 1) => {
      // ページ7以降は空配列を返す
      if (page > 7) {
        return { items: [], popularTags: [] }
      }
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

    // setRankingToKVが呼ばれたことを確認
    expect(vi.mocked(setRankingToKV)).toHaveBeenCalled()
    
    // 保存されたデータを確認
    const savedData = vi.mocked(setRankingToKV).mock.calls[0]?.[0]
    expect(savedData).toBeDefined()
    expect(savedData.genres).toBeDefined()
    expect(savedData.genres.all).toBeDefined()
    expect(savedData.genres.all['24h']).toBeDefined()
    
    const allGenre24h = savedData.genres.all['24h']
    
    // 500件保存されていることを確認
    expect(allGenre24h.items).toHaveLength(500)
    expect(allGenre24h.popularTags).toEqual(['タグ1', 'タグ2', 'タグ3'])
    
    // ランク番号が正しく振り直されているか確認
    expect(allGenre24h.items[0]?.rank).toBe(1)
    expect(allGenre24h.items[499]?.rank).toBe(500)
    
    // 7ページ分のデータ取得を確認（80件×6ページ + 20件×1ページ = 500件）
    const scraperCalls = vi.mocked(scrapeRankingPage).mock.calls.filter(
      call => call[0] === 'all' && call[1] === '24h'
    )
    expect(scraperCalls.length).toBeGreaterThanOrEqual(7)
  }, 20000) // 20秒のタイムアウト

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

    // setRankingToKVが呼ばれたことを確認
    expect(vi.mocked(setRankingToKV)).toHaveBeenCalled()
    
    // 保存されたデータを確認
    const savedData = vi.mocked(setRankingToKV).mock.calls[0]?.[0]
    expect(savedData).toBeDefined()
    expect(savedData.genres).toBeDefined()
    expect(savedData.genres.all).toBeDefined()
    expect(savedData.genres.all['24h']).toBeDefined()
    
    const allGenre24h = savedData.genres.all['24h']
    
    // 200件のみ保存されることを確認
    expect(allGenre24h.items).toHaveLength(200)
  }, 20000) // 20秒のタイムアウト
})