import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

// Mock the full Workers environment
const mockCache = {
  match: vi.fn(),
  put: vi.fn()
}

const mockCaches = {
  default: mockCache
}

// Enhanced Headers mock with proper iteration support
class MockHeaders {
  private _headers: Map<string, string>
  
  constructor(init?: HeadersInit | Map<string, string> | MockHeaders) {
    this._headers = new Map()
    
    if (init instanceof MockHeaders) {
      // Copy from another MockHeaders instance
      init._headers.forEach((value, key) => {
        this._headers.set(key.toLowerCase(), value)
      })
    } else if (init instanceof Map) {
      // Copy from Map
      init.forEach((value, key) => {
        this._headers.set(key.toLowerCase(), value)
      })
    } else if (init) {
      // Copy from object
      Object.entries(init).forEach(([key, value]) => {
        this._headers.set(key.toLowerCase(), value)
      })
    }
  }
  
  get(name: string): string | null {
    return this._headers.get(name.toLowerCase()) || null
  }
  
  set(name: string, value: string): void {
    this._headers.set(name.toLowerCase(), value)
  }
  
  entries(): IterableIterator<[string, string]> {
    return this._headers.entries()
  }
}

// Setup globals
global.caches = mockCaches as any
global.Headers = MockHeaders as any
global.Request = class Request {
  constructor(public url: string, public init?: any) {}
  clone() { return new Request(this.url, this.init) }
} as any
global.Response = class Response {
  public headers: MockHeaders
  
  constructor(public body: any, public init?: any) {
    this.status = init?.status || 200
    this.statusText = init?.statusText || 'OK'
    this.headers = new MockHeaders(init?.headers || {})
  }
  status: number
  statusText: string
  get ok() { return this.status >= 200 && this.status < 300 }
  clone() { 
    return new Response(this.body, {
      status: this.status,
      statusText: this.statusText,
      headers: this.headers
    })
  }
  async json() {
    if (typeof this.body === 'string') {
      return JSON.parse(this.body)
    }
    return this.body
  }
  async text() {
    if (typeof this.body === 'string') {
      return this.body
    }
    return JSON.stringify(this.body)
  }
} as any

// Import the worker after setting up globals
import worker from '../../workers/api-gateway-simple'

