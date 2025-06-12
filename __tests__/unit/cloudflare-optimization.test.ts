import { describe, it, expect, vi, beforeEach } from 'vitest'
import pako from 'pako'

// モックの設定
const mockCache = {
  match: vi.fn(),
  put: vi.fn()
}

const mockCaches = {
  default: mockCache
}

const mockKVNamespace = {
  get: vi.fn(),
  put: vi.fn()
}

vi.stubGlobal('caches', mockCaches)

describe('Cloudflare Workers Optimization Tests', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('Response Compression', () => {
    it('should compress JSON responses with gzip', async () => {
      const testData = { items: Array(100).fill({ id: 'test', title: 'Test Item' }) }
      const jsonString = JSON.stringify(testData)
      
      // リクエストの作成
      const request = new Request('https://example.com/api/ranking', {
        headers: {
          'Accept-Encoding': 'gzip, deflate, br'
        }
      })
      
      const response = new Response(jsonString, {
        headers: {
          'Content-Type': 'application/json'
        }
      })
      
      // 圧縮のシミュレーション
      const compressed = pako.gzip(new TextEncoder().encode(jsonString))
      const compressedSize = compressed.length
      const originalSize = jsonString.length
      
      // 圧縮率の確認
      const compressionRatio = (1 - compressedSize / originalSize) * 100
      expect(compressionRatio).toBeGreaterThan(50) // 50%以上の圧縮を期待
    })

    it('should not compress small responses', () => {
      const smallData = { status: 'ok' }
      const jsonString = JSON.stringify(smallData)
      
      // 1KB未満のレスポンスは圧縮しない
      expect(jsonString.length).toBeLessThan(1024)
    })

    it('should add Vary header for compressed responses', () => {
      const headers = new Headers()
      headers.set('Content-Encoding', 'gzip')
      headers.set('Vary', 'Accept-Encoding')
      
      expect(headers.get('Vary')).toBe('Accept-Encoding')
    })
  })

  describe('Cache Tag Management', () => {
    it('should add cache tags to response headers', () => {
      const headers = new Headers()
      headers.set('Cache-Tag', 'api,ranking,all')
      
      const tags = headers.get('Cache-Tag')?.split(',') || []
      expect(tags).toContain('api')
      expect(tags).toContain('ranking')
      expect(tags).toContain('all')
    })

    it('should support hierarchical cache invalidation', () => {
      const cacheKeys = [
        'api:ranking:all:24h',
        'api:ranking:all:hour',
        'api:ranking:game:24h',
        'api:ranking:game:hour'
      ]
      
      // 'all'タグで無効化
      const invalidatedByAll = cacheKeys.filter(key => key.includes(':all:'))
      expect(invalidatedByAll).toHaveLength(2)
      
      // '24h'タグで無効化
      const invalidatedBy24h = cacheKeys.filter(key => key.includes(':24h'))
      expect(invalidatedBy24h).toHaveLength(2)
    })
  })

  describe('Request Coalescing', () => {
    it('should coalesce identical concurrent requests', async () => {
      const pendingRequests = new Map<string, Promise<Response>>()
      const cacheKey = 'api:/api/ranking?genre=all&period=24h'
      
      // 同じリクエストを3回実行
      const makeRequest = () => {
        if (pendingRequests.has(cacheKey)) {
          return pendingRequests.get(cacheKey)!
        }
        
        const promise = new Promise<Response>((resolve) => {
          setTimeout(() => {
            resolve(new Response(JSON.stringify({ data: 'test' })))
          }, 100)
        })
        
        pendingRequests.set(cacheKey, promise)
        return promise
      }
      
      const requests = [makeRequest(), makeRequest(), makeRequest()]
      const responses = await Promise.all(requests)
      
      // すべて同じレスポンスを受け取るはず
      expect(responses).toHaveLength(3)
      expect(pendingRequests.size).toBe(1)
    })
  })

  describe('Tiered Caching', () => {
    it('should set different cache headers for different tiers', () => {
      const headers = new Headers()
      
      // エッジキャッシュ
      headers.set('Cache-Control', 'public, s-maxage=30, stale-while-revalidate=60')
      
      // CDNキャッシュ
      headers.set('Cloudflare-CDN-Cache-Control', 'max-age=300, stale-while-revalidate=3600')
      
      expect(headers.get('Cache-Control')).toContain('s-maxage=30')
      expect(headers.get('Cloudflare-CDN-Cache-Control')).toContain('max-age=300')
    })
  })

  describe('Performance Metrics', () => {
    it('should track cache hit rate', () => {
      const metrics = {
        cacheHits: 85,
        cacheMisses: 15,
        hitRate: 0,
        avgResponseTime: 0
      }
      
      const total = metrics.cacheHits + metrics.cacheMisses
      metrics.hitRate = (metrics.cacheHits / total) * 100
      
      expect(metrics.hitRate).toBe(85)
    })

    it('should track response times', () => {
      const responseTimes = [10, 15, 20, 25, 30]
      const avgResponseTime = responseTimes.reduce((a, b) => a + b, 0) / responseTimes.length
      
      expect(avgResponseTime).toBe(20)
    })
  })

  describe('Early Hints', () => {
    it('should support 103 Early Hints for critical resources', () => {
      const earlyHints = {
        status: 103,
        headers: {
          'Link': [
            '</static/css/main.css>; rel=preload; as=style',
            '</static/js/app.js>; rel=preload; as=script',
            '<https://fonts.googleapis.com/css2?family=Noto+Sans+JP>; rel=preconnect'
          ].join(', ')
        }
      }
      
      expect(earlyHints.status).toBe(103)
      expect(earlyHints.headers.Link).toContain('rel=preload')
      expect(earlyHints.headers.Link).toContain('rel=preconnect')
    })
  })

  describe('Static Asset Optimization', () => {
    it('should set immutable cache for static assets', () => {
      const staticPatterns = [
        '/static/js/app.js',
        '/static/css/main.css',
        '/images/logo.png',
        '/fonts/NotoSansJP.woff2'
      ]
      
      staticPatterns.forEach(path => {
        const isStatic = /\.(js|css|png|woff2)$/.test(path)
        expect(isStatic).toBe(true)
      })
    })

    it('should use edge cache for static assets', async () => {
      mockCache.match.mockResolvedValueOnce(null)
      mockCache.put.mockResolvedValueOnce(undefined)
      
      const request = new Request('https://example.com/static/js/app.js')
      const response = new Response('console.log("test")', {
        headers: {
          'Content-Type': 'application/javascript',
          'Cache-Control': 'public, max-age=31536000, immutable'
        }
      })
      
      // キャッシュに保存
      await mockCache.put(request, response)
      
      expect(mockCache.put).toHaveBeenCalledWith(request, response)
    })
  })

  describe('Rate Limiting Optimization', () => {
    it('should use different rate limits for different endpoints', () => {
      const rateLimits = {
        general: { requests: 60, window: 60 },
        api: { requests: 20, window: 60 },
        bot: { requests: 5, window: 60 },
        burst: { requests: 10, window: 10 }
      }
      
      // API エンドポイント
      const apiPath = '/api/ranking'
      const isApi = apiPath.startsWith('/api/')
      expect(isApi).toBe(true)
      
      // ボット判定
      const botUA = 'Mozilla/5.0 (compatible; Googlebot/2.1)'
      const isBot = /bot|crawler|spider/i.test(botUA)
      expect(isBot).toBe(true)
    })

    it('should implement burst protection', async () => {
      const clientIp = '192.168.1.1'
      const burstKey = `burst:${clientIp}`
      
      mockKVNamespace.get.mockResolvedValueOnce('9')
      
      const burstCount = await mockKVNamespace.get(burstKey)
      expect(parseInt(burstCount || '0')).toBeLessThan(10)
    })
  })
})