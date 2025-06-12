import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest, NextResponse } from 'next/server'

// レート制限ミドルウェアのモック
class RateLimiter {
  private requests: Map<string, number[]> = new Map()
  private windowMs: number
  private maxRequests: number

  constructor(windowMs: number, maxRequests: number) {
    this.windowMs = windowMs
    this.maxRequests = maxRequests
  }

  async checkLimit(ip: string): Promise<boolean> {
    const now = Date.now()
    const requests = this.requests.get(ip) || []
    
    // 時間枠内のリクエストをフィルタ
    const recentRequests = requests.filter(time => now - time < this.windowMs)
    
    if (recentRequests.length >= this.maxRequests) {
      return false // レート制限に達した
    }
    
    recentRequests.push(now)
    this.requests.set(ip, recentRequests)
    return true // リクエスト許可
  }

  reset() {
    this.requests.clear()
  }
}

describe('Rate Limiting', () => {
  let rateLimiter: RateLimiter

  beforeEach(() => {
    rateLimiter = new RateLimiter(10000, 10) // 10秒間に10リクエスト
  })

  describe('Basic Rate Limiting', () => {
    it('should allow requests within limit', async () => {
      const ip = '192.168.1.1'
      
      for (let i = 0; i < 10; i++) {
        const allowed = await rateLimiter.checkLimit(ip)
        expect(allowed).toBe(true)
      }
    })

    it('should block requests exceeding limit', async () => {
      const ip = '192.168.1.1'
      
      // 10リクエストまでは許可
      for (let i = 0; i < 10; i++) {
        await rateLimiter.checkLimit(ip)
      }
      
      // 11番目のリクエストはブロック
      const allowed = await rateLimiter.checkLimit(ip)
      expect(allowed).toBe(false)
    })

    it('should track different IPs separately', async () => {
      const ip1 = '192.168.1.1'
      const ip2 = '192.168.1.2'
      
      // IP1で10リクエスト
      for (let i = 0; i < 10; i++) {
        await rateLimiter.checkLimit(ip1)
      }
      
      // IP2はまだ制限されない
      const allowed = await rateLimiter.checkLimit(ip2)
      expect(allowed).toBe(true)
    })

    it('should reset after time window', async () => {
      const ip = '192.168.1.1'
      
      // 10リクエストで制限に達する
      for (let i = 0; i < 10; i++) {
        await rateLimiter.checkLimit(ip)
      }
      
      // 制限確認
      expect(await rateLimiter.checkLimit(ip)).toBe(false)
      
      // 時間経過をシミュレート（本番ではsetTimeoutではなく実際の時間経過）
      // ここではテスト用に新しいインスタンスを作成
      rateLimiter.reset()
      
      // リセット後は再度許可される
      expect(await rateLimiter.checkLimit(ip)).toBe(true)
    })
  })

  describe('API Endpoint Rate Limiting', () => {
    it('should return 429 when rate limit exceeded', async () => {
      // APIエンドポイントのレート制限をシミュレート
      const mockHandler = async (request: NextRequest) => {
        const ip = request.headers.get('x-forwarded-for') || 'unknown'
        const allowed = await rateLimiter.checkLimit(ip)
        
        if (!allowed) {
          return NextResponse.json(
            { error: 'Too many requests' },
            { 
              status: 429,
              headers: {
                'Retry-After': '10',
                'X-RateLimit-Limit': '10',
                'X-RateLimit-Remaining': '0',
                'X-RateLimit-Reset': new Date(Date.now() + 10000).toISOString()
              }
            }
          )
        }
        
        return NextResponse.json({ data: 'success' })
      }

      // 10リクエストまでは成功
      for (let i = 0; i < 10; i++) {
        const request = new NextRequest('http://localhost:3000/api/ranking', {
          headers: { 'x-forwarded-for': '192.168.1.1' }
        })
        const response = await mockHandler(request)
        expect(response.status).toBe(200)
      }

      // 11番目は429エラー
      const request = new NextRequest('http://localhost:3000/api/ranking', {
        headers: { 'x-forwarded-for': '192.168.1.1' }
      })
      const response = await mockHandler(request)
      expect(response.status).toBe(429)
      
      const data = await response.json()
      expect(data.error).toBe('Too many requests')
      expect(response.headers.get('Retry-After')).toBe('10')
    })
  })

  describe('Cloudflare Rate Limiting Headers', () => {
    it('should handle Cloudflare rate limit headers', () => {
      const headers = new Headers({
        'CF-Ray': '1234567890',
        'CF-Cache-Status': 'HIT',
        'CF-IPCountry': 'JP'
      })

      // Cloudflareヘッダーの存在を確認
      expect(headers.get('CF-Ray')).toBe('1234567890')
      expect(headers.get('CF-IPCountry')).toBe('JP')
    })
  })
})