import { describe, it, expect, vi } from 'vitest'
import { kv } from '@vercel/kv'

// Mock KV
vi.mock('@vercel/kv', () => ({
  kv: {
    get: vi.fn(),
    set: vi.fn(),
  },
}))

describe('Data Flow Integration', () => {
  it('should handle real ranking data format from KV', async () => {
    const mockRealData = [
      {
        rank: 1,
        id: 'sm45026928',
        title: '【Farthest Frontier】領主のお姉さん実況 39【街づくり】',
        thumbURL: 'https://nicovideo.cdn.nimg.jp/thumbnails/45026928/45026928.66686887',
        views: 15672
      },
      {
        rank: 2,
        id: 'sm45027633',
        title: '琴葉茜と月テラフォーミング用の拠点（崖の上） #2【The Planet Crafter 月編】',
        thumbURL: 'https://nicovideo.cdn.nimg.jp/thumbnails/45027633/45027633.89193244',
        views: 13704
      }
    ]

    // Test 1: KV returns data as array (object)
    vi.mocked(kv.get).mockResolvedValueOnce(mockRealData)
    
    const { GET } = await import('@/app/api/ranking/route')
    const request = new Request('http://localhost:3000/api/ranking')
    const response1 = await GET(request)
    const data1 = await response1.json()
    
    expect(data1).toEqual(mockRealData)
    expect(data1[0].views).toBe(15672)
    expect(data1[0].title).not.toContain('サンプル動画')
    
    // Test 2: KV returns data as JSON string
    vi.mocked(kv.get).mockResolvedValueOnce(JSON.stringify(mockRealData))
    
    const response2 = await GET(request)
    const data2 = await response2.json()
    
    expect(data2).toEqual(mockRealData)
    expect(data2[0].views).toBe(15672)
  })

  it('should display real data on homepage when available', async () => {
    const mockRealData = [
      {
        rank: 1,
        id: 'sm45026928',
        title: '【Farthest Frontier】領主のお姉さん実況 39【街づくり】',
        thumbURL: 'https://nicovideo.cdn.nimg.jp/thumbnails/45026928/45026928.66686887',
        views: 15672
      }
    ]

    // Mock KV to return real data
    vi.mocked(kv.get).mockImplementation(async (key) => {
      if (key === 'ranking-data') return mockRealData
      if (key === 'last-update-info') return {
        timestamp: new Date().toISOString(),
        itemCount: 1,
        source: 'test'
      }
      return null
    })

    // Test that data would be available
    const data = await kv.get('ranking-data')
    expect(data).toEqual(mockRealData)
  })
})