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

// Mock Request/Response constructors
global.Request = class Request {
  constructor(public url: string, public init?: any) {}
  clone() { return this }
} as any

global.Response = class Response {
  constructor(public body: any, public init?: any) {
    this.status = init?.status || 200
    this.statusText = init?.statusText || 'OK'
    this.headers = new Map(Object.entries(init?.headers || {}))
  }
  status: number
  statusText: string
  headers: Map<string, string>
  get ok() { return this.status >= 200 && this.status < 300 }
  clone() { return this }
} as any

describe('Cloudflare Workers Cache', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('should cache API ranking responses', async () => {
    // Arrange
    const targetUrl = 'https://example.vercel.app/api/ranking?genre=all'
    const request = new Request('https://nico-rank.com/api/ranking?genre=all')
    const cacheKey = new Request(targetUrl, request)

    // Mock cache miss
    mockCache.match.mockResolvedValueOnce(undefined)

    // Mock fetch response
    const mockResponse = new Response(JSON.stringify({ items: [] }), {
      status: 200,
      headers: {
        'content-type': 'application/json',
        'cache-control': 'public, s-maxage=300'
      }
    })

    const mockFetch = vi.fn().mockResolvedValueOnce(mockResponse)
    global.fetch = mockFetch

    // Worker code that should cache responses
    async function handleRequest(request: Request, targetUrl: string) {
      const cache = caches.default
      const cacheKey = new Request(targetUrl, request)

      // Check cache
      let response = await cache.match(cacheKey)
      
      if (!response) {
        // Cache miss - fetch from origin
        response = await fetch(targetUrl)
        
        // Cache successful API responses
        if (response.ok && targetUrl.includes('/api/ranking')) {
          await cache.put(cacheKey, response.clone())
        }
      }
      
      return response
    }

    // Act
    const response = await handleRequest(request, targetUrl)

    // Assert
    expect(mockCache.match).toHaveBeenCalledWith(cacheKey)
    expect(mockFetch).toHaveBeenCalledWith(targetUrl)
    expect(mockCache.put).toHaveBeenCalledWith(cacheKey, expect.any(Response))
    expect(response).toBe(mockResponse)
  })

  it('should serve from cache on subsequent requests', async () => {
    // Arrange
    const targetUrl = 'https://example.vercel.app/api/ranking?genre=all'
    const request = new Request('https://nico-rank.com/api/ranking?genre=all')
    const cachedResponse = new Response(JSON.stringify({ items: [], cached: true }), {
      status: 200,
      headers: { 'x-cache': 'HIT' }
    })

    // Mock cache hit
    mockCache.match.mockResolvedValueOnce(cachedResponse)

    // Worker code
    async function handleRequest(request: Request, targetUrl: string) {
      const cache = caches.default
      const cacheKey = new Request(targetUrl, request)

      let response = await cache.match(cacheKey)
      if (response) {
        return response
      }

      // This shouldn't be called
      return fetch(targetUrl)
    }

    // Act
    const response = await handleRequest(request, targetUrl)

    // Assert
    expect(mockCache.match).toHaveBeenCalled()
    expect(mockCache.put).not.toHaveBeenCalled()
    expect(response).toBe(cachedResponse)
  })

  it('should not cache non-200 responses', async () => {
    // Arrange
    const targetUrl = 'https://example.vercel.app/api/ranking?genre=invalid'
    const request = new Request('https://nico-rank.com/api/ranking?genre=invalid')
    
    mockCache.match.mockResolvedValueOnce(undefined)
    
    const errorResponse = new Response('Not Found', {
      status: 404,
      statusText: 'Not Found'
    })
    
    const mockFetch = vi.fn().mockResolvedValueOnce(errorResponse)
    global.fetch = mockFetch

    // Worker code
    async function handleRequest(request: Request, targetUrl: string) {
      const cache = caches.default
      const cacheKey = new Request(targetUrl, request)

      let response = await cache.match(cacheKey)
      
      if (!response) {
        response = await fetch(targetUrl)
        
        // Only cache successful responses
        if (response.ok && targetUrl.includes('/api/ranking')) {
          await cache.put(cacheKey, response.clone())
        }
      }
      
      return response
    }

    // Act
    const response = await handleRequest(request, targetUrl)

    // Assert
    expect(mockCache.put).not.toHaveBeenCalled()
    expect(response.status).toBe(404)
  })
})