import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'
import { DELETE } from '@/app/api/edge/admin/ng-list-derived/[videoId]/route'

// Mock fetch globally
const mockFetch = vi.fn()
global.fetch = mockFetch

describe('Edge Admin NG Derived List Individual Delete API', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.resetModules()
    
    // Mock environment variables
    process.env.CLOUDFLARE_ACCOUNT_ID = 'test-account-id'
    process.env.CLOUDFLARE_KV_NAMESPACE_ID = 'test-namespace-id'
    process.env.CLOUDFLARE_API_TOKEN = 'test-api-token'
  })

  describe('DELETE /api/edge/admin/ng-list-derived/[videoId]', () => {
    it('should require authentication', async () => {
      const request = new NextRequest('http://localhost/api/edge/admin/ng-list-derived/sm12345', {
        method: 'DELETE'
      })
      const response = await DELETE(request, { params: { videoId: 'sm12345' } })
      
      expect(response.status).toBe(401)
      const data = await response.json()
      expect(data.error).toBe('Unauthorized')
    })

    it('should validate video ID format', async () => {
      const request = new NextRequest('http://localhost/api/edge/admin/ng-list-derived/invalid-id', {
        method: 'DELETE',
        headers: {
          'Cookie': 'admin-auth=valid'
        }
      })
      const response = await DELETE(request, { params: { videoId: 'invalid-id' } })
      
      expect(response.status).toBe(400)
      const data = await response.json()
      expect(data.error).toBe('Invalid video ID format')
    })

    it('should remove video ID from derived list', async () => {
      const request = new NextRequest('http://localhost/api/edge/admin/ng-list-derived/sm12345', {
        method: 'DELETE',
        headers: {
          'Cookie': 'admin-auth=valid'
        }
      })

      // Mock getting current list
      const currentList = ['sm11111', 'sm12345', 'sm67890']
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => currentList
      })

      // Mock updating list
      mockFetch.mockResolvedValueOnce({
        ok: true
      })

      const response = await DELETE(request, { params: { videoId: 'sm12345' } })
      
      expect(response.status).toBe(200)
      const data = await response.json()
      expect(data).toEqual({
        success: true,
        message: 'Video ID removed from derived NG list',
        remainingCount: 2
      })

      // Verify GET call
      expect(mockFetch).toHaveBeenNthCalledWith(1,
        'https://api.cloudflare.com/client/v4/accounts/test-account-id/storage/kv/namespaces/test-namespace-id/values/ng-list-derived',
        {
          headers: {
            'Authorization': 'Bearer test-api-token'
          }
        }
      )

      // Verify PUT call with updated list
      expect(mockFetch).toHaveBeenNthCalledWith(2,
        'https://api.cloudflare.com/client/v4/accounts/test-account-id/storage/kv/namespaces/test-namespace-id/values/ng-list-derived',
        {
          method: 'PUT',
          headers: {
            'Authorization': 'Bearer test-api-token',
            'Content-Type': 'application/json'
          },
          body: JSON.stringify(['sm11111', 'sm67890'])
        }
      )
    })

    it('should handle video ID not found in list', async () => {
      const request = new NextRequest('http://localhost/api/edge/admin/ng-list-derived/sm99999', {
        method: 'DELETE',
        headers: {
          'Cookie': 'admin-auth=valid'
        }
      })

      const currentList = ['sm11111', 'sm67890']
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => currentList
      })

      const response = await DELETE(request, { params: { videoId: 'sm99999' } })
      
      expect(response.status).toBe(404)
      const data = await response.json()
      expect(data.error).toBe('Video ID not found in derived NG list')
    })

    it('should handle empty derived list', async () => {
      const request = new NextRequest('http://localhost/api/edge/admin/ng-list-derived/sm12345', {
        method: 'DELETE',
        headers: {
          'Cookie': 'admin-auth=valid'
        }
      })

      // Mock 404 for empty list
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 404
      })

      const response = await DELETE(request, { params: { videoId: 'sm12345' } })
      
      expect(response.status).toBe(404)
      const data = await response.json()
      expect(data.error).toBe('Derived NG list is empty')
    })

    it('should handle KV API errors gracefully', async () => {
      const request = new NextRequest('http://localhost/api/edge/admin/ng-list-derived/sm12345', {
        method: 'DELETE',
        headers: {
          'Cookie': 'admin-auth=valid'
        }
      })

      mockFetch.mockRejectedValueOnce(new Error('Network error'))

      const response = await DELETE(request, { params: { videoId: 'sm12345' } })
      
      expect(response.status).toBe(500)
      const data = await response.json()
      expect(data.error).toBe('Failed to delete video ID')
    })

    it('should validate runtime is edge', () => {
      // Import the route module to check runtime export
      return import('@/app/api/edge/admin/ng-list-derived/[videoId]/route').then(module => {
        expect(module.runtime).toBe('edge')
      })
    })
  })
})