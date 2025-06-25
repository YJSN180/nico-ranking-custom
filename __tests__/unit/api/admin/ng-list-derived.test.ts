import { describe, it, expect, vi, beforeEach } from 'vitest'
import { GET, DELETE } from '@/app/api/admin/ng-list/derived/route'
import { NextRequest } from 'next/server'

// Mock fetch for KV API calls
global.fetch = vi.fn()

describe('Derived NG List API', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    // Set up environment variables
    process.env.CLOUDFLARE_ACCOUNT_ID = 'test-account-id'
    process.env.CLOUDFLARE_KV_NAMESPACE_ID = 'test-namespace-id'
    process.env.CLOUDFLARE_API_TOKEN = 'test-api-token'
  })
  
  afterEach(() => {
    // Clean up environment variables
    delete process.env.CLOUDFLARE_ACCOUNT_ID
    delete process.env.CLOUDFLARE_KV_NAMESPACE_ID
    delete process.env.CLOUDFLARE_API_TOKEN
  })

  describe('GET /api/admin/ng-list/derived', () => {
    it('should forward to Edge Function and return derived NG list', async () => {
      const mockDerivedList = ['sm123', 'sm456', 'sm789']

      // Mock the Cloudflare KV fetch - KV stores just the array
      vi.mocked(global.fetch).mockResolvedValueOnce({
        ok: true,
        status: 200,
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
      expect(data.totalVideosProcessed).toBe(3)
    })

    it('should forward 401 status from Edge Function', async () => {
      // Mock the internal fetch to Edge Function
      vi.mocked(global.fetch).mockResolvedValueOnce({
        ok: false,
        status: 401,
        json: async () => ({ error: 'Unauthorized' })
      } as Response)

      const request = new NextRequest('http://localhost/api/admin/ng-list/derived')

      const response = await GET(request)
      const data = await response.json()

      expect(response.status).toBe(401)
      expect(data).toEqual({ error: 'Unauthorized' })
    })

    it('should handle empty list response from Edge Function', async () => {
      // Mock the Cloudflare KV fetch - KV stores just the array
      vi.mocked(global.fetch).mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => []
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
    it('should forward to Edge Function and clear derived NG list', async () => {
      const mockResponse = {
        success: true,
        message: 'Derived NG list cleared successfully'
      }

      // Mock the internal fetch to Edge Function
      vi.mocked(global.fetch).mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => mockResponse
      } as Response)

      const request = new NextRequest('http://localhost/api/admin/ng-list/derived', {
        method: 'DELETE',
        headers: {
          'authorization': 'Bearer valid-token'
        }
      })

      const response = await DELETE(request)
      const data = await response.json()

      expect(response.status).toBe(200)
      expect(data).toEqual(mockResponse)
    })

    it('should forward 401 status from Edge Function for DELETE', async () => {
      // Mock the internal fetch to Edge Function
      vi.mocked(global.fetch).mockResolvedValueOnce({
        ok: false,
        status: 401,
        json: async () => ({ error: 'Unauthorized' })
      } as Response)

      const request = new NextRequest('http://localhost/api/admin/ng-list/derived', {
        method: 'DELETE'
      })

      const response = await DELETE(request)
      const data = await response.json()

      expect(response.status).toBe(401)
      expect(data).toEqual({ error: 'Unauthorized' })
    })
  })
})