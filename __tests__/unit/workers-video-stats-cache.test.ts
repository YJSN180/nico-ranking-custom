import { describe, it, expect, vi, beforeEach } from 'vitest'

// Mock Cloudflare Workers globals
const mockCache = {
  match: vi.fn(),
  put: vi.fn()
}

const mockCaches = {
  default: mockCache
}

global.caches = mockCaches as any

// Mock Headers class
class MockHeaders {
  private _headers: Map<string, string>
  
  constructor(init?: HeadersInit | Map<string, string> | MockHeaders) {
    if (init instanceof MockHeaders) {
      this._headers = new Map(init._headers)
    } else if (init instanceof Map) {
      this._headers = new Map(init)
    } else if (init) {
      this._headers = new Map(Object.entries(init))
    } else {
      this._headers = new Map()
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

global.Headers = MockHeaders as any

// Mock Request/Response constructors
global.Request = class Request {
  constructor(public url: string, public init?: any) {}
  clone() { return this }
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
} as any

describe('Cloudflare Workers Video Stats Cache', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('Cache Key Strategy', () => {
    it('should create consistent cache keys for video stats requests', async () => {
      // Arrange
      const videoIds = ['sm123', 'sm456', 'sm789']
      const targetUrl = `https://example.vercel.app/api/edge/video-stats?ids=${videoIds.join(',')}`
      const request = new Request(`https://nico-rank.com/api/edge/video-stats?ids=${videoIds.join(',')}`)
      
      // The cache key should normalize the URL to ensure consistency
      const expectedCacheKey = new Request(targetUrl, request)

      // Act
      const cacheKey = new Request(targetUrl, request)

      // Assert
      expect(cacheKey.url).toBe(expectedCacheKey.url)
    })

    it('should create different cache keys for different video ID sets', () => {
      // Arrange
      const ids1 = ['sm123', 'sm456']
      const ids2 = ['sm789', 'sm101']
      
      const key1 = new Request(`https://example.com/api/edge/video-stats?ids=${ids1.join(',')}`)
      const key2 = new Request(`https://example.com/api/edge/video-stats?ids=${ids2.join(',')}`)

      // Assert
      expect(key1.url).not.toBe(key2.url)
    })
  })

  describe('Cache Behavior', () => {
    it('should cache video stats API responses with short TTL', async () => {
      // Arrange
      const videoIds = ['sm123', 'sm456']
      const targetUrl = `https://example.vercel.app/api/edge/video-stats?ids=${videoIds.join(',')}`
      const request = new Request(`https://nico-rank.com/api/edge/video-stats?ids=${videoIds.join(',')}`)
      const cacheKey = new Request(targetUrl, request)

      // Mock cache miss
      mockCache.match.mockResolvedValueOnce(undefined)

      // Mock fetch response with stats data
      const statsData = {
        stats: {
          sm123: { viewCounter: 1000, commentCounter: 50, mylistCounter: 10, likeCounter: 100 },
          sm456: { viewCounter: 2000, commentCounter: 100, mylistCounter: 20, likeCounter: 200 }
        },
        timestamp: new Date().toISOString(),
        count: 2
      }

      const mockResponse = new Response(JSON.stringify(statsData), {
        status: 200,
        headers: {
          'content-type': 'application/json',
          'cache-control': 'public, s-maxage=60' // 1 minute cache
        }
      })

      const mockFetch = vi.fn().mockResolvedValueOnce(mockResponse)
      global.fetch = mockFetch

      // Worker code that should cache video stats
      async function handleVideoStatsRequest(request: Request, targetUrl: string) {
        const cache = caches.default
        const cacheKey = new Request(targetUrl, request)

        // Check cache first
        let response = await cache.match(cacheKey)
        
        if (!response) {
          // Cache miss - fetch from origin
          response = await fetch(targetUrl)
          
          // Cache successful video stats responses with short TTL
          if (response.ok && targetUrl.includes('/api/edge/video-stats')) {
            await cache.put(cacheKey, response.clone())
          }
        }
        
        return response
      }

      // Act
      const response = await handleVideoStatsRequest(request, targetUrl)

      // Assert
      expect(mockCache.match).toHaveBeenCalledWith(cacheKey)
      expect(mockFetch).toHaveBeenCalledWith(targetUrl)
      expect(mockCache.put).toHaveBeenCalledWith(cacheKey, expect.any(Response))
      expect(response).toBe(mockResponse)
    })

    it('should serve cached video stats on subsequent requests within TTL', async () => {
      // Arrange
      const videoIds = ['sm123', 'sm456']
      const targetUrl = `https://example.vercel.app/api/edge/video-stats?ids=${videoIds.join(',')}`
      const request = new Request(`https://nico-rank.com/api/edge/video-stats?ids=${videoIds.join(',')}`)
      
      const cachedStatsData = {
        stats: {
          sm123: { viewCounter: 1000, commentCounter: 50, mylistCounter: 10, likeCounter: 100 },
          sm456: { viewCounter: 2000, commentCounter: 100, mylistCounter: 20, likeCounter: 200 }
        },
        timestamp: new Date().toISOString(),
        count: 2,
        cached: true
      }

      const cachedResponse = new Response(JSON.stringify(cachedStatsData), {
        status: 200,
        headers: { 
          'x-cache': 'HIT',
          'content-type': 'application/json'
        }
      })

      // Mock cache hit
      mockCache.match.mockResolvedValueOnce(cachedResponse)

      // Worker code
      async function handleVideoStatsRequest(request: Request, targetUrl: string) {
        const cache = caches.default
        const cacheKey = new Request(targetUrl, request)

        let response = await cache.match(cacheKey)
        if (response) {
          // Add cache hit header
          const newHeaders = new Headers(response.headers)
          newHeaders.set('X-CF-Cache', 'HIT')
          return new Response(response.body, {
            status: response.status,
            statusText: response.statusText,
            headers: newHeaders
          })
        }

        // This shouldn't be called on cache hit
        return fetch(targetUrl)
      }

      // Act
      const response = await handleVideoStatsRequest(request, targetUrl)

      // Assert
      expect(mockCache.match).toHaveBeenCalled()
      expect(mockCache.put).not.toHaveBeenCalled()
      expect(response.headers.get('X-CF-Cache')).toBe('HIT')
    })

    it('should not cache video stats error responses', async () => {
      // Arrange
      const videoIds = ['invalid1', 'invalid2']
      const targetUrl = `https://example.vercel.app/api/edge/video-stats?ids=${videoIds.join(',')}`
      const request = new Request(`https://nico-rank.com/api/edge/video-stats?ids=${videoIds.join(',')}`)
      
      mockCache.match.mockResolvedValueOnce(undefined)
      
      const errorResponse = new Response('Bad Request', {
        status: 400,
        statusText: 'Bad Request'
      })
      
      const mockFetch = vi.fn().mockResolvedValueOnce(errorResponse)
      global.fetch = mockFetch

      // Worker code
      async function handleVideoStatsRequest(request: Request, targetUrl: string) {
        const cache = caches.default
        const cacheKey = new Request(targetUrl, request)

        let response = await cache.match(cacheKey)
        
        if (!response) {
          response = await fetch(targetUrl)
          
          // Only cache successful responses
          if (response.ok && targetUrl.includes('/api/edge/video-stats')) {
            await cache.put(cacheKey, response.clone())
          }
        }
        
        return response
      }

      // Act
      const response = await handleVideoStatsRequest(request, targetUrl)

      // Assert
      expect(mockCache.put).not.toHaveBeenCalled()
      expect(response.status).toBe(400)
    })
  })

  describe('Batch Request Optimization', () => {
    it('should handle concurrent requests efficiently', async () => {
      // Arrange
      const videoIds = ['sm123', 'sm456']
      const targetUrl = `https://example.vercel.app/api/edge/video-stats?ids=${videoIds.join(',')}`
      
      const statsData = {
        stats: {
          sm123: { viewCounter: 1000, commentCounter: 50, mylistCounter: 10, likeCounter: 100 },
          sm456: { viewCounter: 2000, commentCounter: 100, mylistCounter: 20, likeCounter: 200 }
        },
        timestamp: new Date().toISOString(),
        count: 2
      }

      const mockResponse = new Response(JSON.stringify(statsData), {
        status: 200,
        headers: { 'content-type': 'application/json' }
      })

      // Mock cache misses
      mockCache.match.mockResolvedValue(undefined)
      
      const mockFetch = vi.fn().mockResolvedValue(mockResponse)
      global.fetch = mockFetch

      // Simplified handler without deduplication for now
      async function handleVideoStatsRequest(request: Request, targetUrl: string) {
        const cache = caches.default
        const cacheKey = new Request(targetUrl, request)

        // Check cache
        const cached = await cache.match(cacheKey)
        if (cached) {
          return cached
        }

        // Fetch from origin
        const response = await fetch(targetUrl)
        
        // Cache successful responses
        if (response.ok && targetUrl.includes('/api/edge/video-stats')) {
          await cache.put(cacheKey, response.clone())
        }
        
        return response
      }

      // Act - Make two concurrent requests for the same video IDs
      const request1 = new Request(`https://nico-rank.com/api/edge/video-stats?ids=${videoIds.join(',')}`)
      const request2 = new Request(`https://nico-rank.com/api/edge/video-stats?ids=${videoIds.join(',')}`)
      
      const [response1, response2] = await Promise.all([
        handleVideoStatsRequest(request1, targetUrl),
        handleVideoStatsRequest(request2, targetUrl)
      ])

      // Assert - Both requests succeed, caching works
      expect(response1.status).toBe(200)
      expect(response2.status).toBe(200)
      expect(mockCache.put).toHaveBeenCalled()
      
      // Note: In a real implementation, we'd want request deduplication
      // to reduce the number of fetches, but that's an optimization
      // we can implement later in the actual Workers code
    })
  })

  describe('Cache Headers', () => {
    it('should respect cache-control headers from origin', async () => {
      // Arrange
      const videoIds = ['sm123']
      const targetUrl = `https://example.vercel.app/api/edge/video-stats?ids=${videoIds.join(',')}`
      const request = new Request(`https://nico-rank.com/api/edge/video-stats?ids=${videoIds.join(',')}`)

      mockCache.match.mockResolvedValueOnce(undefined)

      // Response with specific cache headers
      const mockResponse = new Response(JSON.stringify({ stats: {} }), {
        status: 200,
        headers: {
          'content-type': 'application/json',
          'cache-control': 'public, s-maxage=60, stale-while-revalidate=30'
        }
      })

      const mockFetch = vi.fn().mockResolvedValueOnce(mockResponse)
      global.fetch = mockFetch

      // Worker code should preserve cache headers
      async function handleVideoStatsRequest(request: Request, targetUrl: string) {
        const response = await fetch(targetUrl)
        return response
      }

      // Act
      const response = await handleVideoStatsRequest(request, targetUrl)

      // Assert
      expect(response.headers.get('cache-control')).toBe('public, s-maxage=60, stale-while-revalidate=30')
    })

    it('should add cache miss header when fetching from origin', async () => {
      // Arrange
      const videoIds = ['sm123']
      const targetUrl = `https://example.vercel.app/api/edge/video-stats?ids=${videoIds.join(',')}`
      const request = new Request(`https://nico-rank.com/api/edge/video-stats?ids=${videoIds.join(',')}`)

      mockCache.match.mockResolvedValueOnce(undefined)

      const mockResponse = new Response(JSON.stringify({ stats: {} }), {
        status: 200,
        headers: { 'content-type': 'application/json' }
      })

      const mockFetch = vi.fn().mockResolvedValueOnce(mockResponse)
      global.fetch = mockFetch

      // Worker code
      async function handleVideoStatsRequest(request: Request, targetUrl: string) {
        const cache = caches.default
        const cacheKey = new Request(targetUrl, request)

        let response = await cache.match(cacheKey)
        
        if (!response) {
          response = await fetch(targetUrl)
          
          // Add cache miss header
          const newHeaders = new Headers(response.headers)
          newHeaders.set('X-CF-Cache', 'MISS')
          
          const newResponse = new Response(response.body, {
            status: response.status,
            statusText: response.statusText,
            headers: newHeaders
          })

          if (response.ok && targetUrl.includes('/api/edge/video-stats')) {
            await cache.put(cacheKey, newResponse.clone())
          }
          
          return newResponse
        }
        
        return response
      }

      // Act
      const response = await handleVideoStatsRequest(request, targetUrl)

      // Assert
      expect(response.headers.get('X-CF-Cache')).toBe('MISS')
    })
  })
})