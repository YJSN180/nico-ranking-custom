import { describe, it, expect, beforeEach } from 'vitest'
import { 
  checkRateLimit, 
  shouldRateLimit, 
  getRateLimitConfig,
  type KVNamespace 
} from '../../workers/rate-limiter'

// KVNamespaceのモック実装
class MockKVNamespace implements KVNamespace {
  private store: Map<string, string> = new Map()
  
  async get(key: string): Promise<string | null> {
    return this.store.get(key) || null
  }
  
  async put(key: string, value: string, options?: { expirationTtl?: number }): Promise<void> {
    this.store.set(key, value)
  }
  
  clear() {
    this.store.clear()
  }
  
  // テスト用ヘルパー
  getStore() {
    return new Map(this.store)
  }
}

describe('Rate Limiter', () => {
  let mockKV: MockKVNamespace
  
  beforeEach(() => {
    mockKV = new MockKVNamespace()
  })
  
  describe('checkRateLimit', () => {
    it('should allow requests within limit', async () => {
      const request = new Request('https://example.com/api/test', {
        headers: { 'CF-Connecting-IP': '192.168.1.1' }
      })
      
      const config = { requests: 5, window: 60000 }
      
      // 最初の5リクエストは許可される
      for (let i = 0; i < 5; i++) {
        const result = await checkRateLimit(request, mockKV, config)
        expect(result.allowed).toBe(true)
        expect(result.remaining).toBe(4 - i)
      }
    })
    
    it('should block requests exceeding limit', async () => {
      const request = new Request('https://example.com/api/test', {
        headers: { 'CF-Connecting-IP': '192.168.1.1' }
      })
      
      const config = { requests: 5, window: 60000 }
      
      // 5リクエストまで許可
      for (let i = 0; i < 5; i++) {
        await checkRateLimit(request, mockKV, config)
      }
      
      // 6番目のリクエストはブロック
      const result = await checkRateLimit(request, mockKV, config)
      expect(result.allowed).toBe(false)
      expect(result.remaining).toBe(0)
      expect(result.resetAt).toBeGreaterThan(Date.now())
    })
    
    it('should track different IPs separately', async () => {
      const request1 = new Request('https://example.com/api/test', {
        headers: { 'CF-Connecting-IP': '192.168.1.1' }
      })
      const request2 = new Request('https://example.com/api/test', {
        headers: { 'CF-Connecting-IP': '192.168.1.2' }
      })
      
      const config = { requests: 2, window: 60000 }
      
      // IP1で2リクエスト
      await checkRateLimit(request1, mockKV, config)
      await checkRateLimit(request1, mockKV, config)
      
      // IP1の3番目はブロック
      const blocked = await checkRateLimit(request1, mockKV, config)
      expect(blocked.allowed).toBe(false)
      
      // IP2の最初のリクエストは許可
      const allowed = await checkRateLimit(request2, mockKV, config)
      expect(allowed.allowed).toBe(true)
    })
    
    it('should handle missing KV gracefully', async () => {
      const request = new Request('https://example.com/api/test')
      const config = { requests: 5, window: 60000 }
      
      const result = await checkRateLimit(request, undefined, config)
      expect(result.allowed).toBe(true)
      expect(result.remaining).toBe(5)
    })
    
    it('should extract IP from X-Forwarded-For header', async () => {
      const request = new Request('https://example.com/api/test', {
        headers: { 'X-Forwarded-For': '10.0.0.1, 192.168.1.1' }
      })
      
      const config = { requests: 1, window: 60000 }
      
      await checkRateLimit(request, mockKV, config)
      
      // 同じIPからの2番目のリクエストはブロック
      const result = await checkRateLimit(request, mockKV, config)
      expect(result.allowed).toBe(false)
    })
  })
  
  describe('shouldRateLimit', () => {
    it('should exclude static assets', () => {
      expect(shouldRateLimit('/style.css')).toBe(false)
      expect(shouldRateLimit('/image.png')).toBe(false)
      expect(shouldRateLimit('/font.woff2')).toBe(false)
      expect(shouldRateLimit('/_next/static/chunk.js')).toBe(false)
      expect(shouldRateLimit('/_next/image/photo.jpg')).toBe(false)
      expect(shouldRateLimit('/favicon.ico')).toBe(false)
      expect(shouldRateLimit('/robots.txt')).toBe(false)
    })
    
    it('should include dynamic paths', () => {
      expect(shouldRateLimit('/')).toBe(true)
      expect(shouldRateLimit('/api/ranking')).toBe(true)
      expect(shouldRateLimit('/admin')).toBe(true)
      expect(shouldRateLimit('/tag/VOCALOID')).toBe(true)
    })
  })
  
  describe('getRateLimitConfig', () => {
    it('should return stricter limits for API endpoints', () => {
      const apiConfig = getRateLimitConfig('/api/ranking')
      expect(apiConfig.requests).toBe(50)
      expect(apiConfig.window).toBe(60000)
    })
    
    it('should return even stricter limits for admin endpoints', () => {
      const adminConfig = getRateLimitConfig('/api/admin/ng-list')
      expect(adminConfig.requests).toBe(20)
      expect(adminConfig.window).toBe(60000)
    })
    
    it('should return regular limits for pages', () => {
      const pageConfig = getRateLimitConfig('/')
      expect(pageConfig.requests).toBe(200)
      expect(pageConfig.window).toBe(60000)
    })
  })
})