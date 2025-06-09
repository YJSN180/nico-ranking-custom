import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { NextRequest } from 'next/server'
import { GET } from '@/app/api/ranking/route'

// Mock Cloudflare KV
vi.mock('@/lib/cloudflare-kv', () => ({
  getGenreRanking: vi.fn(),
  getTagRanking: vi.fn(),
  getRankingFromKV: vi.fn(),
}))

describe('Vercel Edge API - Cloudflare KV Integration', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  describe('GET /api/ranking', () => {
    it('should fetch genre ranking from Cloudflare KV', async () => {
      const { getGenreRanking } = await import('@/lib/cloudflare-kv')
      
      const mockData = {
        items: [
          {
            rank: 1,
            id: 'sm12345',
            title: 'Test Video',
            thumbURL: 'https://example.com/thumb.L',
            views: 1000,
          },
        ],
        popularTags: ['VOCALOID', 'ゲーム実況'],
      }
      
      vi.mocked(getGenreRanking).mockResolvedValueOnce(mockData)
      
      const request = new NextRequest('http://localhost:3000/api/ranking?genre=game&period=24h')
      const response = await GET(request)
      
      expect(response.status).toBe(200)
      expect(getGenreRanking).toHaveBeenCalledWith('game', '24h')
      
      const data = await response.json()
      expect(data.items).toHaveLength(1)
      expect(data.popularTags).toHaveLength(2)
    })

    it('should fetch tag-specific ranking from Cloudflare KV', async () => {
      const { getTagRanking } = await import('@/lib/cloudflare-kv')
      
      const mockTagData = [
        {
          rank: 1,
          id: 'sm67890',
          title: 'VOCALOID Song',
          thumbURL: 'https://example.com/vocaloid.L',
          views: 5000,
        },
      ]
      
      vi.mocked(getTagRanking).mockResolvedValueOnce(mockTagData)
      
      const request = new NextRequest('http://localhost:3000/api/ranking?genre=other&period=hour&tag=VOCALOID')
      const response = await GET(request)
      
      expect(response.status).toBe(200)
      expect(getTagRanking).toHaveBeenCalledWith('other', 'hour', 'VOCALOID')
      
      const data = await response.json()
      expect(data.items).toHaveLength(1)
      expect(data.items[0].title).toBe('VOCALOID Song')
    })

    it('should handle missing data gracefully', async () => {
      const { getGenreRanking } = await import('@/lib/cloudflare-kv')
      
      vi.mocked(getGenreRanking).mockResolvedValueOnce(null)
      
      const request = new NextRequest('http://localhost:3000/api/ranking?genre=invalid')
      const response = await GET(request)
      
      expect(response.status).toBe(404)
      
      const data = await response.json()
      expect(data.error).toBeDefined()
    })

    it('should validate genre parameter', async () => {
      const request = new NextRequest('http://localhost:3000/api/ranking')
      const response = await GET(request)
      
      expect(response.status).toBe(400)
      
      const data = await response.json()
      expect(data.error).toContain('genre')
    })

    it('should validate period parameter', async () => {
      const request = new NextRequest('http://localhost:3000/api/ranking?genre=game&period=invalid')
      const response = await GET(request)
      
      expect(response.status).toBe(400)
      
      const data = await response.json()
      expect(data.error).toContain('period')
    })

    it('should return correct cache headers', async () => {
      const { getGenreRanking } = await import('@/lib/cloudflare-kv')
      
      vi.mocked(getGenreRanking).mockResolvedValueOnce({
        items: [],
        popularTags: [],
      })
      
      const request = new NextRequest('http://localhost:3000/api/ranking?genre=all&period=24h')
      const response = await GET(request)
      
      expect(response.status).toBe(200)
      expect(response.headers.get('Cache-Control')).toBe('public, s-maxage=30, stale-while-revalidate=60')
    })

    it('should handle large datasets efficiently', async () => {
      const { getGenreRanking } = await import('@/lib/cloudflare-kv')
      
      // Mock 500 items
      const items = Array.from({ length: 500 }, (_, i) => ({
        rank: i + 1,
        id: `sm${i}`,
        title: `Video ${i}`,
        thumbURL: `https://example.com/thumb${i}.L`,
        views: 1000 - i,
      }))
      
      vi.mocked(getGenreRanking).mockResolvedValueOnce({
        items,
        popularTags: ['tag1', 'tag2', 'tag3'],
      })
      
      const request = new NextRequest('http://localhost:3000/api/ranking?genre=all&period=24h')
      const response = await GET(request)
      
      expect(response.status).toBe(200)
      
      const data = await response.json()
      expect(data.items).toHaveLength(500)
      expect(data.items[0].rank).toBe(1)
      expect(data.items[499].rank).toBe(500)
    })

    it('should support pagination for client-side loading', async () => {
      const { getGenreRanking } = await import('@/lib/cloudflare-kv')
      
      const allItems = Array.from({ length: 200 }, (_, i) => ({
        rank: i + 1,
        id: `sm${i}`,
        title: `Video ${i}`,
        thumbURL: `https://example.com/thumb${i}.L`,
        views: 1000 - i,
      }))
      
      vi.mocked(getGenreRanking).mockResolvedValueOnce({
        items: allItems,
        popularTags: [],
      })
      
      const request = new NextRequest('http://localhost:3000/api/ranking?genre=game&period=24h&limit=100&offset=0')
      const response = await GET(request)
      
      expect(response.status).toBe(200)
      
      const data = await response.json()
      expect(data.items).toHaveLength(100)
      expect(data.items[0].rank).toBe(1)
      expect(data.items[99].rank).toBe(100)
      expect(data.hasMore).toBe(true)
    })
  })

  describe('Error Handling', () => {
    it('should handle KV connection errors', async () => {
      const { getGenreRanking } = await import('@/lib/cloudflare-kv')
      
      vi.mocked(getGenreRanking).mockRejectedValueOnce(new Error('KV connection failed'))
      
      const request = new NextRequest('http://localhost:3000/api/ranking?genre=game&period=24h')
      const response = await GET(request)
      
      expect(response.status).toBe(500)
      
      const data = await response.json()
      expect(data.error).toContain('Failed to fetch ranking')
    })

    it('should handle decompression errors', async () => {
      const { getRankingFromKV } = await import('@/lib/cloudflare-kv')
      
      vi.mocked(getRankingFromKV).mockRejectedValueOnce(new Error('Invalid compressed data'))
      
      const request = new NextRequest('http://localhost:3000/api/ranking?genre=all&period=24h')
      const response = await GET(request)
      
      expect(response.status).toBe(500)
    })
  })
})