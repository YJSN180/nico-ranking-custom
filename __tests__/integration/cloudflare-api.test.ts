import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'
import { GET as getRanking } from '@/app/api/ranking/route'
import { GET as getSnapshot } from '@/app/api/snapshot/route'

// Mock Cloudflare KV module
vi.mock('@/lib/cloudflare-kv', () => ({
  getFromCloudflareKV: vi.fn(),
}))

// Mock pako
vi.mock('pako', () => ({
  ungzip: vi.fn((data) => data),
  gzip: vi.fn((data) => data),
}))

import { getFromCloudflareKV } from '@/lib/cloudflare-kv'

describe('API Routes', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('/api/snapshot', () => {
    it('should return snapshot data when available', async () => {
      const mockSnapshot = {
        timestamp: '2025-01-01T00:00:00Z',
        version: '1.0',
        genres: {
          all: {
            '24h': {
              items: [],
              popularTags: []
            }
          }
        }
      }

      const encoder = new TextEncoder()
      const mockData = encoder.encode(JSON.stringify(mockSnapshot))
      vi.mocked(getFromCloudflareKV).mockResolvedValueOnce(mockData.buffer)

      const request = new NextRequest('http://localhost:3000/api/snapshot')
      const response = await getSnapshot(request)

      expect(response.status).toBe(200)
      const data = await response.json()
      expect(data.timestamp).toBe('2025-01-01T00:00:00Z')
      expect(data.version).toBe('1.0')
    })

    it('should return 404 when no data available', async () => {
      vi.mocked(getFromCloudflareKV).mockResolvedValueOnce(null)

      const request = new NextRequest('http://localhost:3000/api/snapshot')
      const response = await getSnapshot(request)

      expect(response.status).toBe(404)
      const data = await response.json()
      expect(data.error).toBe('No ranking data available')
    })

    it('should handle errors gracefully', async () => {
      vi.mocked(getFromCloudflareKV).mockRejectedValueOnce(new Error('KV error'))

      const request = new NextRequest('http://localhost:3000/api/snapshot')
      const response = await getSnapshot(request)

      expect(response.status).toBe(500)
      const data = await response.json()
      expect(data.error).toBe('Failed to fetch ranking data')
    })
  })

  describe('/api/ranking', () => {
    const mockSnapshot = {
      timestamp: '2025-01-01T00:00:00Z',
      version: '1.0',
      genres: {
        all: {
          '24h': {
            items: [
              {
                rank: 1,
                id: 'sm123',
                title: 'Test Video 1',
                thumbURL: 'https://example.com/thumb1.jpg',
                views: 1000,
                comments: 10,
                mylists: 5,
                likes: 20,
                tags: ['tag1', 'tag2'],
              },
              {
                rank: 2,
                id: 'sm124',
                title: 'Test Video 2',
                thumbURL: 'https://example.com/thumb2.jpg',
                views: 800,
                comments: 8,
                mylists: 4,
                likes: 16,
                tags: ['tag2', 'tag3'],
              }
            ],
            popularTags: ['tag1', 'tag2', 'tag3']
          },
          'hour': {
            items: [],
            popularTags: []
          }
        },
        game: {
          '24h': {
            items: [
              {
                rank: 1,
                id: 'sm125',
                title: 'Game Video',
                thumbURL: 'https://example.com/thumb3.jpg',
                views: 500,
                tags: ['game', 'tag1'],
              }
            ],
            popularTags: ['game', 'tag1']
          }
        }
      }
    }

    beforeEach(() => {
      const encoder = new TextEncoder()
      const mockData = encoder.encode(JSON.stringify(mockSnapshot))
      vi.mocked(getFromCloudflareKV).mockResolvedValue(mockData.buffer)
    })

    it('should return ranking data for valid genre and period', async () => {
      const request = new NextRequest('http://localhost:3000/api/ranking?genre=all&period=24h')
      const response = await getRanking(request)

      expect(response.status).toBe(200)
      const data = await response.json()
      expect(data.items).toHaveLength(2)
      expect(data.items[0].id).toBe('sm123')
      expect(data.popularTags).toEqual(['tag1', 'tag2', 'tag3'])
      expect(data.hasMore).toBe(false)
      expect(data.totalItems).toBe(2)
    })

    it('should filter by tag when specified', async () => {
      const request = new NextRequest('http://localhost:3000/api/ranking?genre=all&period=24h&tag=tag2')
      const response = await getRanking(request)

      expect(response.status).toBe(200)
      const data = await response.json()
      expect(data.items).toHaveLength(2) // Both videos have tag2
      expect(data.hasMore).toBe(false)
    })

    it('should support pagination', async () => {
      const request = new NextRequest('http://localhost:3000/api/ranking?genre=all&period=24h&page=2')
      const response = await getRanking(request)

      expect(response.status).toBe(200)
      const data = await response.json()
      expect(data.items).toHaveLength(0) // Page 2 is empty
      expect(data.hasMore).toBe(false)
    })

    it('should return 400 for invalid period', async () => {
      const request = new NextRequest('http://localhost:3000/api/ranking?genre=all&period=invalid')
      const response = await getRanking(request)

      expect(response.status).toBe(400)
      const data = await response.json()
      expect(data.error).toBe('Invalid period')
    })

    it('should return 404 for non-existent genre', async () => {
      const request = new NextRequest('http://localhost:3000/api/ranking?genre=nonexistent&period=24h')
      const response = await getRanking(request)

      expect(response.status).toBe(404)
      const data = await response.json()
      expect(data.error).toBe('Genre not found')
    })

    it('should handle missing KV data gracefully', async () => {
      vi.mocked(getFromCloudflareKV).mockResolvedValueOnce(null)

      const request = new NextRequest('http://localhost:3000/api/ranking?genre=all&period=24h')
      const response = await getRanking(request)

      expect(response.status).toBe(404)
      const data = await response.json()
      expect(data.error).toBe('No ranking data available')
    })
  })
})