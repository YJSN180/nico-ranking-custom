import { describe, it, expect, vi, beforeEach } from 'vitest'
import { GET, DELETE } from '@/app/api/admin/ng-list/derived/route'
import { NextRequest } from 'next/server'

// Mock the ng-list-server module
vi.mock('@/lib/ng-list-server', () => ({
  getServerDerivedNGList: vi.fn(),
  clearServerDerivedNGList: vi.fn()
}))

import { getServerDerivedNGList, clearServerDerivedNGList } from '@/lib/ng-list-server'

describe('Derived NG List API', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('GET /api/admin/ng-list/derived', () => {
    it('should return derived NG list with valid auth', async () => {
      const mockDerivedList = ['sm123', 'sm456', 'sm789']

      ;(getServerDerivedNGList as any).mockResolvedValueOnce(mockDerivedList)

      const request = new NextRequest('http://localhost/api/admin/ng-list/derived', {
        headers: {
          'authorization': 'Bearer valid-token'
        }
      })

      const response = await GET(request)
      const data = await response.json()

      expect(response.status).toBe(200)
      expect(data.videoIds).toEqual(mockDerivedList)
      expect(data).toHaveProperty('lastUpdated')
    })

    it('should return 401 without auth', async () => {
      const request = new NextRequest('http://localhost/api/admin/ng-list/derived')

      const response = await GET(request)
      const data = await response.json()

      expect(response.status).toBe(401)
      expect(data).toEqual({ error: 'Unauthorized' })
    })

    it('should handle errors gracefully', async () => {
      ;(getServerDerivedNGList as any).mockRejectedValueOnce(new Error('KV error'))

      const request = new NextRequest('http://localhost/api/admin/ng-list/derived', {
        headers: {
          'authorization': 'Bearer valid-token'
        }
      })

      const response = await GET(request)
      const data = await response.json()

      expect(response.status).toBe(500)
      expect(data).toEqual({ error: 'Failed to fetch derived NG list' })
    })
  })

  describe('DELETE /api/admin/ng-list/derived', () => {
    it('should clear derived NG list with valid auth', async () => {
      ;(clearServerDerivedNGList as any).mockResolvedValueOnce(undefined)

      const request = new NextRequest('http://localhost/api/admin/ng-list/derived', {
        method: 'DELETE',
        headers: {
          'authorization': 'Bearer valid-token'
        }
      })

      const response = await DELETE(request)
      const data = await response.json()

      expect(response.status).toBe(200)
      expect(data).toEqual({ success: true })
      expect(clearServerDerivedNGList).toHaveBeenCalled()
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

    it('should handle clear errors', async () => {
      ;(clearServerDerivedNGList as any).mockRejectedValueOnce(new Error('KV error'))

      const request = new NextRequest('http://localhost/api/admin/ng-list/derived', {
        method: 'DELETE',
        headers: {
          'authorization': 'Bearer valid-token'
        }
      })

      const response = await DELETE(request)
      const data = await response.json()

      expect(response.status).toBe(500)
      expect(data).toEqual({ error: 'Failed to clear derived NG list' })
    })
  })
})