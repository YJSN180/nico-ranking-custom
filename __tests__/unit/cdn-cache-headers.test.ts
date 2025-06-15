import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'
import { GET as rankingGET } from '@/app/api/ranking/route'
import { GET as popularTagsGET } from '@/app/api/popular-tags/route'

// Mock the KV and scraper functions
vi.mock('@/lib/cloudflare-kv', () => ({
  getGenreRanking: vi.fn(),
  getTagRanking: vi.fn()
}))

vi.mock('@/lib/scraper', () => ({
  scrapeRankingPage: vi.fn()
}))

import { getGenreRanking, getTagRanking } from '@/lib/cloudflare-kv'
import { scrapeRankingPage } from '@/lib/scraper'

describe('CDN Cache Headers', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    // Mock environment variables
    process.env.CLOUDFLARE_KV_NAMESPACE_ID = 'test-namespace'
  })

  describe('Ranking API', () => {
    it('should set 5-minute cache headers for genre rankings', async () => {
      // Arrange
      const mockData = {
        items: [{ rank: 1, id: 'sm12345', title: 'Test', thumbURL: 'test.jpg', views: 1000 }],
        popularTags: ['tag1', 'tag2']
      }
      vi.mocked(getGenreRanking).mockResolvedValue(mockData)

      const request = new NextRequest('http://localhost:3000/api/ranking?genre=all&period=24h')

      // Act
      const response = await rankingGET(request)

      // Assert
      expect(response.headers.get('Cache-Control')).toBe('public, s-maxage=300, stale-while-revalidate=600')
      expect(response.headers.get('X-Cache-Status')).toBe('CF-HIT')
    })

    it('should set 5-minute cache headers for tag rankings', async () => {
      // Arrange
      const mockItems = [
        { rank: 1, id: 'sm12345', title: 'Test', thumbURL: 'test.jpg', views: 1000 }
      ]
      vi.mocked(getTagRanking).mockResolvedValue(mockItems)

      const request = new NextRequest('http://localhost:3000/api/ranking?genre=other&period=24h&tag=音MAD')

      // Act
      const response = await rankingGET(request)

      // Assert
      expect(response.headers.get('Cache-Control')).toBe('public, s-maxage=300, stale-while-revalidate=600')
      expect(response.headers.get('X-Cache-Status')).toBe('CF-HIT')
    })

    it('should set cache headers even for dynamic fetch', async () => {
      // Arrange
      vi.mocked(getGenreRanking).mockResolvedValue(null)
      vi.mocked(scrapeRankingPage).mockResolvedValue({
        items: [{ rank: 1, id: 'sm12345', title: 'Test', thumbURL: 'test.jpg', views: 1000 }],
        totalPages: 1
      })

      const request = new NextRequest('http://localhost:3000/api/ranking?genre=all&period=24h')

      // Act
      const response = await rankingGET(request)

      // Assert
      expect(response.headers.get('Cache-Control')).toBe('public, s-maxage=300, stale-while-revalidate=600')
      expect(response.headers.get('X-Cache-Status')).toBe('DYNAMIC')
    })
  })

  describe('Popular Tags API', () => {
    it('should set 5-minute cache headers for popular tags', async () => {
      // Arrange
      const request = new NextRequest('http://localhost:3000/api/popular-tags?genre=other&period=24h')

      // Mock the module
      vi.doMock('@/lib/popular-tags', () => ({
        getPopularTags: vi.fn().mockResolvedValue(['tag1', 'tag2', 'tag3'])
      }))

      // Act
      const response = await popularTagsGET(request)

      // Assert
      expect(response.headers.get('Cache-Control')).toBe('public, s-maxage=300, stale-while-revalidate=60')
    })
  })
})