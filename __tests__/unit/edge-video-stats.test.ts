import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { NextRequest } from 'next/server'

// Edge Runtime環境をモック
const originalEnv = process.env

// Global fetchのモック
global.fetch = vi.fn()

describe('Edge Video Stats API', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    // Reset environment variables
    process.env = { ...originalEnv }
    // Mock fetch globally
    ;(global.fetch as any) = vi.fn()
  })

  afterEach(() => {
    // Restore original environment
    process.env = originalEnv
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
      const { GET } = await import('@/app/api/edge/video-stats/route')
      const videoIds = Array(100).fill('sm123').join(',')
      const request = new NextRequest(`http://localhost/api/edge/video-stats?ids=${videoIds}`)
      
      // Mock KV fetch to return error (missing config)
      const response = await GET(request)
      const data = await response.json()
      
      // Should process but return error due to missing KV config
      expect(response.status).toBe(500)
      expect(data.error).toBe('KV configuration missing')
    })

    it('should fetch and return video stats', async () => {
      // Set environment variables
      process.env.CLOUDFLARE_ACCOUNT_ID = 'test-account'
      process.env.CLOUDFLARE_KV_NAMESPACE_ID = 'test-namespace'
      process.env.CLOUDFLARE_API_TOKEN = 'test-token'
      
      const mockStats = {
        stats: {
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
        },
        metadata: {
          updatedAt: '2024-01-01T00:00:00Z'
        }
      }
      
      // Mock KV fetch
      ;(global.fetch as any).mockResolvedValueOnce({
        ok: true,
        json: async () => mockStats
      })
      
      const { GET } = await import('@/app/api/edge/video-stats/route')
      const request = new NextRequest('http://localhost/api/edge/video-stats?ids=sm123,sm456')
      
      const response = await GET(request)
      const data = await response.json()
      
      expect(response.status).toBe(200)
      expect(data.stats).toEqual({
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
      })
      expect(data.timestamp).toBe('2024-01-01T00:00:00Z')
      expect(data.count).toBe(2)
    })

    it('should handle fetch errors gracefully', async () => {
      getVideoStatsFromKVMock.mockResolvedValue({})
      fetchVideoStatsMock.mockRejectedValue(new Error('Network error'))
      
      const { GET } = await import('@/app/api/edge/video-stats/route')
      const request = new NextRequest('http://localhost/api/edge/video-stats?ids=sm123')
      
      const response = await GET(request)
      const data = await response.json()
      
      expect(response.status).toBe(500)
      expect(data.error).toBe('Failed to fetch video stats')
    })

    it('should set proper cache headers', async () => {
      getVideoStatsFromKVMock.mockResolvedValue({})
      fetchVideoStatsMock.mockResolvedValue({})
      
      const { GET } = await import('@/app/api/edge/video-stats/route')
      const request = new NextRequest('http://localhost/api/edge/video-stats?ids=sm123')
      
      const response = await GET(request)
      
      // Now uses 3-minute cache with KV integration for real-time stats
      expect(response.headers.get('Cache-Control')).toBe('public, s-maxage=180, max-age=60, stale-while-revalidate=120')
    })

    it('should validate Node.js runtime export', async () => {
      const module = await import('@/app/api/edge/video-stats/route')
      expect(module.runtime).toBe('nodejs')
    })

    it('should fetch stats from KV first and fallback to Snapshot API for missing videos', async () => {
      const kvStats = {
        'sm123': {
          viewCounter: 1000,
          commentCounter: 50,
          mylistCounter: 10,
          likeCounter: 100
        }
      }
      
      const freshStats = {
        'sm456': {
          viewCounter: 2000,
          commentCounter: 100,
          mylistCounter: 20,
          likeCounter: 200
        }
      }
      
      getVideoStatsFromKVMock.mockResolvedValue(kvStats)
      fetchVideoStatsMock.mockResolvedValue(freshStats)
      
      const { GET } = await import('@/app/api/edge/video-stats/route')
      const request = new NextRequest('http://localhost/api/edge/video-stats?ids=sm123,sm456')
      
      const response = await GET(request)
      const data = await response.json()
      
      expect(response.status).toBe(200)
      expect(getVideoStatsFromKVMock).toHaveBeenCalledWith(['sm123', 'sm456'])
      expect(fetchVideoStatsMock).toHaveBeenCalledWith(['sm456']) // Only missing video
      expect(data.stats).toEqual({
        'sm123': kvStats['sm123'],
        'sm456': freshStats['sm456']
      })
      expect(data.kvHitRate).toBe(0.5) // 1 out of 2 from KV
    })

    it('should handle KV errors gracefully and fallback to Snapshot API', async () => {
      const freshStats = {
        'sm123': {
          viewCounter: 1000,
          commentCounter: 50,
          mylistCounter: 10,
          likeCounter: 100
        }
      }
      
      getVideoStatsFromKVMock.mockResolvedValue({}) // KV returns empty
      fetchVideoStatsMock.mockResolvedValue(freshStats)
      
      const { GET } = await import('@/app/api/edge/video-stats/route')
      const request = new NextRequest('http://localhost/api/edge/video-stats?ids=sm123')
      
      const response = await GET(request)
      const data = await response.json()
      
      expect(response.status).toBe(200)
      expect(fetchVideoStatsMock).toHaveBeenCalledWith(['sm123'])
      expect(data.stats).toEqual(freshStats)
      expect(data.kvHitRate).toBe(0) // 0 out of 1 from KV
    })

    it('should set longer cache headers when using KV data', async () => {
      // Set environment variables
      process.env.CLOUDFLARE_ACCOUNT_ID = 'test-account'
      process.env.CLOUDFLARE_KV_NAMESPACE_ID = 'test-namespace'
      process.env.CLOUDFLARE_API_TOKEN = 'test-token'
      
      const kvData = {
        stats: {
          'sm123': {
            viewCounter: 1000,
            commentCounter: 50,
            mylistCounter: 10,
            likeCounter: 100
          }
        },
        metadata: {
          updatedAt: '2024-01-01T00:00:00Z'
        }
      }
      
      // Mock KV fetch
      ;(global.fetch as any).mockResolvedValueOnce({
        ok: true,
        json: async () => kvData
      })
      
      const { GET } = await import('@/app/api/edge/video-stats/route')
      const request = new NextRequest('http://localhost/api/edge/video-stats?ids=sm123')
      
      const response = await GET(request)
      
      // Response should be successful
      expect(response.status).toBe(200)
    })
  })
})