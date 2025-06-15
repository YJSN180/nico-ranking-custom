import { describe, expect, it, beforeEach, vi } from 'vitest'
import { NextRequest } from 'next/server'
import { GET } from '@/app/api/ranking/route'
import { kv } from '@/lib/simple-kv'
import { scrapeRankingPage } from '@/lib/scraper'
import { getGenreRanking } from '@/lib/cloudflare-kv'
import type { RankingData } from '@/types/ranking'

// モック
vi.mock('@/lib/simple-kv', () => ({
  kv: {
    get: vi.fn(),
    set: vi.fn()
  }
}))

vi.mock('@/lib/scraper', () => ({
  scrapeRankingPage: vi.fn()
}))

vi.mock('@/lib/cloudflare-kv', () => ({
  getGenreRanking: vi.fn()
}))

describe('Ranking API - 500 items display', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('should return all 500 items with popularTags', async () => {
    // 1000件のモックデータを準備（APIは500件まで返す）
    const mockItems: RankingData = Array.from({ length: 1000 }, (_, i) => ({
      rank: i + 1,
      id: `sm${1000 + i}`,
      title: `動画タイトル ${i + 1}`,
      thumbURL: `https://example.com/thumb${i + 1}.jpg`,
      views: 1000 + i * 10,
      comments: 10 + i,
      mylists: 5 + Math.floor(i / 10),
      likes: 20 + Math.floor(i / 5),
      authorId: `user${Math.floor(i / 10)}`,
      authorName: `ユーザー${Math.floor(i / 10)}`,
      registeredAt: new Date(Date.now() - i * 3600000).toISOString()
    }))

    // Cloudflare KVから取得
    vi.mocked(getGenreRanking).mockResolvedValue({
      items: mockItems,
      popularTags: ['タグ1', 'タグ2', 'タグ3']
    })

    const request = new NextRequest('http://localhost:3000/api/ranking', {
      method: 'GET'
    })
    const response = await GET(request)
    const data = await response.json()

    expect(response.status).toBe(200)
    expect(data.items).toHaveLength(500) // 最大500件返す
    expect(data.items[0].rank).toBe(1)
    expect(data.items[499].rank).toBe(500)
    expect(data.popularTags).toEqual(['タグ1', 'タグ2', 'タグ3'])
    expect(data.hasMore).toBe(false) // ページネーションなし
  })

  it('should return less than 500 items if data is limited', async () => {
    const mockItems: RankingData = Array.from({ length: 300 }, (_, i) => ({
      rank: i + 1,
      id: `sm${2000 + i}`,
      title: `キャッシュ動画 ${i + 1}`,
      thumbURL: `https://example.com/cached${i + 1}.jpg`,
      views: 2000 + i * 20
    }))

    // Cloudflare KVから取得
    vi.mocked(getGenreRanking).mockResolvedValue({
      items: mockItems,
      popularTags: ['タグA', 'タグB']
    })

    const request = new NextRequest('http://localhost:3000/api/ranking?genre=game', {
      method: 'GET'
    })
    const response = await GET(request)
    const data = await response.json()

    expect(response.status).toBe(200)
    expect(data.items).toHaveLength(300) // 実際のデータ数を返す
    expect(data.items[0].rank).toBe(1)
    expect(data.items[299].rank).toBe(300)
    expect(data.hasMore).toBe(false)
  })

  it('should fallback to scraper when Cloudflare KV fails', async () => {
    // Cloudflare KVエラー
    vi.mocked(getGenreRanking).mockRejectedValue(new Error('KV Error'))
    
    // スクレイパーのモック
    const mockItems: RankingData = Array.from({ length: 500 }, (_, i) => ({
      rank: i + 1,
      id: `sm${3000 + i}`,
      title: `スクレイプ動画 ${i + 1}`,
      thumbURL: `https://example.com/scraped${i + 1}.jpg`,
      views: 3000 + i * 30
    }))
    
    vi.mocked(scrapeRankingPage).mockResolvedValue({
      items: mockItems,
      popularTags: []
    })

    const request = new NextRequest('http://localhost:3000/api/ranking?genre=entertainment', {
      method: 'GET'
    })
    const response = await GET(request)
    const data = await response.json()

    expect(response.status).toBe(200)
    expect(data.items).toHaveLength(500)
    expect(scrapeRankingPage).toHaveBeenCalledWith('entertainment', '24h', undefined, 500)
  })
})