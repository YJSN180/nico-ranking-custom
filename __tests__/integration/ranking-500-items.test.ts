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

describe('Ranking API pagination (100 items per page)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('should return first 100 items with popularTags for page 1', async () => {
    // 500件のモックデータを準備
    const mockItems: RankingData = Array.from({ length: 500 }, (_, i) => ({
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
    
    // スクレイパーが500件返す
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
    const mockItems: RankingData = Array.from({ length: 500 }, (_, i) => ({
      rank: i + 1,
      id: `sm${2000 + i}`,
      title: `キャッシュ動画 ${i + 1}`,
      thumbURL: `https://example.com/cached${i + 1}.jpg`,
      views: 2000 + i * 20
    }))

    // KVに500件のキャッシュデータがある
    vi.mocked(kv.get).mockResolvedValue({
      items: mockItems,
      popularTags: ['タグA', 'タグB']
    })
    
    // getGenreRankingも同じデータを返すようにモック
    vi.mocked(getGenreRanking).mockResolvedValue({
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
    expect(data2.items).toHaveLength(100) // ページ2は100件（人気タグなし）
    expect(data2.items[0].rank).toBe(101)
    expect(data2.items[99].rank).toBe(200)

    // ページ3のリクエスト
    const request3 = new NextRequest('http://localhost:3000/api/ranking?genre=game&page=3', {
      method: 'GET'
    })
    const response3 = await GET(request3)
    const data3 = await response3.json()

    expect(response3.status).toBe(200)
    expect(data3.items).toHaveLength(100) // ページ3は100件
    expect(data3.items[0].rank).toBe(201)
    expect(data3.items[99].rank).toBe(300)
  })

  it('should handle page 4 and 5 from cached data with 500 items', async () => {
    // 500件のモックデータを準備
    const mockItems: RankingData = Array.from({ length: 500 }, (_, i) => ({
      rank: i + 1,
      id: `sm${1000 + i}`,
      title: `動画タイトル ${i + 1}`,
      thumbURL: `https://example.com/thumb${i + 1}.jpg`,
      views: 1000 + i * 10
    }))

    // Cloudflare KVモック（500件のデータ）
    vi.mocked(getGenreRanking).mockResolvedValue({
      items: mockItems,
      popularTags: []
    })

    // ページ4のリクエスト
    const request4 = new NextRequest('http://localhost:3000/api/ranking?genre=all&page=4', {
      method: 'GET'
    })
    const response4 = await GET(request4)
    const data4 = await response4.json()

    expect(response4.status).toBe(200)
    expect(data4.items).toHaveLength(100)
    expect(data4.items[0].rank).toBe(301) // ページ4の最初は301位
    expect(data4.items[99].rank).toBe(400) // ページ4の最後は400位

    // ページ5のリクエスト
    const request5 = new NextRequest('http://localhost:3000/api/ranking?genre=all&page=5', {
      method: 'GET'
    })
    const response5 = await GET(request5)
    const data5 = await response5.json()

    expect(response5.status).toBe(200)
    expect(data5.items).toHaveLength(100)
    expect(data5.items[0].rank).toBe(401) // ページ5の最初は401位
    expect(data5.items[99].rank).toBe(500) // ページ5の最後は500位
  })
})