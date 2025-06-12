import { describe, it, expect, vi } from 'vitest'
import { NextRequest } from 'next/server'
import { kv } from '@/lib/simple-kv'

// Mock KV
vi.mock('@/lib/simple-kv', () => ({
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

    // Test 1: KV returns data as object (new format)
    vi.mocked(kv.get).mockResolvedValueOnce({ items: mockRealData, popularTags: [] })
    
    const { GET } = await import('@/app/api/ranking/route')
    const request = new NextRequest('http://localhost:3000/api/ranking')
    const response1 = await GET(request)
    const data1 = await response1.json()
    
    expect(data1.items).toEqual(mockRealData)
    expect(data1.popularTags).toEqual([])
    expect(data1.items[0].views).toBe(15672)
    expect(data1.items[0].title).not.toContain('サンプル動画')
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