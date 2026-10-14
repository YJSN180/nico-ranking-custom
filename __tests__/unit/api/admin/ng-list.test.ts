import { describe, it, expect, vi, beforeEach } from 'vitest'
import { GET, POST } from '@/app/api/admin/ng-list/route'
import { NextRequest } from 'next/server'

// Mock fetch for Edge Function calls
global.fetch = vi.fn()

// Mock the ng-list-server module
vi.mock('@/lib/ng-list-server', () => ({
  getAdminNGList: vi.fn(),
  setNGListManual: vi.fn()
}))

import { getAdminNGList, setNGListManual } from '@/lib/ng-list-server'

describe('NG List API', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('GET /api/admin/ng-list', () => {
    it('should return NG list with valid auth', async () => {
      const mockNGList = {
        videoIds: ['sm123'],
        videoTitles: { exact: ['Test Video'], partial: [] },
        authorIds: ['author1'],
        authorNames: { exact: ['Test Author'], partial: [] },
        derivedVideoIds: ['sm456', 'sm789']
      }

      vi.mocked(getAdminNGList).mockResolvedValueOnce(mockNGList)

      const request = new NextRequest('http://localhost/api/admin/ng-list', {
        headers: {
          'authorization': 'Bearer valid-token'
        }
      })

      const response = await GET(request)
      const data = await response.json()

      expect(response.status).toBe(200)
      expect(data).toEqual(mockNGList)
    })

    it('should return 401 without auth', async () => {
      const request = new NextRequest('http://localhost/api/admin/ng-list')

      const response = await GET(request)
      const data = await response.json()

      expect(response.status).toBe(401)
      expect(data).toEqual({ error: 'Unauthorized' })
    })

    it('should handle errors gracefully', async () => {
      // KV を読めなければ空の一覧を返さず 503（画面は編集できない状態で表示する）
      vi.mocked(getAdminNGList).mockRejectedValueOnce(new Error('KV get failed: 429'))

      const request = new NextRequest('http://localhost/api/admin/ng-list', {
        headers: {
          'authorization': 'Bearer valid-token'
        }
      })

      const response = await GET(request)
      const data = await response.json()

      expect(response.status).toBe(503)
      expect(data).toEqual({ error: 'Failed to fetch NG list' })
      expect(response.headers.get('cache-control')).toContain('no-store')
    })
  })

  describe('POST /api/admin/ng-list', () => {
    it('should update NG list with valid data', async () => {
      const ngList = {
        videoIds: ['sm123'],
        videoTitles: ['Test Video'],
        authorIds: ['author1'],
        authorNames: ['Test Author']
      }

      ;(setNGListManual as any).mockResolvedValueOnce(undefined)

      const request = new NextRequest('http://localhost/api/admin/ng-list', {
        method: 'POST',
        headers: {
          'authorization': 'Bearer valid-token',
          'content-type': 'application/json'
        },
        body: JSON.stringify(ngList)
      })

      const response = await POST(request)
      const data = await response.json()

      expect(response.status).toBe(200)
      expect(data).toEqual({ success: true })
      expect(setNGListManual).toHaveBeenCalledWith(ngList)
    })

    it('should return 400 for invalid data format', async () => {
      const invalidData = {
        videoIds: ['sm123']
        // Missing required fields
      }

      const request = new NextRequest('http://localhost/api/admin/ng-list', {
        method: 'POST',
        headers: {
          'authorization': 'Bearer valid-token',
          'content-type': 'application/json'
        },
        body: JSON.stringify(invalidData)
      })

      const response = await POST(request)
      const data = await response.json()

      expect(response.status).toBe(400)
      expect(data).toEqual({ error: 'Invalid NG list format' })
    })

    it('should return 401 without auth', async () => {
      const ngList = {
        videoIds: ['sm123'],
        videoTitles: ['Test Video'],
        authorIds: ['author1'],
        authorNames: ['Test Author']
      }

      const request = new NextRequest('http://localhost/api/admin/ng-list', {
        method: 'POST',
        body: JSON.stringify(ngList)
      })

      const response = await POST(request)
      const data = await response.json()

      expect(response.status).toBe(401)
      expect(data).toEqual({ error: 'Unauthorized' })
    })

    it('should handle save errors', async () => {
      const ngList = {
        videoIds: ['sm123'],
        videoTitles: ['Test Video'],
        authorIds: ['author1'],
        authorNames: ['Test Author']
      }

      ;(setNGListManual as any).mockRejectedValueOnce(new Error('KV error'))

      const request = new NextRequest('http://localhost/api/admin/ng-list', {
        method: 'POST',
        headers: {
          'authorization': 'Bearer valid-token',
          'content-type': 'application/json'
        },
        body: JSON.stringify(ngList)
      })

      const response = await POST(request)
      const data = await response.json()

      expect(response.status).toBe(500)
      expect(data).toEqual({ error: 'Failed to update NG list' })
    })
  })
})