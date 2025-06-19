/**
 * Integration tests for full KV optimization mode
 * Tests the complete optimization without fallback
 */

import { describe, it, expect, beforeAll, vi } from 'vitest'
import type { ExecutionContext } from '@cloudflare/workers-types'

// Import the optimized worker
import worker, { clearMemoryCache } from '../../workers/api-gateway-optimized'

// Mock environment
const mockEnv = {
  RANKING_DATA: {
    get: vi.fn(),
    getWithMetadata: vi.fn(),
    put: vi.fn(),
    delete: vi.fn(),
    list: vi.fn()
  },
  NEXT_APP_URL: 'https://test-app.vercel.app',
  WORKER_AUTH_KEY: 'test-auth-key',
  VERCEL_PROTECTION_BYPASS_SECRET: 'test-bypass-secret'
}

// Mock execution context
const mockContext: ExecutionContext = {
  waitUntil: vi.fn(),
  passThroughOnException: vi.fn()
}

describe('Full KV Optimization Mode', () => {
  beforeEach(() => {
    // Reset mocks before each test
    vi.clearAllMocks()
    // Clear the memory cache
    clearMemoryCache()
  })

  describe('Performance Requirements', () => {
    it('should respond within 500ms for ranking requests', async () => {
      // Setup mock KV data
      const mockRankingData = {
        genres: {
          all: {
            '24h': {
              items: Array.from({ length: 100 }, (_, i) => ({
                rank: i + 1,
                id: `sm${i + 1}`,
                title: `Video ${i + 1}`,
                views: 1000 - i
              })),
              popularTags: ['tag1', 'tag2', 'tag3']
            }
          }
        },
        metadata: { version: 1, updatedAt: new Date().toISOString() }
      }

      mockEnv.RANKING_DATA.getWithMetadata.mockResolvedValue({
        value: new TextEncoder().encode(JSON.stringify(mockRankingData)),
        metadata: { compressed: false }
      })

      const request = new Request('https://nico-rank.com/api/edge/ranking?genre=all&period=24h')
      const startTime = performance.now()
      
      const response = await worker.fetch(request, mockEnv, mockContext)
      
      const endTime = performance.now()
      const responseTime = endTime - startTime

      expect(response.status).toBe(200)
      expect(responseTime).toBeLessThan(500)
      expect(response.headers.get('X-Cache-Status')).toBe('KV-OPTIMIZED')
      expect(response.headers.get('X-API-Version')).toBe('kv-optimized')
    })

    it('should handle cache efficiently with ETag support', async () => {
      const mockData = {
        genres: { all: { '24h': { items: [], popularTags: [] } } }
      }

      mockEnv.RANKING_DATA.getWithMetadata.mockResolvedValue({
        value: new TextEncoder().encode(JSON.stringify(mockData)),
        metadata: { compressed: false }
      })

      // First request
      const request1 = new Request('https://nico-rank.com/api/edge/ranking?genre=all&period=24h')
      const response1 = await worker.fetch(request1, mockEnv, mockContext)
      const etag = response1.headers.get('ETag')

      expect(etag).toBeTruthy()

      // Second request with ETag
      const request2 = new Request('https://nico-rank.com/api/edge/ranking?genre=all&period=24h', {
        headers: { 'If-None-Match': etag! }
      })
      const response2 = await worker.fetch(request2, mockEnv, mockContext)

      expect(response2.status).toBe(304)
      expect(mockEnv.RANKING_DATA.getWithMetadata).toHaveBeenCalledTimes(1) // Should use memory cache
    })
  })

  describe('Error Handling Without Fallback', () => {
    it('should return 500 when KV is unavailable', async () => {
      // Ensure mock is reset
      mockEnv.RANKING_DATA.getWithMetadata.mockReset()
      mockEnv.RANKING_DATA.getWithMetadata.mockRejectedValue(new Error('KV unavailable'))

      // Bypass memory cache to test KV failure
      const request = new Request('https://nico-rank.com/api/edge/ranking?genre=all&period=24h', {
        headers: { 'X-Bypass-Cache': 'true' }
      })
      const response = await worker.fetch(request, mockEnv, mockContext)

      expect(response.status).toBe(500)
      const data = await response.json()
      expect(data.error).toBe('Internal server error')
    })

    it('should handle empty KV data gracefully', async () => {
      // Ensure mock is reset
      mockEnv.RANKING_DATA.getWithMetadata.mockReset()
      mockEnv.RANKING_DATA.getWithMetadata.mockResolvedValue({
        value: null,
        metadata: null
      })

      // Bypass memory cache to test empty KV data
      const request = new Request('https://nico-rank.com/api/edge/ranking?genre=all&period=24h', {
        headers: { 'X-Bypass-Cache': 'true' }
      })
      const response = await worker.fetch(request, mockEnv, mockContext)

      expect(response.status).toBe(503)
      const data = await response.json()
      expect(data.error).toBe('No ranking data available')
    })
  })

  describe('Security Headers', () => {
    it('should apply all security headers', async () => {
      mockEnv.RANKING_DATA.getWithMetadata.mockResolvedValue({
        value: new TextEncoder().encode(JSON.stringify({ genres: {} })),
        metadata: {}
      })

      const request = new Request('https://nico-rank.com/api/edge/ranking')
      const response = await worker.fetch(request, mockEnv, mockContext)

      expect(response.headers.get('X-Content-Type-Options')).toBe('nosniff')
      expect(response.headers.get('X-Frame-Options')).toBe('DENY')
      expect(response.headers.get('X-XSS-Protection')).toBe('1; mode=block')
      expect(response.headers.get('Content-Security-Policy')).toContain("script-src 'self' 'unsafe-inline'")
    })
  })

  describe('Video Stats API', () => {
    it('should handle video stats requests efficiently', async () => {
      const mockStatsData = {
        stats: {
          'sm1': { views: 1000, comments: 100, mylists: 50 },
          'sm2': { views: 2000, comments: 200, mylists: 100 }
        }
      }

      mockEnv.RANKING_DATA.getWithMetadata.mockResolvedValue({
        value: new TextEncoder().encode(JSON.stringify(mockStatsData)),
        metadata: { compressed: false }
      })

      const request = new Request('https://nico-rank.com/api/edge/video-stats?ids=sm1,sm2,sm3')
      const response = await worker.fetch(request, mockEnv, mockContext)

      expect(response.status).toBe(200)
      const data = await response.json()
      expect(data.stats).toHaveProperty('sm1')
      expect(data.stats).toHaveProperty('sm2')
      expect(data.stats).not.toHaveProperty('sm3')
      expect(data.kvHitRate).toBe(2/3)
    })
  })

  describe('No Environment Variable Hardcoding', () => {
    it('should not work without required environment variables', async () => {
      const incompleteEnv = {
        RANKING_DATA: mockEnv.RANKING_DATA,
        // Missing NEXT_APP_URL
      }

      const request = new Request('https://nico-rank.com/')
      const response = await worker.fetch(request, incompleteEnv as any, mockContext)

      expect(response.status).toBe(500)
      expect(response.headers.get('Content-Type')).toBe('text/plain')
      expect(await response.text()).toBe('Target URL not configured')
    })
  })
})