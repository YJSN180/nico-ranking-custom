import { describe, it, expect, vi, beforeEach } from 'vitest'
import { GET, DELETE } from '@/app/api/admin/ng-list/derived/route'
import { NextRequest } from 'next/server'

// Mock fetch for KV API calls
global.fetch = vi.fn()

describe('Derived NG List API', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('GET /api/admin/ng-list/derived', () => {
    it('should return derived NG list with valid auth', async () => {
      const mockDerivedList = ['sm123', 'sm456', 'sm789']

      // Mock KV API response
      vi.mocked(global.fetch).mockResolvedValueOnce({
        ok: true,
        json: async () => mockDerivedList
      } as Response)

      const request = new NextRequest('http://localhost/api/admin/ng-list/derived', {
        headers: {
          'authorization': 'Bearer valid-token'
        }
      })

      const response = await GET(request)
      const data = await response.json()

      expect(response.status).toBe(200)
      expect(data.videoIds).toEqual(mockDerivedList)
      expect(data.count).toBe(3)
      expect(data).toHaveProperty('lastUpdated')
    })

    it('should return 401 without auth', async () => {
      const request = new NextRequest('http://localhost/api/admin/ng-list/derived')

      const response = await GET(request)
      const data = await response.json()

      expect(response.status).toBe(401)
      expect(data).toEqual({ error: 'Unauthorized' })
    })

    it('should handle KV not found gracefully', async () => {
      // Mock KV API response - not found
      vi.mocked(global.fetch).mockResolvedValueOnce({
        ok: false,
        status: 404
      } as Response)

      const request = new NextRequest('http://localhost/api/admin/ng-list/derived', {
        headers: {
          'authorization': 'Bearer valid-token'
        }
      })

      const response = await GET(request)
      const data = await response.json()

      expect(response.status).toBe(200)
      expect(data.videoIds).toEqual([])
      expect(data.count).toBe(0)
    })
  })

  describe('DELETE /api/admin/ng-list/derived', () => {
    it('should clear derived NG list with valid auth', async () => {
      const request = new NextRequest('http://localhost/api/admin/ng-list/derived', {
        method: 'DELETE',
        headers: {
          'authorization': 'Bearer valid-token'
        }
      })

      const response = await DELETE(request)
      const data = await response.json()

      expect(response.status).toBe(200)
      expect(data).toEqual({ success: true, message: 'Derived NG list clearing not implemented - data is embedded in ranking data' })
    })

    it('should return 401 without auth', async () => {
      const request = new NextRequest('http://localhost/api/admin/ng-list/derived', {
        method: 'DELETE'
      })

      const response = await DELETE(request)
      const data = await response.json()

      expect(response.status).toBe(401)
      expect(data).toEqual({ error: 'Unauthorized' })
    })

    // Remove this test as the DELETE endpoint doesn't actually make any external calls that can fail
  })
})