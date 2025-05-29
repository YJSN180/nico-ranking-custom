import { describe, it, expect, vi, beforeEach } from 'vitest'
import { GET } from '@/app/api/ranking/route'
import { kv } from '@vercel/kv'
import { scrapeRankingPage } from '@/lib/scraper'

vi.mock('@vercel/kv', () => ({
  kv: {
    get: vi.fn(),
    set: vi.fn(),
  },
}))

vi.mock('@/lib/scraper')

describe('Ranking API Integration', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('should return 200 with ranking data when KV has data', async () => {
    const mockData = [
      {
        rank: 1,
        id: 'sm123',
        title: 'Test Video 1',
        thumbURL: 'https://example.com/thumb1.jpg',
        views: 10000,
      },
      {
        rank: 2,
        id: 'sm456',
        title: 'Test Video 2',
        thumbURL: 'https://example.com/thumb2.jpg',
        views: 5000,
      },
    ]

    vi.mocked(kv.get).mockResolvedValueOnce(JSON.stringify(mockData))

    const request = new Request('http://localhost:3000/api/ranking')
    const response = await GET(request)

    expect(response.status).toBe(200)
    expect(response.headers.get('Content-Type')).toBe('application/json')
    expect(response.headers.get('Cache-Control')).toBe(
      's-maxage=30, stale-while-revalidate=30'
    )

    const data = await response.json()
    expect(data).toEqual(mockData)
  })

  it('should return mock data when KV has no data and scraping fails', async () => {
    vi.mocked(kv.get).mockResolvedValueOnce(null)
    vi.mocked(scrapeRankingPage).mockRejectedValueOnce(new Error('Scraping failed'))

    const request = new Request('http://localhost:3000/api/ranking')
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

    const request = new Request('http://localhost:3000/api/ranking')
    const response = await GET(request)

    expect(response.status).toBe(200)
    
    const data = await response.json()
    expect(data[0]).toHaveProperty('title', 'Scraped Video')
  })

  it('should handle KV errors gracefully', async () => {
    vi.mocked(kv.get).mockRejectedValueOnce(new Error('KV error'))

    const request = new Request('http://localhost:3000/api/ranking')
    const response = await GET(request)

    expect(response.status).toBe(502)
    
    const data = await response.json()
    expect(data.error).toBe('Failed to fetch ranking data')
  })
})