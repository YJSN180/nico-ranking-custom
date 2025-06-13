import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest, NextResponse } from 'next/server'
import { middleware } from '../../middleware'

// NextResponseモック
vi.mock('next/server', () => ({
  NextRequest: vi.fn((url, init) => {
    const urlObj = new URL(url)
    return {
      url,
      nextUrl: urlObj,
      headers: {
        get: vi.fn((key) => init?.headers?.[key.toLowerCase()] || null)
      },
      cookies: {
        get: vi.fn((name) => undefined)
      },
      method: init?.method || 'GET'
    }
  }),
  NextResponse: {
    json: vi.fn((body, init) => ({
      status: init?.status || 200,
      headers: new Map(Object.entries(init?.headers || {})),
      body
    })),
    next: vi.fn(() => ({
      headers: new Map(),
      cookies: {
        set: vi.fn()
      }
    })),
    redirect: vi.fn((url) => ({
      status: 307,
      headers: new Map([['Location', url.toString()]])
    }))
  }
}))

describe('Security Middleware', () => {
  let originalEnv: NodeJS.ProcessEnv
  
  beforeEach(() => {
    originalEnv = process.env
    process.env = { ...originalEnv }
    vi.clearAllMocks()
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
    
    it('should allow API access with valid Worker auth', () => {
      process.env.VERCEL_ENV = 'production'
      process.env.WORKER_AUTH_KEY = 'secret-key'
      
      const request = new NextRequest('https://app.vercel.app/api/ranking', {
        headers: {
          'host': 'app.vercel.app',
          'X-Worker-Auth': 'secret-key'
        }
      })
      
      const response = middleware(request as any)
      
      // Should pass through
      expect(response.headers).toBeDefined()
      expect(response.status).not.toBe(307)
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
      expect(response.headers).toBeDefined()
    })
  })
  
  describe('Debug Endpoints', () => {
    it('should block debug endpoints in production', () => {
      process.env.VERCEL_ENV = 'production'
      
      const debugPaths = [
        '/api/debug/test',
        '/api/debug-sensitive',
        '/api/internal-proxy',
        '/api/env-check',
        '/api/test-scraping/test'
      ]
      
      debugPaths.forEach(path => {
        const request = new NextRequest(`https://app.vercel.app${path}`, {
          headers: {
            'X-Worker-Auth': 'valid-key'
          }
        })
        
        const response = middleware(request as any)
        
        expect(response.status).toBe(404)
        expect(response.body).toEqual({ error: 'Not Found' })
      })
    })
    
    it('should allow debug endpoints in development', () => {
      process.env.VERCEL_ENV = 'development'
      
      const request = new NextRequest('https://localhost:3000/api/debug/test')
      
      const response = middleware(request as any)
      
      // Should pass through
      expect(response.status).not.toBe(404)
    })
  })
  
  describe('Admin Authentication', () => {
    it('should require Basic Auth for admin routes', () => {
      process.env.ADMIN_USERNAME = 'admin'
      process.env.ADMIN_PASSWORD = 'password'
      
      const request = new NextRequest('https://app.vercel.app/admin/ng-settings')
      
      const response = middleware(request as any)
      
      expect(response.status).toBe(401)
      expect(response.headers.get('WWW-Authenticate')).toBe('Basic realm="Admin Area"')
    })
    
    it('should allow admin access with valid credentials', () => {
      process.env.ADMIN_USERNAME = 'admin'
      process.env.ADMIN_PASSWORD = 'password'
      
      const credentials = Buffer.from('admin:password').toString('base64')
      const request = new NextRequest('https://app.vercel.app/admin/ng-settings', {
        headers: {
          'Authorization': `Basic ${credentials}`
        }
      })
      
      const response = middleware(request as any)
      
      expect(response.cookies.set).toHaveBeenCalledWith(
        'admin-auth',
        'authenticated',
        expect.objectContaining({
          httpOnly: true,
          secure: false, // Not in production
          sameSite: 'strict'
        })
      )
    })
  })
  
  describe('Security Headers', () => {
    it('should add security headers to all responses', () => {
      process.env.VERCEL_ENV = 'production'
      
      const request = new NextRequest('https://app.vercel.app/')
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
      
      const request = new NextRequest('https://localhost:3000/')
      const response = middleware(request as any)
      
      expect(response.headers.get('Strict-Transport-Security')).toBeNull()
    })
  })
})