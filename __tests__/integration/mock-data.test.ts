import { describe, it, expect, vi, beforeEach } from 'vitest'
import { POST as cronFetch } from '@/app/api/cron/fetch/route'
import { GET as getRanking } from '@/app/api/ranking/route'
import { kv } from '@vercel/kv'
import { mockRankingData } from '@/lib/mock-data'

vi.mock('@vercel/kv', () => ({
  kv: {
    get: vi.fn(),
    set: vi.fn(),
  },
}))

vi.mock('@/lib/fetch-rss', () => ({
  fetchNicoRanking: vi.fn().mockRejectedValue(new Error('Geo-blocked')),
}))

describe('Mock Data Integration', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.stubEnv('CRON_SECRET', 'test-secret')
  })

  it('should save mock data when RSS fetch fails', async () => {
    vi.mocked(kv.set).mockResolvedValueOnce('OK')

    const request = new Request('http://localhost:3000/api/cron/fetch', {
      method: 'POST',
      headers: {
        'Authorization': 'Bearer test-secret',
      },
    })

    const response = await cronFetch(request)
    expect(response.status).toBe(200)

    const data = await response.json()
    expect(data.success).toBe(true)
    expect(data.itemsCount).toBe(100)
    expect(data.isMock).toBe(true)

    // KVに正しく保存されたか確認
    expect(kv.set).toHaveBeenCalledWith(
      'ranking-data',
      mockRankingData,
      { ex: 86400 }
    )
  })

  it('should retrieve mock data from ranking API', async () => {
    // KVからモックデータを返す（文字列として）
    vi.mocked(kv.get).mockResolvedValueOnce(JSON.stringify(mockRankingData))

    const request = new Request('http://localhost:3000/api/ranking')
    const response = await getRanking(request)
    
    expect(response.status).toBe(200)
    
    const data = await response.json()
    expect(Array.isArray(data)).toBe(true)
    expect(data.length).toBe(100)
    expect(data[0]).toMatchObject({
      rank: 1,
      id: 'sm43521234',
      title: '【初音ミク】テストソング【オリジナル】',
      thumbURL: expect.stringContaining('nicovideo.cdn.nimg.jp'),
      views: 150000,
    })
  })

  it('should handle KV returning parsed object directly', async () => {
    // KVがオブジェクトを直接返す場合
    vi.mocked(kv.get).mockResolvedValueOnce(mockRankingData as any)

    const request = new Request('http://localhost:3000/api/ranking')
    const response = await getRanking(request)
    
    expect(response.status).toBe(200)
    
    const data = await response.json()
    expect(Array.isArray(data)).toBe(true)
    expect(data.length).toBe(100)
  })
})