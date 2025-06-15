import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { GET } from '@/app/api/ranking/route'
import { kv } from '@/lib/simple-kv'
import { scrapeRankingPage } from '@/lib/scraper'
import { getGenreRanking } from '@/lib/cloudflare-kv'
import { NextRequest } from 'next/server'

vi.mock('@/lib/simple-kv', () => ({
  kv: {
    get: vi.fn(),
    set: vi.fn(),
  },
}))

vi.mock('@/lib/scraper', () => ({
  scrapeRankingPage: vi.fn()
}))

vi.mock('@/lib/ng-filter', () => ({
  filterRankingData: vi.fn().mockImplementation(async ({ items }) => ({
    items,
    newDerivedIds: []
  }))
}))

vi.mock('@/lib/cloudflare-kv', () => ({
  getGenreRanking: vi.fn(),
  getTagRanking: vi.fn()
}))

describe('Ranking API Integration', () => {
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

  it('should return 200 with ranking data when KV has data', async () => {
    const mockData = Array.from({ length: 100 }, (_, i) => ({
      rank: i + 1,
      id: `sm${123 + i}`,
      title: `Test Video ${i + 1}`,
      thumbURL: `https://example.com/thumb${i + 1}.jpg`,
      views: 10000 - i * 100,
    }))

    vi.mocked(kv.get).mockResolvedValueOnce({ items: mockData, popularTags: [] })
    vi.mocked(getGenreRanking).mockResolvedValueOnce({ items: mockData, popularTags: [] })

    const request = new NextRequest('http://localhost:3000/api/ranking')
    const response = await GET(request)
    
    if (response.status !== 200) {
      const errorData = await response.json()
      console.error('Error response:', errorData)
    }

    expect(response.status).toBe(200)
    expect(response.headers.get('Content-Type')).toBe('application/json')
    expect(response.headers.get('Cache-Control')).toBe(
      'public, s-maxage=30, stale-while-revalidate=60'
    )

    const data = await response.json()
    expect(data.items).toEqual(mockData)
    expect(data.popularTags).toEqual([])
    expect(data).toHaveProperty('hasMore')
    expect(data).toHaveProperty('totalCached')
  })

  it.skip('should return mock data when KV has no data and scraping fails', async () => {
    vi.mocked(kv.get).mockResolvedValueOnce(null)
    vi.mocked(scrapeRankingPage).mockRejectedValueOnce(new Error('Scraping failed'))

    const request = new NextRequest('http://localhost:3000/api/ranking')
    const response = await GET(request)

    expect(response.status).toBe(200)
    expect(response.headers.get('X-Data-Source')).toBe('mock')
    
    const data = await response.json()
    expect(Array.isArray(data)).toBe(true)
    expect(data[0]).toHaveProperty('title', '【初音ミク】テストソング【オリジナル】')
  })

  it('should fetch from scraper when KV returns invalid data', async () => {
    const mockScrapedData = [
      {
        rank: 1,
        id: 'sm789',
        title: 'Scraped Video',
        thumbURL: 'https://example.com/scraped.jpg',
        views: 15000,
      },
    ]
    
    vi.mocked(kv.get).mockResolvedValueOnce('invalid json')
    vi.mocked(scrapeRankingPage).mockResolvedValueOnce({
      items: mockScrapedData,
      popularTags: [],
    })

    const request = new NextRequest('http://localhost:3000/api/ranking')
    const response = await GET(request)

    expect(response.status).toBe(200)
    
    const data = await response.json()
    expect(data.items).toEqual(mockScrapedData)
    expect(data.popularTags).toEqual([])
    expect(data).toHaveProperty('hasMore', false)
    expect(data).toHaveProperty('totalCached')
  })

  it('should handle KV errors gracefully', async () => {
    vi.mocked(kv.get).mockRejectedValueOnce(new Error('KV error'))
    vi.mocked(scrapeRankingPage).mockRejectedValueOnce(new Error('Scraping also failed'))

    const request = new NextRequest('http://localhost:3000/api/ranking')
    const response = await GET(request)

    expect(response.status).toBe(500)
    
    const data = await response.json()
    expect(data.error).toBe('Failed to fetch ranking data')
  })
})