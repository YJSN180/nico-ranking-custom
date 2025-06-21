import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'
import { GET } from '@/app/api/ranking/route'

// Mock cloudflare-kv module
vi.mock('@/lib/cloudflare-kv', () => ({
  getGenreRanking: vi.fn(),
  getTagRanking: vi.fn()
}))

describe('Tag Ranking 404 Error Handling', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    // Mock environment variable
    process.env.CLOUDFLARE_KV_NAMESPACE_ID = 'test-namespace'
  })

  it('should return 404 with proper error message when tag ranking is not found', async () => {
    const { getTagRanking } = await import('@/lib/cloudflare-kv')
    
    // Mock getTagRanking to return null (tag not in popular tags)
    vi.mocked(getTagRanking).mockResolvedValue(null)
    
    const request = new NextRequest('http://localhost:3000/api/ranking?genre=all&period=24h&tag=unpopular-tag')
    const response = await GET(request)
    
    expect(response.status).toBe(404)
    
    const data = await response.json()
    expect(data).toEqual({
      error: 'Tag ranking not found. This tag may not be in the popular tags list.',
      items: [],
      hasMore: false,
      totalCached: 0
    })
  })

  it('should return tag ranking data when tag is found', async () => {
    const { getTagRanking } = await import('@/lib/cloudflare-kv')
    
    const mockTagData = [
      {
        rank: 1,
        id: 'sm12345',
        title: 'Test Video',
        thumbURL: 'https://example.com/thumb.jpg',
        views: 1000,
        comments: 50,
        mylists: 10,
        likes: 100
      }
    ]
    
    // Mock getTagRanking to return data
    vi.mocked(getTagRanking).mockResolvedValue(mockTagData)
    
    const request = new NextRequest('http://localhost:3000/api/ranking?genre=all&period=24h&tag=popular-tag')
    const response = await GET(request)
    
    expect(response.status).toBe(200)
    
    const data = await response.json()
    expect(data.items).toEqual(mockTagData)
    expect(data.hasMore).toBe(false)
    expect(data.totalCached).toBe(1)
    
    // Check cache headers
    expect(response.headers.get('Cache-Control')).toBe('public, s-maxage=1800, stale-while-revalidate=3600')
    expect(response.headers.get('X-Cache-Status')).toBe('CF-HIT')
  })

  it('should handle missing environment variables gracefully', async () => {
    // Remove environment variable
    delete process.env.CLOUDFLARE_KV_NAMESPACE_ID
    
    const request = new NextRequest('http://localhost:3000/api/ranking?genre=all&period=24h&tag=any-tag')
    const response = await GET(request)
    
    expect(response.status).toBe(404)
    
    const data = await response.json()
    expect(data.error).toBe('Tag ranking not found. This tag may not be in the popular tags list.')
  })
})