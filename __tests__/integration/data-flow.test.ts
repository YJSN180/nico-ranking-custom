import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { NextRequest } from 'next/server'
import { kv } from '@/lib/simple-kv'

// Mock KV
vi.mock('@/lib/simple-kv', () => ({
  kv: {
    get: vi.fn(),
    set: vi.fn(),
  },
}))

// Mock scraper
vi.mock('@/lib/scraper', () => ({
  scrapeRankingPage: vi.fn()
}))

// Mock Cloudflare KV
vi.mock('@/lib/cloudflare-kv', () => ({
  getGenreRanking: vi.fn(),
  getTagRanking: vi.fn()
}))

describe('Data Flow Integration', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    // Mock environment variables
    process.env.CLOUDFLARE_KV_NAMESPACE_ID = 'test-namespace-id'
    process.env.CLOUDFLARE_ACCOUNT_ID = 'test-account-id'
    process.env.CLOUDFLARE_KV_API_TOKEN = 'test-api-token'
  })
  
  afterEach(() => {
    delete process.env.CLOUDFLARE_KV_NAMESPACE_ID
    delete process.env.CLOUDFLARE_ACCOUNT_ID
    delete process.env.CLOUDFLARE_KV_API_TOKEN
  })

  it('should handle real ranking data format from KV', async () => {
    const mockRealData = Array.from({ length: 100 }, (_, i) => ({
      rank: i + 1,
      id: `sm${45026928 + i}`,
      title: `Test Video ${i + 1}`,
      thumbURL: `https://nicovideo.cdn.nimg.jp/thumbnails/${45026928 + i}/${45026928 + i}.66686887`,
      views: 15672 - i * 100
    }))

    // Test 1: KV returns data as object (new format)
    vi.mocked(kv.get).mockResolvedValueOnce({ items: mockRealData, popularTags: [] })
    const { getGenreRanking } = await import('@/lib/cloudflare-kv')
    vi.mocked(getGenreRanking).mockResolvedValueOnce({ items: mockRealData, popularTags: [] })
    
    const { GET } = await import('@/app/api/ranking/route')
    const request = new NextRequest('http://localhost:3000/api/ranking')
    const response1 = await GET(request)
    const data1 = await response1.json()
    
    expect(data1).toBeDefined()
    expect(data1.items).toBeDefined()
    expect(data1.items).toHaveLength(100)
    expect(data1.items[0]).toMatchObject({
      rank: 1,
      id: 'sm45026928',
      title: 'Test Video 1',
      views: 15672
    })
    expect(data1.popularTags).toEqual([])
  })

})