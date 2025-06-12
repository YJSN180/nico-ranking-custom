import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { NextRequest } from 'next/server'
import { GET } from '@/app/api/ranking/route'
import { kv } from '@/lib/simple-kv'
import { scrapeRankingPage } from '@/lib/scraper'
import { getGenreRanking, setGenreRanking } from '@/lib/cloudflare-kv'

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
  setGenreRanking: vi.fn(),
  getTagRanking: vi.fn()
}))

describe('Initial Setup Experience', () => {
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

  it.skip('should provide helpful error message when no data exists', async () => {
    vi.mocked(kv.get).mockResolvedValueOnce(null)
    vi.mocked(scrapeRankingPage).mockRejectedValueOnce(new Error('Scraping failed'))

    const request = new NextRequest('http://localhost:3000/api/ranking')
    const response = await GET(request)

    expect(response.status).toBe(200) // Now returns mock data on error
    
    const data = await response.json()
    expect(Array.isArray(data)).toBe(true)
    expect(response.headers.get('X-Data-Source')).toBe('mock')
  })

  it('should cache data when scraping succeeds', async () => {
    const mockData = Array.from({ length: 100 }, (_, i) => ({
      rank: i + 1,
      id: `sm${123 + i}`,
      title: `Test Video ${i + 1}`,
      thumbURL: 'https://example.com/thumb.jpg',
      views: 1000 - i * 10,
    }))
    
    vi.mocked(kv.get).mockResolvedValueOnce(null)
    vi.mocked(getGenreRanking).mockResolvedValueOnce(null)
    vi.mocked(scrapeRankingPage).mockResolvedValueOnce({
      items: mockData,
      popularTags: [],
    })

    const request = new NextRequest('http://localhost:3000/api/ranking')
    const response = await GET(request)
    const data = await response.json()

    expect(response.status).toBe(200)
    // API should return the scraped data when KV is empty
    expect(data.items).toBeDefined()
    expect(data.items).toHaveLength(100)
    expect(data.items[0]).toMatchObject({
      id: 'sm123',
      title: 'Test Video 1',
      views: 1000
    })
  })
})