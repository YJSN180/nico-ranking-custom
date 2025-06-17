import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

// Edge Runtime環境をモック
const fetchVideoStatsMock = vi.fn()

vi.mock('@/lib/snapshot-api', () => ({
  fetchVideoStats: fetchVideoStatsMock
}))

describe('Edge Video Stats API', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('GET /api/edge/video-stats', () => {
    it('should return 400 if no video IDs provided', async () => {
      const { GET } = await import('@/app/api/edge/video-stats/route')
      const request = new NextRequest('http://localhost/api/edge/video-stats')
      
      const response = await GET(request)
      const data = await response.json()
      
      expect(response.status).toBe(400)
      expect(data.error).toBe('No video IDs provided')
    })

    it('should return 400 if more than 500 video IDs provided', async () => {
      const { GET } = await import('@/app/api/edge/video-stats/route')
      const videoIds = Array(501).fill('sm123').join(',')
      const request = new NextRequest(`http://localhost/api/edge/video-stats?ids=${videoIds}`)
      
      const response = await GET(request)
      const data = await response.json()
      
      expect(response.status).toBe(400)
      expect(data.error).toBe('Too many video IDs (max 500)')
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
      
      fetchVideoStatsMock.mockResolvedValue(mockStats)
      
      const { GET } = await import('@/app/api/edge/video-stats/route')
      const request = new NextRequest('http://localhost/api/edge/video-stats?ids=sm123,sm456')
      
      const response = await GET(request)
      const data = await response.json()
      
      expect(response.status).toBe(200)
      expect(data.stats).toEqual(mockStats)
      expect(data.timestamp).toBeDefined()
      expect(data.count).toBe(2)
      expect(fetchVideoStatsMock).toHaveBeenCalledWith(['sm123', 'sm456'])
    })

    it('should handle fetch errors gracefully', async () => {
      fetchVideoStatsMock.mockRejectedValue(new Error('Network error'))
      
      const { GET } = await import('@/app/api/edge/video-stats/route')
      const request = new NextRequest('http://localhost/api/edge/video-stats?ids=sm123')
      
      const response = await GET(request)
      const data = await response.json()
      
      expect(response.status).toBe(500)
      expect(data.error).toBe('Failed to fetch video stats')
    })

    it('should set proper cache headers', async () => {
      fetchVideoStatsMock.mockResolvedValue({})
      
      const { GET } = await import('@/app/api/edge/video-stats/route')
      const request = new NextRequest('http://localhost/api/edge/video-stats?ids=sm123')
      
      const response = await GET(request)
      
      expect(response.headers.get('Cache-Control')).toBe('no-cache, no-store, must-revalidate')
    })

    it('should validate Edge runtime export', async () => {
      const module = await import('@/app/api/edge/video-stats/route')
      expect(module.runtime).toBe('edge')
    })
  })
})