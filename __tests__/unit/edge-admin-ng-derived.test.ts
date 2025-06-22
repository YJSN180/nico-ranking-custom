import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'
import { GET, DELETE } from '@/app/api/edge/admin/ng-list-derived/route'

// Mock fetch globally
const mockFetch = vi.fn()
global.fetch = mockFetch

describe('Edge Admin NG Derived List API', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.resetModules()
    
    // Mock environment variables
    process.env.CLOUDFLARE_ACCOUNT_ID = 'test-account-id'
    process.env.CLOUDFLARE_KV_NAMESPACE_ID = 'test-namespace-id'
    process.env.CLOUDFLARE_API_TOKEN = 'test-api-token'
  })

  describe('GET /api/edge/admin/ng-list-derived', () => {
    it('should require authentication', async () => {
      const request = new NextRequest('http://localhost/api/edge/admin/ng-list-derived')
      const response = await GET(request)
      
      expect(response.status).toBe(401)
      const data = await response.json()
      expect(data.error).toBe('Unauthorized')
    })

    it('should return empty list when KV key does not exist', async () => {
      const request = new NextRequest('http://localhost/api/edge/admin/ng-list-derived', {
        headers: {
          'Cookie': 'admin-auth=valid'
        }
      })

      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 404
      })

      const response = await GET(request)
      
      expect(response.status).toBe(200)
      const data = await response.json()
      expect(data).toEqual({
        videoIds: [],
        count: 0,
        lastUpdated: null,
        totalVideosProcessed: 0
      })
    })

    it('should return derived NG list from KV', async () => {
      const request = new NextRequest('http://localhost/api/edge/admin/ng-list-derived', {
        headers: {
          'Cookie': 'admin-auth=valid'
        }
      })

      const mockVideoIds = ['sm12345', 'sm67890', 'sm11111']
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockVideoIds
      })

      const response = await GET(request)
      
      expect(response.status).toBe(200)
      const data = await response.json()
      expect(data).toEqual({
        videoIds: mockVideoIds,
        count: 3,
        lastUpdated: expect.any(String),
        totalVideosProcessed: 0
      })

      // Verify correct KV API call
      expect(mockFetch).toHaveBeenCalledWith(
        'https://api.cloudflare.com/client/v4/accounts/test-account-id/storage/kv/namespaces/test-namespace-id/values/ng-list-derived',
        {
          headers: {
            'Authorization': 'Bearer test-api-token'
          }
        }
      )
    })

    it('should handle KV API errors gracefully', async () => {
      const request = new NextRequest('http://localhost/api/edge/admin/ng-list-derived', {
        headers: {
          'Cookie': 'admin-auth=valid'
        }
      })

      mockFetch.mockRejectedValueOnce(new Error('Network error'))

      const response = await GET(request)
      
      expect(response.status).toBe(200)
      const data = await response.json()
      expect(data).toEqual({
        videoIds: [],
        count: 0,
        lastUpdated: null,
        totalVideosProcessed: 0
      })
    })

    it('should validate runtime is edge', () => {
      // Import the route module to check runtime export
      return import('@/app/api/edge/admin/ng-list-derived/route').then(module => {
        expect(module.runtime).toBe('edge')
      })
    })
  })

  describe('DELETE /api/edge/admin/ng-list-derived', () => {
    it('should require authentication', async () => {
      const request = new NextRequest('http://localhost/api/edge/admin/ng-list-derived', {
        method: 'DELETE'
      })
      const response = await DELETE(request)
      
      expect(response.status).toBe(401)
    })

    it('should clear the derived NG list', async () => {
      const request = new NextRequest('http://localhost/api/edge/admin/ng-list-derived', {
        method: 'DELETE',
        headers: {
          'Cookie': 'admin-auth=valid'
        }
      })

      mockFetch.mockResolvedValueOnce({
        ok: true
      })

      const response = await DELETE(request)
      
      expect(response.status).toBe(200)
      const data = await response.json()
      expect(data).toEqual({
        success: true,
        message: 'Derived NG list cleared successfully'
      })

      // Verify DELETE call to KV
      expect(mockFetch).toHaveBeenCalledWith(
        'https://api.cloudflare.com/client/v4/accounts/test-account-id/storage/kv/namespaces/test-namespace-id/values/ng-list-derived',
        {
          method: 'DELETE',
          headers: {
            'Authorization': 'Bearer test-api-token'
          }
        }
      )
    })

    it('should handle 404 as success when clearing', async () => {
      const request = new NextRequest('http://localhost/api/edge/admin/ng-list-derived', {
        method: 'DELETE',
        headers: {
          'Cookie': 'admin-auth=valid'
        }
      })

      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 404
      })

      const response = await DELETE(request)
      
      expect(response.status).toBe(200)
      const data = await response.json()
      expect(data.success).toBe(true)
    })
  })
})