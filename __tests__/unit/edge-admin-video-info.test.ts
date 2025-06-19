import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'
import { GET } from '@/app/api/edge/admin/video-info/route'

// Mock fetch globally
const mockFetch = vi.fn()
global.fetch = mockFetch

describe('Edge Admin Video Info API', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.resetModules()
  })

  describe('GET /api/edge/admin/video-info', () => {
    it('should require authentication', async () => {
      const request = new NextRequest('http://localhost/api/edge/admin/video-info?ids=sm12345')
      const response = await GET(request)
      
      expect(response.status).toBe(401)
      const data = await response.json()
      expect(data.error).toBe('Unauthorized')
    })

    it('should require video IDs parameter', async () => {
      const request = new NextRequest('http://localhost/api/edge/admin/video-info', {
        headers: {
          'Cookie': 'admin-auth=valid'
        }
      })
      const response = await GET(request)
      
      expect(response.status).toBe(400)
      const data = await response.json()
      expect(data.error).toBe('Video IDs required')
    })

    it('should limit video IDs to 50', async () => {
      const ids = Array.from({ length: 51 }, (_, i) => `sm${i}`).join(',')
      const request = new NextRequest(`http://localhost/api/edge/admin/video-info?ids=${ids}`, {
        headers: {
          'Cookie': 'admin-auth=valid'
        }
      })
      const response = await GET(request)
      
      expect(response.status).toBe(400)
      const data = await response.json()
      expect(data.error).toBe('Too many video IDs (max 50)')
    })

    it('should fetch video information from Snapshot API', async () => {
      const request = new NextRequest('http://localhost/api/edge/admin/video-info?ids=sm9,sm500873', {
        headers: {
          'Cookie': 'admin-auth=valid'
        }
      })

      // Mock Snapshot API response
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          data: [
            {
              contentId: 'sm9',
              title: 'レッツゴー！陰陽師',
              userId: '4',
              channelId: null,
              viewCounter: 22480741,
              commentCounter: 5570636,
              mylistCounter: 182352,
              likeCounter: 37901
            },
            {
              contentId: 'sm500873',
              title: '組曲『ニコニコ動画』',
              userId: '7',
              channelId: 'ch123',
              viewCounter: 12198528,
              commentCounter: 5009896,
              mylistCounter: 156868,
              likeCounter: 13278
            }
          ]
        })
      })

      const response = await GET(request)
      
      expect(response.status).toBe(200)
      const data = await response.json()
      
      expect(data).toEqual({
        videos: [
          {
            id: 'sm9',
            title: 'レッツゴー！陰陽師',
            authorName: 'user/4',
            url: 'https://www.nicovideo.jp/watch/sm9',
            viewCount: 22480741,
            commentCount: 5570636,
            mylistCount: 182352,
            likeCount: 37901
          },
          {
            id: 'sm500873',
            title: '組曲『ニコニコ動画』',
            authorName: 'channel/ch123',
            url: 'https://www.nicovideo.jp/watch/sm500873',
            viewCount: 12198528,
            commentCount: 5009896,
            mylistCount: 156868,
            likeCount: 13278
          }
        ],
        notFound: []
      })

      // Verify Snapshot API call with jsonFilter
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('https://snapshot.search.nicovideo.jp/api/v2/snapshot/video/contents/search'),
        expect.objectContaining({
          headers: expect.objectContaining({
            'User-Agent': 'Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)'
          })
        })
      )

      const callUrl = mockFetch.mock.calls[0][0]
      expect(callUrl).toContain('jsonFilter=')
    })

    it('should handle missing videos', async () => {
      const request = new NextRequest('http://localhost/api/edge/admin/video-info?ids=sm9,sm_missing', {
        headers: {
          'Cookie': 'admin-auth=valid'
        }
      })

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          data: [
            {
              contentId: 'sm9',
              title: 'レッツゴー！陰陽師',
              userId: '4',
              viewCounter: 22480741
            }
          ]
        })
      })

      const response = await GET(request)
      
      expect(response.status).toBe(200)
      const data = await response.json()
      
      expect(data.videos).toHaveLength(1)
      expect(data.notFound).toEqual(['sm_missing'])
    })

    it('should handle Snapshot API errors gracefully', async () => {
      const request = new NextRequest('http://localhost/api/edge/admin/video-info?ids=sm9', {
        headers: {
          'Cookie': 'admin-auth=valid'
        }
      })

      mockFetch.mockRejectedValueOnce(new Error('API Error'))

      const response = await GET(request)
      
      expect(response.status).toBe(500)
      const data = await response.json()
      expect(data.error).toBe('Failed to fetch video information')
    })

    it('should set cache headers', async () => {
      const request = new NextRequest('http://localhost/api/edge/admin/video-info?ids=sm9', {
        headers: {
          'Cookie': 'admin-auth=valid'
        }
      })

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ data: [] })
      })

      const response = await GET(request)
      
      // Should cache for 5 minutes since it's admin data
      expect(response.headers.get('Cache-Control')).toBe('private, s-maxage=300, stale-while-revalidate=60')
    })

    it('should validate runtime is edge', () => {
      // Import the route module to check runtime export
      return import('@/app/api/edge/admin/video-info/route').then(module => {
        expect(module.runtime).toBe('edge')
      })
    })
  })
})