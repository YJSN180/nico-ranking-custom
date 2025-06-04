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

describe('Ranking API with 300 items', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('should handle request for 300 items', async () => {
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

    // リクエストを作成
    const request = new NextRequest('http://localhost:3000/api/ranking?limit=300', {
      method: 'GET'
    })

    const response = await GET(request)
    const data = await response.json()

    expect(response.status).toBe(200)
    expect(data.items).toHaveLength(300)
    expect(data.items[0].rank).toBe(1)
    expect(data.items[299].rank).toBe(300)
    expect(data.popularTags).toEqual(['タグ1', 'タグ2', 'タグ3'])
    
    // スクレイパーが300件のlimitで呼ばれたことを確認
    expect(scrapeRankingPage).toHaveBeenCalledWith('all', '24h', undefined, 300)
  })

  it('should cache 300 items properly', async () => {
    const mockItems: RankingData = Array.from({ length: 300 }, (_, i) => ({
      rank: i + 1,
      id: `sm${2000 + i}`,
      title: `キャッシュ動画 ${i + 1}`,
      thumbURL: `https://example.com/cached${i + 1}.jpg`,
      views: 2000 + i * 20
    }))

    vi.mocked(kv.get).mockResolvedValue(null)
    vi.mocked(scrapeRankingPage).mockResolvedValue({
      items: mockItems,
      popularTags: []
    })

    const request = new NextRequest('http://localhost:3000/api/ranking?genre=game&limit=300', {
      method: 'GET'
    })

    await GET(request)

    // 300件のデータがキャッシュされることを確認
    expect(kv.set).toHaveBeenCalledWith(
      'ranking-game-24h',
      expect.objectContaining({
        items: expect.arrayContaining([
          expect.objectContaining({ rank: 1 }),
          expect.objectContaining({ rank: 300 })
        ]),
        popularTags: []
      }),
      { ex: 1800 }
    )
  })

  it('should return partial data when less than 300 items available', async () => {
    // 250件のみ利用可能な場合
    const mockItems: RankingData = Array.from({ length: 250 }, (_, i) => ({
      rank: i + 1,
      id: `sm${3000 + i}`,
      title: `部分的な動画 ${i + 1}`,
      thumbURL: `https://example.com/partial${i + 1}.jpg`,
      views: 3000 + i * 30
    }))

    vi.mocked(kv.get).mockResolvedValue(null)
    vi.mocked(scrapeRankingPage).mockResolvedValue({
      items: mockItems,
      popularTags: []
    })

    const request = new NextRequest('http://localhost:3000/api/ranking?limit=300', {
      method: 'GET'
    })

    const response = await GET(request)
    const data = await response.json()

    expect(response.status).toBe(200)
    expect(data.items).toHaveLength(250)
    expect(data.items[249].rank).toBe(250)
  })
})