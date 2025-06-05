import { describe, expect, it, beforeEach, vi } from 'vitest'
import { NextRequest } from 'next/server'
import { GET } from '@/app/api/ranking/route'
import { kv } from '@vercel/kv'
import { scrapeRankingPage } from '@/lib/scraper'
import type { RankingData } from '@/types/ranking'

// モック
vi.mock('@vercel/kv', () => ({
  kv: {
    get: vi.fn(),
    set: vi.fn()
  }
}))

vi.mock('@/lib/scraper', () => ({
  scrapeRankingPage: vi.fn()
}))

describe('Ranking API pagination (100 items per page)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('should return first 100 items with popularTags for page 1', async () => {
    // 300件のモックデータを準備
    const mockItems: RankingData = Array.from({ length: 300 }, (_, i) => ({
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

    // KVキャッシュなし
    vi.mocked(kv.get).mockResolvedValue(null)
    
    // スクレイパーが300件返す
    vi.mocked(scrapeRankingPage).mockResolvedValue({
      items: mockItems,
      popularTags: ['タグ1', 'タグ2', 'タグ3']
    })

    // ページ1のリクエスト
    const request = new NextRequest('http://localhost:3000/api/ranking', {
      method: 'GET'
    })

    const response = await GET(request)
    const data = await response.json()

    expect(response.status).toBe(200)
    expect(data.items).toHaveLength(100) // ページ1は100件
    expect(data.items[0].rank).toBe(1)
    expect(data.items[99].rank).toBe(100)
    expect(data.popularTags).toEqual(['タグ1', 'タグ2', 'タグ3'])
    
    // デフォルトでスクレイパーが呼ばれたことを確認
    expect(scrapeRankingPage).toHaveBeenCalledWith('all', '24h')
  })

  it('should return page 2 and page 3 from cached data', async () => {
    const mockItems: RankingData = Array.from({ length: 300 }, (_, i) => ({
      rank: i + 1,
      id: `sm${2000 + i}`,
      title: `キャッシュ動画 ${i + 1}`,
      thumbURL: `https://example.com/cached${i + 1}.jpg`,
      views: 2000 + i * 20
    }))

    // KVに300件のキャッシュデータがある
    vi.mocked(kv.get).mockResolvedValue({
      items: mockItems,
      popularTags: ['タグA', 'タグB']
    })

    // ページ2のリクエスト
    const request2 = new NextRequest('http://localhost:3000/api/ranking?genre=game&page=2', {
      method: 'GET'
    })
    const response2 = await GET(request2)
    const data2 = await response2.json()

    expect(response2.status).toBe(200)
    expect(data2).toHaveLength(100) // ページ2は100件（人気タグなし）
    expect(data2[0].rank).toBe(101)
    expect(data2[99].rank).toBe(200)

    // ページ3のリクエスト
    const request3 = new NextRequest('http://localhost:3000/api/ranking?genre=game&page=3', {
      method: 'GET'
    })
    const response3 = await GET(request3)
    const data3 = await response3.json()

    expect(response3.status).toBe(200)
    expect(data3).toHaveLength(100) // ページ3は100件
    expect(data3[0].rank).toBe(201)
    expect(data3[99].rank).toBe(300)
  })

  it('should handle page 4 and beyond with dynamic fetching', async () => {
    // ページ4（301位以降）は動的取得
    const mockItems: RankingData = Array.from({ length: 100 }, (_, i) => ({
      rank: i + 1,
      id: `sm${3000 + i}`,
      title: `動的取得動画 ${i + 1}`,
      thumbURL: `https://example.com/dynamic${i + 1}.jpg`,
      views: 3000 + i * 30
    }))

    vi.mocked(kv.get).mockResolvedValue(null)
    vi.mocked(scrapeRankingPage).mockResolvedValue({
      items: mockItems,
      popularTags: []
    })

    const request = new NextRequest('http://localhost:3000/api/ranking?page=4', {
      method: 'GET'
    })

    const response = await GET(request)
    const data = await response.json()

    expect(response.status).toBe(200)
    expect(data).toHaveLength(100)
    expect(data[0].rank).toBe(301) // ページ4の最初は301位
    expect(data[99].rank).toBe(400) // ページ4の最後は400位
    
    // 動的取得でページ4が指定されたことを確認
    expect(scrapeRankingPage).toHaveBeenCalledWith('all', '24h', undefined, 100, 4)
  })
})