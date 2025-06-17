import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

// モック
const fetchVideoTagsMock = vi.fn()

vi.mock('@/lib/tag-api', () => ({
  fetchVideoTags: fetchVideoTagsMock
}))

describe('Edge Tag Fetch API', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('GET /api/edge/video-tags', () => {
    it('should return 400 if no video IDs provided', async () => {
      const { GET } = await import('@/app/api/edge/video-tags/route')
      const request = new NextRequest('http://localhost/api/edge/video-tags')
      
      const response = await GET(request)
      const data = await response.json()
      
      expect(response.status).toBe(400)
      expect(data.error).toBe('No video IDs provided')
    })

    it('should return 400 if more than 100 video IDs provided', async () => {
      const { GET } = await import('@/app/api/edge/video-tags/route')
      const videoIds = Array(101).fill('sm123').join(',')
      const request = new NextRequest(`http://localhost/api/edge/video-tags?ids=${videoIds}`)
      
      const response = await GET(request)
      const data = await response.json()
      
      expect(response.status).toBe(400)
      expect(data.error).toBe('Too many video IDs (max 100)')
    })

    it('should fetch and return video tags', async () => {
      const mockTags = {
        'sm123': ['タグ1', 'タグ2', 'タグ3'],
        'sm456': ['タグA', 'タグB']
      }
      
      fetchVideoTagsMock.mockResolvedValue(mockTags)
      
      const { GET } = await import('@/app/api/edge/video-tags/route')
      const request = new NextRequest('http://localhost/api/edge/video-tags?ids=sm123,sm456')
      
      const response = await GET(request)
      const data = await response.json()
      
      expect(response.status).toBe(200)
      expect(data.tags).toEqual(mockTags)
      expect(data.timestamp).toBeDefined()
      expect(data.count).toBe(2)
      expect(fetchVideoTagsMock).toHaveBeenCalledWith(['sm123', 'sm456'])
    })

    it('should handle fetch errors gracefully', async () => {
      fetchVideoTagsMock.mockRejectedValue(new Error('Network error'))
      
      const { GET } = await import('@/app/api/edge/video-tags/route')
      const request = new NextRequest('http://localhost/api/edge/video-tags?ids=sm123')
      
      const response = await GET(request)
      const data = await response.json()
      
      expect(response.status).toBe(500)
      expect(data.error).toBe('Failed to fetch video tags')
    })

    it('should set proper cache headers for hourly updates', async () => {
      fetchVideoTagsMock.mockResolvedValue({})
      
      const { GET } = await import('@/app/api/edge/video-tags/route')
      const request = new NextRequest('http://localhost/api/edge/video-tags?ids=sm123')
      
      const response = await GET(request)
      
      // タグは1時間キャッシュ（毎時0分更新のため）
      expect(response.headers.get('Cache-Control')).toBe('public, s-maxage=3600, max-age=3600')
    })

    it('should validate Edge runtime export', async () => {
      const module = await import('@/app/api/edge/video-tags/route')
      expect(module.runtime).toBe('edge')
    })
  })
})