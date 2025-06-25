/**
 * 動的キャッシュ API Gatewayのユニットテスト
 * 動的TTLとETag機能を検証
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import * as cacheUtils from '../../lib/cache-utils'

// モック環境の設定
const mockR2Object = {
  text: vi.fn(),
  json: vi.fn(),
  arrayBuffer: vi.fn(),
  blob: vi.fn(),
  body: null,
  httpMetadata: {},
  httpEtag: '"test-etag-123"',
  etag: 'test-etag-123',
  size: 1000,
  key: 'test-key',
  version: '1',
  uploaded: new Date(),
  checksums: {},
  storageClass: 'STANDARD'
}

const mockR2Bucket = {
  get: vi.fn(),
  put: vi.fn(),
  delete: vi.fn(),
  list: vi.fn(),
  head: vi.fn()
}

const mockCache = {
  match: vi.fn(),
  put: vi.fn(),
  delete: vi.fn()
}

global.caches = {
  default: mockCache
} as any

// モジュールのモック
vi.mock('../../lib/cache-utils', () => ({
  calculateDynamicTTL: vi.fn(() => ({
    secondsUntilUpdate: 900,
    workersTTL: 900,
    cdnTTL: 840,
    browserTTL: 780,
    cacheControl: 'public, max-age=780, s-maxage=840, stale-while-revalidate=86400',
    cdnCacheControl: 'public, max-age=840'
  })),
  generateETag: vi.fn((content) => `"${content.length}"`),
  isETagMatch: vi.fn((current, ifNoneMatch) => current === ifNoneMatch)
}))

// 動的インポートでWorkerを取得
async function getWorkerModule() {
  return await import('../../workers/api-gateway-r2-enhanced')
}

describe('API Gateway R2 Enhanced', () => {
  let worker: any
  let env: any
  let ctx: any

  beforeEach(async () => {
    vi.clearAllMocks()
    
    // 現在時刻を固定（2025-01-01 10:10:00 UTC）
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2025-01-01T10:10:00.000Z'))
    
    const module = await getWorkerModule()
    worker = module.default
    
    env = {
      R2_BUCKET: mockR2Bucket,
      VERCEL_DEPLOYMENT_URL: 'https://test.vercel.app',
      WORKER_AUTH_KEY: 'test-auth-key'
    }
    
    ctx = {
      waitUntil: vi.fn()
    }
  })

  describe('動的TTL機能', () => {
    it('/api/ranking で動的TTLを使用する', async () => {
      // モックの動作を設定
      vi.mocked(cacheUtils.calculateDynamicTTL).mockReturnValue({
        secondsUntilUpdate: 900,
        workersTTL: 900,
        cdnTTL: 840,
        browserTTL: 780,
        cacheControl: 'public, max-age=780, s-maxage=840, stale-while-revalidate=86400',
        cdnCacheControl: 'public, max-age=840'
      })
      const testData = JSON.stringify({
        items: [{ id: 1, title: 'Test' }],
        metadata: { version: 1, updatedAt: '2025-01-01T10:00:00Z' }
      })
      
      mockR2Object.text.mockResolvedValue(testData)
      mockR2Bucket.get.mockResolvedValue(mockR2Object)
      mockCache.match.mockResolvedValue(null)
      
      const request = new Request('https://example.com/api/ranking?genre=all&period=24h')
      const response = await worker.fetch(request, env, ctx)
      
      // Cache-Controlヘッダーを確認
      // 10:10 → 10:25まで15分 = 900秒
      // browserTTL = 900 - 120 = 780秒
      // cdnTTL = 900 - 60 = 840秒
      expect(response.headers.get('Cache-Control')).toBe(
        'public, max-age=780, s-maxage=840, stale-while-revalidate=86400'
      )
      expect(response.headers.get('CDN-Cache-Control')).toBe('public, max-age=840')
    })

    it('更新時刻直前は最小TTLを使用する', async () => {
      // 10:24:30に時刻を変更
      vi.setSystemTime(new Date('2025-01-01T10:24:30.000Z'))
      
      // モックの動作を変更
      vi.mocked(cacheUtils.calculateDynamicTTL).mockReturnValue({
        secondsUntilUpdate: 30,
        workersTTL: 60,
        cdnTTL: 60,
        browserTTL: 60,
        cacheControl: 'public, max-age=60, s-maxage=60, stale-while-revalidate=86400',
        cdnCacheControl: 'public, max-age=60'
      })
      
      const testData = JSON.stringify({ items: [] })
      mockR2Object.text.mockResolvedValue(testData)
      mockR2Bucket.get.mockResolvedValue(mockR2Object)
      mockCache.match.mockResolvedValue(null)
      
      const request = new Request('https://example.com/api/ranking?genre=all')
      const response = await worker.fetch(request, env, ctx)
      
      // 全て最小値の60秒
      expect(response.headers.get('Cache-Control')).toBe(
        'public, max-age=60, s-maxage=60, stale-while-revalidate=86400'
      )
    })
  })

  describe('ETag機能', () => {
    it('R2からのETagをレスポンスに含める', async () => {
      const testData = JSON.stringify({ items: [] })
      mockR2Object.text.mockResolvedValue(testData)
      mockR2Bucket.get.mockResolvedValue(mockR2Object)
      mockCache.match.mockResolvedValue(null)
      
      const request = new Request('https://example.com/api/ranking?genre=all')
      const response = await worker.fetch(request, env, ctx)
      
      expect(response.headers.get('ETag')).toBe('"test-etag-123"')
    })

    it('If-None-Matchヘッダーで304を返す', async () => {
      mockR2Bucket.get.mockResolvedValue(mockR2Object)
      mockCache.match.mockResolvedValue(null)
      
      const request = new Request('https://example.com/api/ranking?genre=all', {
        headers: {
          'If-None-Match': '"test-etag-123"'
        }
      })
      
      const response = await worker.fetch(request, env, ctx)
      
      expect(response.status).toBe(304)
      expect(response.headers.get('ETag')).toBe('"test-etag-123"')
      expect(await response.text()).toBe('')
    })

    it('異なるETagの場合は200を返す', async () => {
      const testData = JSON.stringify({ items: [] })
      mockR2Object.text.mockResolvedValue(testData)
      mockR2Bucket.get.mockResolvedValue(mockR2Object)
      mockCache.match.mockResolvedValue(null)
      
      const request = new Request('https://example.com/api/ranking?genre=all', {
        headers: {
          'If-None-Match': '"different-etag"'
        }
      })
      
      const response = await worker.fetch(request, env, ctx)
      
      expect(response.status).toBe(200)
      expect(response.headers.get('ETag')).toBe('"test-etag-123"')
    })

    it('キャッシュヒット時もETagを返す', async () => {
      const cachedResponse = new Response(JSON.stringify({ items: [] }), {
        headers: {
          'Content-Type': 'application/json',
          'ETag': '"cached-etag-456"',
          'X-Cache-Status': 'HIT'
        }
      })
      
      mockCache.match.mockResolvedValue(cachedResponse)
      
      const request = new Request('https://example.com/api/ranking?genre=all')
      const response = await worker.fetch(request, env, ctx)
      
      expect(response.headers.get('ETag')).toBe('"cached-etag-456"')
      expect(response.headers.get('X-Cache-Status')).toBe('HIT')
    })
  })

  describe('タグ別ランキング', () => {
    it('タグ指定時は正しいR2キーを使用する', async () => {
      const testData = JSON.stringify({ items: [] })
      mockR2Object.text.mockResolvedValue(testData)
      mockR2Bucket.get.mockResolvedValue(mockR2Object)
      mockCache.match.mockResolvedValue(null)
      
      const request = new Request('https://example.com/api/ranking?genre=game&period=24h&tag=東方')
      await worker.fetch(request, env, ctx)
      
      expect(mockR2Bucket.get).toHaveBeenCalledWith(
        'rankings/game/24h/tags/%E6%9D%B1%E6%96%B9.json'
      )
    })

    it('存在しないタグは404ではなく空の結果を返す', async () => {
      mockR2Bucket.get.mockResolvedValue(null)
      mockCache.match.mockResolvedValue(null)
      
      const request = new Request('https://example.com/api/ranking?genre=game&tag=存在しないタグ')
      const response = await worker.fetch(request, env, ctx)
      
      expect(response.status).toBe(200)
      const data = await response.json()
      expect(data.items).toEqual([])
      expect(data.metadata.tag).toBe('存在しないタグ')
    })
  })

  describe('圧縮対応', () => {
    it('gzip圧縮されたR2データを正しく処理する', async () => {
      const originalData = JSON.stringify({ items: [{ id: 1 }] })
      const compressedData = Buffer.from('mock-gzip-data')
      
      const compressedR2Object = {
        ...mockR2Object,
        body: compressedData,
        httpMetadata: {
          contentEncoding: 'gzip'
        },
        arrayBuffer: vi.fn().mockResolvedValue(compressedData),
        text: vi.fn().mockRejectedValue(new Error('Cannot read compressed data as text'))
      }
      
      mockR2Bucket.get.mockResolvedValue(compressedR2Object)
      mockCache.match.mockResolvedValue(null)
      
      // 実際の解凍はWorker内で行われると仮定
      const request = new Request('https://example.com/api/ranking?genre=all')
      const response = await worker.fetch(request, env, ctx)
      
      expect(response.headers.get('Content-Encoding')).toBe('gzip')
    })
  })

  describe('エラーハンドリング', () => {
    it('R2エラー時はVercelにフォールバックする', async () => {
      mockR2Bucket.get.mockRejectedValue(new Error('R2 error'))
      mockCache.match.mockResolvedValue(null)
      
      // fetchをモック
      global.fetch = vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ fallback: true }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' }
        })
      )
      
      const request = new Request('https://example.com/api/ranking?genre=all')
      const response = await worker.fetch(request, env, ctx)
      
      expect(response.status).toBe(200)
      expect(global.fetch).toHaveBeenCalledWith(
        expect.objectContaining({
          url: 'https://test.vercel.app/api/ranking?genre=all'
        })
      )
    })
  })

  afterEach(() => {
    vi.useRealTimers()
  })
})