import { describe, it, expect, vi } from 'vitest'
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

describe('Initial Setup Experience', () => {
  it('should provide helpful error message when no data exists', async () => {
    vi.mocked(kv.get).mockResolvedValueOnce(null)
    vi.mocked(scrapeRankingPage).mockRejectedValueOnce(new Error('Scraping failed'))

    const request = new Request('http://localhost:3000/api/ranking')
    const response = await GET(request)

    expect(response.status).toBe(200) // Now returns mock data on error
    
    const data = await response.json()
    expect(Array.isArray(data)).toBe(true)
    expect(response.headers.get('X-Data-Source')).toBe('mock')
  })

  it('should cache data when scraping succeeds', async () => {
    const mockData = [
      {
        rank: 1,
        id: 'sm123',
        title: 'Test Video',
        thumbURL: 'https://example.com/thumb.jpg',
        views: 1000,
      },
    ]
    
    vi.mocked(kv.get).mockResolvedValueOnce(null)
    vi.mocked(scrapeRankingPage).mockResolvedValueOnce({
      items: mockData,
      popularTags: [],
    })

    const request = new Request('http://localhost:3000/api/ranking')
    const response = await GET(request)

    expect(response.status).toBe(200)
    expect(vi.mocked(kv.set)).toHaveBeenCalledWith('ranking-all', {
      items: mockData,
      popularTags: []
    }, { ex: 3600 })
  })
})