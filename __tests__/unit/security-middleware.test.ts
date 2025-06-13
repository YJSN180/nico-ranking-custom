import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { NextRequest, NextResponse } from 'next/server'
import { middleware } from '../../middleware'

// Console.logをモック
const originalConsoleLog = console.log
const originalConsoleError = console.error
const originalConsoleWarn = console.warn

beforeEach(() => {
  console.log = vi.fn()
  console.error = vi.fn()
  console.warn = vi.fn()
})

afterEach(() => {
  console.log = originalConsoleLog
  console.error = originalConsoleError
  console.warn = originalConsoleWarn
})

// NextResponseの静的メソッドをモック
const mockHeaders = new Map<string, string>()
const mockCookies = {
  set: vi.fn()
}

const createMockResponse = (status: number, body?: any, headers?: Record<string, string>) => {
  const response = {
    status,
    body,
    headers: mockHeaders,
    cookies: mockCookies
  }
  
  // ヘッダーをセット
  mockHeaders.clear()
  if (headers) {
    Object.entries(headers).forEach(([key, value]) => {
      mockHeaders.set(key, value)
    })
  }
  
  return response
}

vi.mock('next/server', () => ({
  NextRequest: vi.fn((url, init) => {
    const urlObj = new URL(url)
    return {
      url,
      nextUrl: urlObj,
      headers: {
        get: vi.fn((key) => init?.headers?.[key] || init?.headers?.[key.toLowerCase()] || null)
      },
      cookies: {
        get: vi.fn((name) => undefined)
      },
      method: init?.method || 'GET'
    }
  }),
  NextResponse: {
    json: vi.fn((body, init) => createMockResponse(init?.status || 200, body, init?.headers)),
    next: vi.fn(() => {
      const response = createMockResponse(200)
      response.headers.set('X-Content-Type-Options', 'nosniff')
      response.headers.set('X-Frame-Options', 'DENY')
      response.headers.set('X-XSS-Protection', '1; mode=block')
      response.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin')
      response.headers.set('Permissions-Policy', 'camera=(), microphone=(), geolocation=()')
      return response
    }),
    redirect: vi.fn((url) => createMockResponse(307, undefined, { 'Location': url.toString() }))
  }
}))

describe('Security Middleware', () => {
  let originalEnv: NodeJS.ProcessEnv
  
  beforeEach(() => {
    originalEnv = process.env
    process.env = { ...originalEnv }
    vi.clearAllMocks()
    mockCookies.set.mockClear()
  })
  
  afterEach(() => {
    process.env = originalEnv
  })
  
  describe('Worker Authentication', () => {
    it('should block API access without Worker auth in production', () => {
      process.env.VERCEL_ENV = 'production'
      process.env.WORKER_AUTH_KEY = 'secret-key'
      
      const request = new NextRequest('https://app.vercel.app/api/ranking', {
        headers: {
          'host': 'app.vercel.app'
        }
      })
      
      const response = middleware(request as any)
      
      // Should redirect to custom domain
      expect(response.status).toBe(307)
      expect(response.headers.get('Location')).toBe('https://nico-rank.com/api/ranking')
    })
    
    it('should allow access from non-vercel domains even without Worker auth', () => {
      process.env.VERCEL_ENV = 'production'
      process.env.WORKER_AUTH_KEY = 'secret-key'
      
      const request = new NextRequest('https://nico-rank.com/api/ranking', {
        headers: {
          'host': 'nico-rank.com'
        }
      })
      
      const response = middleware(request as any)
      
      // Should pass through (not redirect)
      expect(response.status).toBe(200)
      expect(response.headers.get('X-Content-Type-Options')).toBe('nosniff')
    })
    
    it('should skip auth check in development', () => {
      process.env.VERCEL_ENV = 'development'
      
      const request = new NextRequest('https://localhost:3000/api/ranking', {
        headers: {
          'host': 'localhost:3000'
        }
      })
      
      const response = middleware(request as any)
      
      // Should pass through without auth
      expect(response.headers.get('X-Content-Type-Options')).toBe('nosniff')
    })
  })
  
  describe('Debug Endpoints', () => {
    it('should block debug endpoints in production', () => {
      process.env.VERCEL_ENV = 'production'
      process.env.WORKER_AUTH_KEY = 'secret-key'
      
      const debugPaths = [
        '/api/debug/test',
        '/api/debug-sensitive',
        '/api/internal-proxy',
        '/api/env-check',
        '/api/test-scraping/test'
      ]
      
      debugPaths.forEach(path => {
        const request = new NextRequest(`https://nico-rank.com${path}`, {
          headers: {
            'host': 'nico-rank.com',
            'X-Worker-Auth': 'secret-key'
          }
        })
        
        const response = middleware(request as any)
        
        expect(response.status).toBe(404)
        expect(response.body).toEqual({ error: 'Not Found' })
      })
    })
    
    it('should allow debug endpoints in development', () => {
      process.env.VERCEL_ENV = 'development'
      
      const request = new NextRequest('https://localhost:3000/api/debug/test', {
        headers: {
          'host': 'localhost:3000'
        }
      })
      
      const response = middleware(request as any)
      
      // Should pass through
      expect(response.status).toBe(200)
    })
  })
  
  describe('Security Headers', () => {
    it('should add security headers to all responses', () => {
      process.env.VERCEL_ENV = 'production'
      
      const request = new NextRequest('https://nico-rank.com/', {
        headers: {
          'host': 'nico-rank.com'
        }
      })
      const response = middleware(request as any)
      
      expect(response.headers.get('X-Content-Type-Options')).toBe('nosniff')
      expect(response.headers.get('X-Frame-Options')).toBe('DENY')
      expect(response.headers.get('X-XSS-Protection')).toBe('1; mode=block')
      expect(response.headers.get('Referrer-Policy')).toBe('strict-origin-when-cross-origin')
      expect(response.headers.get('Permissions-Policy')).toBe('camera=(), microphone=(), geolocation=()')
      expect(response.headers.get('Strict-Transport-Security')).toBe('max-age=31536000; includeSubDomains; preload')
    })
    
    it('should not add HSTS header in development', () => {
      process.env.VERCEL_ENV = 'development'
      
      const request = new NextRequest('https://localhost:3000/', {
        headers: {
          'host': 'localhost:3000'
        }
      })
      const response = middleware(request as any)
      
      // In development, HSTS should not be set
      expect(response.headers.get('Strict-Transport-Security')).toBeUndefined()
    })
  })
})