import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { NextRequest } from 'next/server'

// Mock Cloudflare KV
vi.mock('@/lib/cloudflare-kv', () => ({
  getGenreRanking: vi.fn(),
  getTagRanking: vi.fn()
}))

// Mock dynamic imports
vi.mock('pako', () => ({
  default: {
    gzip: vi.fn(),
    ungzip: vi.fn()
  }
}))

const { getGenreRanking, getTagRanking } = vi.mocked(await import('@/lib/cloudflare-kv'))

describe('/api/edge/ranking', () => {
  let GET: (request: NextRequest) => Promise<Response>
  
  beforeEach(async () => {
    vi.clearAllMocks()
    // Dynamically import to avoid module loading issues
    const module = await import('@/app/api/edge/ranking/route')
    GET = module.GET
  })

  describe('Genre ranking requests', () => {
    it('should return cached genre ranking data', async () => {
      const mockData = {
        items: [
          { rank: 1, id: 'sm1', title: 'Video 1', thumbURL: 'thumb1.jpg', views: 1000 },
          { rank: 2, id: 'sm2', title: 'Video 2', thumbURL: 'thumb2.jpg', views: 900 }
        ],
        popularTags: ['tag1', 'tag2']
      }
      getGenreRanking.mockResolvedValue(mockData)

      const request = new Request('http://localhost:3000/api/edge/ranking?genre=all&period=24h')
      const response = await GET(request as any)
      const data = await response.json()

      expect(response.status).toBe(200)
      expect(data).toEqual({
        items: mockData.items,
        popularTags: mockData.popularTags,
        hasMore: false,
        totalCached: 2
      })
      expect(response.headers.get('X-Cache-Status')).toBe('HIT')
      expect(response.headers.get('Cache-Control')).toBe('public, s-maxage=1800, stale-while-revalidate=3600')
    })

    it('should handle cache miss for genre ranking', async () => {
      getGenreRanking.mockResolvedValue(null)

      const request = new Request('http://localhost:3000/api/edge/ranking?genre=game&period=hour')
      const response = await GET(request as any)
      const data = await response.json()

      expect(response.status).toBe(200)
      expect(data).toEqual({
        items: [],
        popularTags: [],
        hasMore: false,
        totalCached: 0
      })
      expect(response.headers.get('X-Cache-Status')).toBe('MISS')
    })

    it('should limit items to 500 for genre ranking', async () => {
      const items = Array.from({ length: 600 }, (_, i) => ({
        rank: i + 1,
        id: `sm${i + 1}`,
        title: `Video ${i + 1}`,
        thumbURL: `thumb${i + 1}.jpg`,
        views: 1000 - i
      }))
      getGenreRanking.mockResolvedValue({ items, popularTags: [] })

      const request = new Request('http://localhost:3000/api/edge/ranking?genre=all&period=24h')
      const response = await GET(request as any)
      const data = await response.json()

      expect(data.items.length).toBe(500)
      expect(data.totalCached).toBe(600)
      expect(response.headers.get('X-Max-Items')).toBe('500')
    })
  })

  describe('Tag ranking requests', () => {
    it('should return cached tag ranking data', async () => {
      const mockItems = [
        { rank: 1, id: 'sm10', title: 'Tag Video 1', thumbURL: 'thumb10.jpg', views: 500 },
        { rank: 2, id: 'sm11', title: 'Tag Video 2', thumbURL: 'thumb11.jpg', views: 400 }
      ]
      getTagRanking.mockResolvedValue(mockItems)

      const request = new Request('http://localhost:3000/api/edge/ranking?genre=game&period=24h&tag=RPG')
      const response = await GET(request as any)
      const data = await response.json()

      expect(response.status).toBe(200)
      expect(data).toEqual({
        items: mockItems,
        hasMore: false,
        totalCached: 2
      })
      expect(response.headers.get('X-Cache-Status')).toBe('HIT')
      expect(getTagRanking).toHaveBeenCalledWith('game', '24h', 'RPG')
    })

    it('should handle cache miss for tag ranking', async () => {
      getTagRanking.mockResolvedValue(null)

      const request = new Request('http://localhost:3000/api/edge/ranking?genre=anime&period=hour&tag=2024')
      const response = await GET(request as any)
      const data = await response.json()

      expect(response.status).toBe(200)
      expect(data).toEqual({
        items: [],
        hasMore: false,
        totalCached: 0
      })
      expect(response.headers.get('X-Cache-Status')).toBe('MISS')
    })
  })

  describe('Input validation', () => {
    it('should reject invalid period', async () => {
      const request = new Request('http://localhost:3000/api/edge/ranking?genre=all&period=invalid')
      const response = await GET(request as any)
      const data = await response.json()

      expect(response.status).toBe(400)
      expect(data.error).toBe('Invalid period')
    })

    it('should use defaults for missing parameters', async () => {
      getGenreRanking.mockResolvedValue({ items: [], popularTags: [] })

      const request = new Request('http://localhost:3000/api/edge/ranking')
      const response = await GET(request as any)

      expect(getGenreRanking).toHaveBeenCalledWith('all', '24h')
    })
  })

  describe('Edge runtime compatibility', () => {
    it('should have edge runtime export', async () => {
      const module = await import('@/app/api/edge/ranking/route')
      expect(module.runtime).toBe('edge')
    })

    it('should be Edge runtime compatible', async () => {
      // Edge runtime compatibility is ensured by the runtime export
      // and the fact that the module loads without errors
      const module = await import('@/app/api/edge/ranking/route')
      expect(module.runtime).toBe('edge')
      expect(module.GET).toBeDefined()
    })
  })
})