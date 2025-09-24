import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { GET } from '@/app/api/popular-tags/route'
import { NextRequest } from 'next/server'
import * as popularTagsModule from '@/lib/popular-tags'
import * as apiOptimizationModule from '@/lib/api-optimization'

// Mock dependencies
vi.mock('@/lib/popular-tags')
vi.mock('@/lib/cache-durations', () => ({
  getCacheHeaders: vi.fn(() => 'public, max-age=1800, s-maxage=3600')
}))

describe('Popular Tags API Route', () => {
  const mockTags = [
    { tag: 'ゲーム', count: 100, ratio: 0.5 },
    { tag: '実況', count: 80, ratio: 0.4 },
    { tag: 'VOICEROID実況', count: 60, ratio: 0.3 },
    { tag: 'RTA', count: 40, ratio: 0.2 },
    { tag: '東方', count: 20, ratio: 0.1 }
  ]

  beforeEach(() => {
    vi.clearAllMocks()
    // Mock environment variables
    process.env.CLOUDFLARE_ACCOUNT_ID = 'test-account-id'
    process.env.KV_RANKING_ID = 'test-kv-id'
    process.env.CLOUDFLARE_API_TOKEN = 'test-api-token'

    // Mock getPopularTags
    vi.mocked(popularTagsModule.getPopularTags).mockResolvedValue(mockTags)
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  describe('Basic functionality', () => {
    it('should return popular tags with default parameters', async () => {
      const request = new NextRequest('http://localhost/api/popular-tags')

      const response = await GET(request)
      const data = await response.json()

      expect(response.status).toBe(200)
      expect(data.tags).toEqual(mockTags)
      expect(data.genre).toBe('all')
      expect(data.period).toBe('24h')
      expect(popularTagsModule.getPopularTags).toHaveBeenCalledWith('all', '24h')
    })

    it('should handle custom genre and period parameters', async () => {
      const request = new NextRequest('http://localhost/api/popular-tags?genre=game&period=weekly')

      const response = await GET(request)
      const data = await response.json()

      expect(response.status).toBe(200)
      expect(data.genre).toBe('game')
      expect(data.period).toBe('weekly')
      expect(popularTagsModule.getPopularTags).toHaveBeenCalledWith('game', 'weekly')
    })
  })

  describe('ETag and conditional requests', () => {
    it('should include ETag header in response', async () => {
      const request = new NextRequest('http://localhost/api/popular-tags')

      const response = await GET(request)

      expect(response.headers.get('ETag')).toBeTruthy()
      expect(response.headers.get('ETag')).toMatch(/^"[a-z0-9]+"$/)
    })

    it('should return 304 for matching If-None-Match header', async () => {
      // First request to get ETag
      const request1 = new NextRequest('http://localhost/api/popular-tags')
      const response1 = await GET(request1)
      const etag = response1.headers.get('ETag')

      // Second request with If-None-Match
      const request2 = new NextRequest('http://localhost/api/popular-tags', {
        headers: {
          'If-None-Match': etag!
        }
      })

      const response2 = await GET(request2)

      expect(response2.status).toBe(304)
      expect(response2.headers.get('ETag')).toBe(etag)
    })

    it('should return full response for non-matching If-None-Match', async () => {
      const request = new NextRequest('http://localhost/api/popular-tags', {
        headers: {
          'If-None-Match': '"old-etag"'
        }
      })

      const response = await GET(request)
      const data = await response.json()

      expect(response.status).toBe(200)
      expect(data.tags).toEqual(mockTags)
    })
  })

  describe('Pagination', () => {
    it('should paginate results when limit is provided', async () => {
      const request = new NextRequest('http://localhost/api/popular-tags?limit=2')

      const response = await GET(request)
      const data = await response.json()

      expect(response.status).toBe(200)
      expect(data.tags).toHaveLength(2)
      expect(data.tags[0]).toEqual(mockTags[0])
      expect(data.tags[1]).toEqual(mockTags[1])
      expect(data.total).toBe(5)
      expect(data.hasMore).toBe(true)
    })

    it('should handle offset parameter', async () => {
      const request = new NextRequest('http://localhost/api/popular-tags?limit=2&offset=2')

      const response = await GET(request)
      const data = await response.json()

      expect(response.status).toBe(200)
      expect(data.tags).toHaveLength(2)
      expect(data.tags[0]).toEqual(mockTags[2])
      expect(data.tags[1]).toEqual(mockTags[3])
      expect(data.total).toBe(5)
      expect(data.hasMore).toBe(true)
    })

    it('should handle last page correctly', async () => {
      const request = new NextRequest('http://localhost/api/popular-tags?limit=2&offset=4')

      const response = await GET(request)
      const data = await response.json()

      expect(response.status).toBe(200)
      expect(data.tags).toHaveLength(1)
      expect(data.tags[0]).toEqual(mockTags[4])
      expect(data.total).toBe(5)
      expect(data.hasMore).toBe(false)
    })

    it('should return all items when no pagination params provided', async () => {
      const request = new NextRequest('http://localhost/api/popular-tags')

      const response = await GET(request)
      const data = await response.json()

      expect(response.status).toBe(200)
      expect(data.tags).toHaveLength(5)
      expect(data.total).toBeUndefined()
      expect(data.hasMore).toBeUndefined()
    })
  })

  describe('Cache headers', () => {
    it('should include optimized cache headers', async () => {
      const request = new NextRequest('http://localhost/api/popular-tags')

      const response = await GET(request)

      expect(response.headers.get('Cache-Control')).toContain('public')
      expect(response.headers.get('Cache-Control')).toContain('max-age=1800')
      expect(response.headers.get('Cache-Control')).toContain('s-maxage=3600')
      expect(response.headers.get('Cache-Control')).toContain('stale-while-revalidate')
      expect(response.headers.get('Vary')).toBe('Accept-Encoding, Accept')
    })
  })

  describe('Error handling', () => {
    it('should return empty array on error', async () => {
      vi.mocked(popularTagsModule.getPopularTags).mockRejectedValue(new Error('API error'))

      const request = new NextRequest('http://localhost/api/popular-tags')

      const response = await GET(request)
      const data = await response.json()

      expect(response.status).toBe(200)
      expect(data.tags).toEqual([])
    })

    it('should log errors to console', async () => {
      const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
      vi.mocked(popularTagsModule.getPopularTags).mockRejectedValue(new Error('Test error'))

      const request = new NextRequest('http://localhost/api/popular-tags')

      await GET(request)

      expect(consoleErrorSpy).toHaveBeenCalledWith('[API/popular-tags] Error:', expect.any(Error))
      expect(consoleErrorSpy).toHaveBeenCalledWith('[API/popular-tags] Genre:', 'all', 'Period:', '24h')

      consoleErrorSpy.mockRestore()
    })
  })

  describe('Preview environment detection', () => {
    it('should detect preview environment from Vercel URLs', async () => {
      const consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})

      // Simulate preview environment
      delete process.env.CLOUDFLARE_ACCOUNT_ID

      const request = new NextRequest('http://test.vercel.app/api/popular-tags', {
        headers: {
          'host': 'test.vercel.app'
        }
      })

      await GET(request)

      expect(consoleWarnSpy).toHaveBeenCalledWith(
        '[API/popular-tags] Missing Cloudflare KV credentials in preview environment'
      )

      consoleWarnSpy.mockRestore()
    })

    it('should not warn in production environment', async () => {
      const consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})

      const request = new NextRequest('http://nico-rank.com/api/popular-tags', {
        headers: {
          'host': 'nico-rank.com'
        }
      })

      await GET(request)

      expect(consoleWarnSpy).not.toHaveBeenCalled()

      consoleWarnSpy.mockRestore()
    })
  })

  describe('Performance', () => {
    it('should handle large datasets efficiently', async () => {
      const largeTags = Array(1000).fill(0).map((_, i) => ({
        tag: `tag${i}`,
        count: 1000 - i,
        ratio: (1000 - i) / 1000
      }))

      vi.mocked(popularTagsModule.getPopularTags).mockResolvedValue(largeTags)

      const request = new NextRequest('http://localhost/api/popular-tags?limit=50')

      const startTime = Date.now()
      const response = await GET(request)
      const duration = Date.now() - startTime

      const data = await response.json()

      expect(response.status).toBe(200)
      expect(data.tags).toHaveLength(50)
      expect(data.total).toBe(1000)
      expect(data.hasMore).toBe(true)
      expect(duration).toBeLessThan(100) // Should be fast
    })
  })

  describe('Integration with optimization utilities', () => {
    it('should use all optimization features correctly', async () => {
      const generateETagSpy = vi.spyOn(apiOptimizationModule, 'generateETag')
      const handleConditionalRequestSpy = vi.spyOn(apiOptimizationModule, 'handleConditionalRequest')
      const paginateSpy = vi.spyOn(apiOptimizationModule, 'paginate')
      const getOptimizedHeadersSpy = vi.spyOn(apiOptimizationModule, 'getOptimizedHeaders')

      const request = new NextRequest('http://localhost/api/popular-tags?limit=2&offset=1')

      const response = await GET(request)
      const data = await response.json()

      expect(response.status).toBe(200)
      expect(data.tags).toHaveLength(2)

      // Verify optimization functions were called
      expect(generateETagSpy).toHaveBeenCalled()
      expect(handleConditionalRequestSpy).toHaveBeenCalled()
      expect(paginateSpy).toHaveBeenCalledWith(mockTags, {
        limit: 2,
        offset: 1
      })
      expect(getOptimizedHeadersSpy).toHaveBeenCalled()

      generateETagSpy.mockRestore()
      handleConditionalRequestSpy.mockRestore()
      paginateSpy.mockRestore()
      getOptimizedHeadersSpy.mockRestore()
    })
  })
})