describe('Workers Cache Integration Tests', () => {
  let mockFetch: ReturnType<typeof vi.fn>
  
  beforeEach(() => {
    vi.clearAllMocks()
    mockFetch = vi.fn()
    global.fetch = mockFetch
  })
  
  afterEach(() => {
    vi.restoreAllMocks()
  })
  
  describe('Video Stats Caching', () => {
    const mockEnv = {
      RANKING_DATA: {} as any,
      NEXT_APP_URL: 'https://test.vercel.app',
      WORKER_AUTH_KEY: 'test-auth-key'
    }
    
    it('should cache video stats responses with correct headers', async () => {
      // Arrange
      const videoIds = ['sm123', 'sm456', 'sm789']
      const request = new Request(`https://nico-rank.com/api/edge/video-stats?ids=${videoIds.join(',')}`)
      
      // Mock cache miss
      mockCache.match.mockResolvedValueOnce(undefined)
      
      // Mock origin response with stats data
      const statsData = {
        stats: {
          sm123: { viewCounter: 1000, commentCounter: 50, mylistCounter: 10, likeCounter: 100 },
          sm456: { viewCounter: 2000, commentCounter: 100, mylistCounter: 20, likeCounter: 200 },
          sm789: { viewCounter: 3000, commentCounter: 150, mylistCounter: 30, likeCounter: 300 }
        },
        timestamp: new Date().toISOString(),
        count: 3
      }
      
      const originResponse = new Response(JSON.stringify(statsData), {
        status: 200,
        headers: {
          'content-type': 'application/json',
          'cache-control': 'public, s-maxage=60, stale-while-revalidate=30'
        }
      })
      
      mockFetch.mockResolvedValueOnce(originResponse)
      
      // Act
      const response = await worker.fetch(request, mockEnv)
      
      // Assert
      expect(mockCache.match).toHaveBeenCalled()
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('/api/edge/video-stats'),
        expect.objectContaining({
          headers: expect.any(MockHeaders)
        })
      )
      expect(mockCache.put).toHaveBeenCalled()
      
      // Verify response headers
      expect(response.headers.get('X-CF-Cache')).toBe('MISS')
      expect(response.headers.get('cache-control')).toBe('public, s-maxage=60, stale-while-revalidate=30')
      expect(response.status).toBe(200)
    })
    
    it('should serve cached video stats on subsequent requests', async () => {
      // Arrange
      const videoIds = ['sm123', 'sm456']
      const request = new Request(`https://nico-rank.com/api/edge/video-stats?ids=${videoIds.join(',')}`)
      
      const cachedData = {
        stats: {
          sm123: { viewCounter: 1000, commentCounter: 50, mylistCounter: 10, likeCounter: 100 },
          sm456: { viewCounter: 2000, commentCounter: 100, mylistCounter: 20, likeCounter: 200 }
        },
        timestamp: new Date().toISOString(),
        count: 2,
        cached: true
      }
      
      const cachedResponse = new Response(JSON.stringify(cachedData), {
        status: 200,
        headers: {
          'content-type': 'application/json',
          'cache-control': 'public, s-maxage=60, stale-while-revalidate=30'
        }
      })
      
      // Mock cache hit
      mockCache.match.mockResolvedValueOnce(cachedResponse)
      
      // Act
      const response = await worker.fetch(request, mockEnv)
      
      // Assert
      expect(mockCache.match).toHaveBeenCalled()
      expect(mockFetch).not.toHaveBeenCalled() // Should not fetch from origin
      expect(mockCache.put).not.toHaveBeenCalled() // Should not update cache
      
      // Verify cache hit header
      expect(response.headers.get('X-CF-Cache')).toBe('HIT')
      expect(response.status).toBe(200)
      
      // Verify response body
      const responseData = await response.json()
      expect(responseData.cached).toBe(true)
    })
    
    it('should handle different video ID combinations as separate cache entries', async () => {
      // Arrange
      const ids1 = ['sm123', 'sm456']
      const ids2 = ['sm789', 'sm101']
      
      const request1 = new Request(`https://nico-rank.com/api/edge/video-stats?ids=${ids1.join(',')}`)
      const request2 = new Request(`https://nico-rank.com/api/edge/video-stats?ids=${ids2.join(',')}`)
      
      // Both requests should result in cache misses
      mockCache.match.mockResolvedValue(undefined)
      
      const response1 = new Response(JSON.stringify({ stats: { sm123: {}, sm456: {} } }), { status: 200 })
      const response2 = new Response(JSON.stringify({ stats: { sm789: {}, sm101: {} } }), { status: 200 })
      
      mockFetch
        .mockResolvedValueOnce(response1)
        .mockResolvedValueOnce(response2)
      
      // Act
      await worker.fetch(request1, mockEnv)
      await worker.fetch(request2, mockEnv)
      
      // Assert
      expect(mockCache.put).toHaveBeenCalledTimes(2) // Both should be cached separately
      expect(mockFetch).toHaveBeenCalledTimes(2) // Both should fetch from origin
    })
  })
  
  describe('Ranking API Caching', () => {
    const mockEnv = {
      RANKING_DATA: {} as any,
      NEXT_APP_URL: 'https://test.vercel.app',
      WORKER_AUTH_KEY: 'test-auth-key'
    }
    
    it('should continue to cache ranking API responses', async () => {
      // Arrange
      const request = new Request('https://nico-rank.com/api/edge/ranking?genre=all&period=24h')
      
      // Mock cache miss
      mockCache.match.mockResolvedValueOnce(undefined)
      
      const rankingData = {
        items: [
          { rank: 1, id: 'sm123', title: 'Test Video', views: 1000 }
        ],
        popularTags: ['tag1', 'tag2']
      }
      
      const originResponse = new Response(JSON.stringify(rankingData), {
        status: 200,
        headers: { 'content-type': 'application/json' }
      })
      
      mockFetch.mockResolvedValueOnce(originResponse)
      
      // Act
      const response = await worker.fetch(request, mockEnv)
      
      // Assert
      expect(mockCache.match).toHaveBeenCalled()
      expect(mockCache.put).toHaveBeenCalled()
      expect(response.headers.get('X-CF-Cache')).toBe('MISS')
      expect(response.status).toBe(200)
    })
  })
  
  describe('Error Handling', () => {
    const mockEnv = {
      RANKING_DATA: {} as any,
      NEXT_APP_URL: 'https://test.vercel.app',
      WORKER_AUTH_KEY: 'test-auth-key'
    }
    
    it('should not cache error responses', async () => {
      // Arrange
      const request = new Request('https://nico-rank.com/api/edge/video-stats?ids=invalid')
      
      mockCache.match.mockResolvedValueOnce(undefined)
      
      const errorResponse = new Response('Bad Request', {
        status: 400,
        statusText: 'Bad Request'
      })
      
      mockFetch.mockResolvedValueOnce(errorResponse)
      
      // Act
      const response = await worker.fetch(request, mockEnv)
      
      // Assert
      expect(mockCache.put).not.toHaveBeenCalled()
      expect(response.status).toBe(400)
    })
    
    it('should handle fetch failures gracefully', async () => {
      // Arrange
      const request = new Request('https://nico-rank.com/api/edge/video-stats?ids=sm123')
      
      mockCache.match.mockResolvedValueOnce(undefined)
      mockFetch.mockRejectedValueOnce(new Error('Network error'))
      
      // Act
      const response = await worker.fetch(request, mockEnv)
      
      // Assert
      expect(response.status).toBe(500)
      // The worker sets Content-Type in the error response
      const contentType = response.headers.get('Content-Type') || response.headers.get('content-type')
      expect(contentType).toBeTruthy()
      expect(contentType).toContain('json')
      
      const errorData = await response.json()
      expect(errorData.error).toBe('Internal Server Error')
      expect(errorData.message).toBe('Network error')
    })
  })
  
  describe('Security Headers', () => {
    const mockEnv = {
      RANKING_DATA: {} as any,
      NEXT_APP_URL: 'https://test.vercel.app',
      WORKER_AUTH_KEY: 'test-auth-key'
    }
    
    it('should include all security headers in responses', async () => {
      // Arrange - test with a non-cached endpoint to ensure headers are applied
      const request = new Request('https://nico-rank.com/')
      
      const originResponse = new Response('<html>Home Page</html>', {
        status: 200,
        headers: { 'content-type': 'text/html' }
      })
      
      mockFetch.mockResolvedValueOnce(originResponse)
      
      // Act
      const response = await worker.fetch(request, mockEnv)
      
      // Assert
      expect(response.headers.get('X-Content-Type-Options')).toBe('nosniff')
      expect(response.headers.get('X-Frame-Options')).toBe('DENY')
      expect(response.headers.get('X-XSS-Protection')).toBe('1; mode=block')
      expect(response.headers.get('Referrer-Policy')).toBe('strict-origin-when-cross-origin')
      expect(response.headers.get('Content-Security-Policy')).toContain("default-src 'self'")
    })
    
    it('should include security headers even for cached API responses', async () => {
      // Arrange
      const request = new Request('https://nico-rank.com/api/edge/video-stats?ids=sm123')
      
      // First request to populate cache
      mockCache.match.mockResolvedValueOnce(undefined)
      const originResponse = new Response('{"stats":{}}', {
        status: 200,
        headers: { 'content-type': 'application/json' }
      })
      mockFetch.mockResolvedValueOnce(originResponse)
      
      // Make first request to populate cache
      await worker.fetch(request, mockEnv)
      
      // Now test the cached response
      const cachedResponse = new Response('{"stats":{}}', {
        status: 200,
        headers: { 'content-type': 'application/json' }
      })
      mockCache.match.mockResolvedValueOnce(cachedResponse)
      
      // Act
      const response = await worker.fetch(request, mockEnv)
      
      // Assert - cached responses should still have security headers
      expect(response.headers.get('X-CF-Cache')).toBe('HIT')
      expect(response.headers.get('X-Content-Type-Options')).toBe('nosniff')
      expect(response.headers.get('X-Frame-Options')).toBe('DENY')
    })
  })
})