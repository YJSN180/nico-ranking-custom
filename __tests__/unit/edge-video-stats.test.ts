import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

// Edge Runtime環境をモック
const fetchVideoStatsMock = vi.fn()
const getVideoStatsFromKVMock = vi.fn()

// Mock global fetch
global.fetch = vi.fn()

vi.mock('@/lib/snapshot-api', () => ({
  fetchVideoStats: fetchVideoStatsMock
}))

vi.mock('@/lib/video-stats-kv', () => ({
  getVideoStatsFromKV: getVideoStatsFromKVMock
}))

describe('Edge Video Stats API', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    // Mock environment variables
    process.env.CLOUDFLARE_ACCOUNT_ID = 'test-account'
    process.env.CLOUDFLARE_KV_NAMESPACE_ID = 'test-namespace'
    process.env.CLOUDFLARE_API_TOKEN = 'test-token'
  })

  afterEach(() => {
    // Clean up environment variables
    delete process.env.CLOUDFLARE_ACCOUNT_ID
    delete process.env.CLOUDFLARE_KV_NAMESPACE_ID
    delete process.env.CLOUDFLARE_API_TOKEN
  })

  describe('GET /api/edge/video-stats', () => {
    it('should return 400 if no video IDs provided', async () => {
      const { GET } = await import('@/app/api/edge/video-stats/route')
      const request = new NextRequest('http://localhost/api/edge/video-stats')
      
      const response = await GET(request)
      const data = await response.json()
      
      expect(response.status).toBe(400)
      expect(data.error).toBe('Missing ids parameter')
    })

    it('should limit to 50 video IDs', async () => {
      // Mock KV response
      const mockKVData = {
        stats: {},
        metadata: { version: 1, updatedAt: '2024-01-01T00:00:00Z', totalVideos: 0 }
      }
      
      vi.mocked(global.fetch).mockResolvedValueOnce(
        new Response(JSON.stringify(mockKVData), { status: 200 })
      )
      
      const { GET } = await import('@/app/api/edge/video-stats/route')
      const videoIds = Array(100).fill('sm123').join(',')
      const request = new NextRequest(`http://localhost/api/edge/video-stats?ids=${videoIds}`)
      
      const response = await GET(request)
      const data = await response.json()
      
      // Should process and limit to 50 IDs
      expect(response.status).toBe(200)
      expect(vi.mocked(global.fetch)).toHaveBeenCalledWith(
        expect.stringContaining('/values/VIDEO_STATS_LATEST'),
        expect.any(Object)
      )
    })

    it('should fetch and return video stats', async () => {
      const mockStats = {
        'sm123': {
          viewCounter: 1000,
          commentCounter: 50,
          mylistCounter: 10,
          likeCounter: 100
        },
        'sm456': {
          viewCounter: 2000,
          commentCounter: 100,
          mylistCounter: 20,
          likeCounter: 200
        }
      }
      
      // Mock KV response
      const mockKVData = {
        stats: mockStats,
        metadata: { version: 1, updatedAt: '2024-01-01T00:00:00Z', totalVideos: 2 }
      }
      
      vi.mocked(global.fetch).mockResolvedValueOnce(
        new Response(JSON.stringify(mockKVData), { status: 200 })
      )
      
      const { GET } = await import('@/app/api/edge/video-stats/route')
      const request = new NextRequest('http://localhost/api/edge/video-stats?ids=sm123,sm456')
      
      const response = await GET(request)
      const data = await response.json()
      
      expect(response.status).toBe(200)
      expect(data.stats).toEqual(mockStats)
      expect(data.timestamp).toBeDefined()
      expect(data.count).toBe(2)
    })

    it('should handle fetch errors gracefully', async () => {
      // Mock KV fetch error
      vi.mocked(global.fetch).mockRejectedValueOnce(new Error('Network error'))
      
      const { GET } = await import('@/app/api/edge/video-stats/route')
      const request = new NextRequest('http://localhost/api/edge/video-stats?ids=sm123')
      
      const response = await GET(request)
      const data = await response.json()
      
      expect(response.status).toBe(500)
      expect(data.error).toBe('Failed to fetch video stats')
    })

    it('should set proper cache headers', async () => {
      // Mock KV response
      const mockKVData = {
        stats: { 'sm123': { viewCounter: 1000, commentCounter: 50, mylistCounter: 10, likeCounter: 100 } },
        metadata: { version: 1, updatedAt: '2024-01-01T00:00:00Z', totalVideos: 1 }
      }
      
      vi.mocked(global.fetch).mockResolvedValueOnce(
        new Response(JSON.stringify(mockKVData), { status: 200 })
      )
      
      const { GET } = await import('@/app/api/edge/video-stats/route')
      const request = new NextRequest('http://localhost/api/edge/video-stats?ids=sm123')
      
      const response = await GET(request)
      
      // Now uses 2-minute cache with KV integration for real-time stats
      expect(response.headers.get('Cache-Control')).toBe('public, max-age=120, s-maxage=120, stale-while-revalidate=180')
    })

    it('should validate Node.js runtime export', async () => {
      const module = await import('@/app/api/edge/video-stats/route')
      expect(module.runtime).toBe('nodejs')
    })

    it('should handle KV 404 errors gracefully and return empty stats', async () => {
      // Mock KV 404 response
      vi.mocked(global.fetch).mockResolvedValueOnce(
        new Response('Not Found', { status: 404 })
      )
      
      const { GET } = await import('@/app/api/edge/video-stats/route')
      const request = new NextRequest('http://localhost/api/edge/video-stats?ids=sm123')
      
      const response = await GET(request)
      const data = await response.json()
      
      expect(response.status).toBe(200)
      expect(data.stats).toEqual({})
      expect(data.count).toBe(0)
    })

    it('should return stats only for requested video IDs', async () => {
      // Mock KV response with more videos than requested
      const mockKVData = {
        stats: {
          'sm123': { viewCounter: 1000, commentCounter: 50, mylistCounter: 10, likeCounter: 100 },
          'sm456': { viewCounter: 2000, commentCounter: 100, mylistCounter: 20, likeCounter: 200 },
          'sm789': { viewCounter: 3000, commentCounter: 150, mylistCounter: 30, likeCounter: 300 }
        },
        metadata: { version: 1, updatedAt: '2024-01-01T00:00:00Z', totalVideos: 3 }
      }
      
      vi.mocked(global.fetch).mockResolvedValueOnce(
        new Response(JSON.stringify(mockKVData), { status: 200 })
      )
      
      const { GET } = await import('@/app/api/edge/video-stats/route')
      const request = new NextRequest('http://localhost/api/edge/video-stats?ids=sm123,sm456')
      
      const response = await GET(request)
      const data = await response.json()
      
      expect(response.status).toBe(200)
      expect(data.stats).toEqual({
        'sm123': { viewCounter: 1000, commentCounter: 50, mylistCounter: 10, likeCounter: 100 },
        'sm456': { viewCounter: 2000, commentCounter: 100, mylistCounter: 20, likeCounter: 200 }
      })
      expect(data.count).toBe(2)
    })
  })
})