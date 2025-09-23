import { describe, it, expect, beforeAll, vi } from 'vitest'
import { unstable_dev } from 'wrangler'
import type { UnstableDevWorker } from 'wrangler'

describe('Popular Tags API Worker', () => {
  let worker: UnstableDevWorker

  beforeAll(async () => {
    worker = await unstable_dev('workers/popular-tags-api.ts', {
      experimental: { disableExperimentalWarning: true },
    })
  })

  afterAll(async () => {
    await worker.stop()
  })

  describe('GET /api/popular-tags', () => {
    it('should return popular tags for a valid genre', async () => {
      const response = await worker.fetch('/api/popular-tags?genre=all&period=24h')
      expect(response.status).toBe(200)

      const data = await response.json()
      expect(data).toHaveProperty('tags')
      expect(Array.isArray(data.tags)).toBe(true)
    })

    it('should handle pagination parameters', async () => {
      const response = await worker.fetch('/api/popular-tags?genre=game&period=24h&page=1&limit=10')
      expect(response.status).toBe(200)

      const data = await response.json()
      expect(data).toHaveProperty('tags')
      expect(data).toHaveProperty('total')
      expect(data).toHaveProperty('page')
      expect(data).toHaveProperty('limit')
      expect(data.tags.length).toBeLessThanOrEqual(10)
    })

    it('should return 304 for matching ETag', async () => {
      // First request to get ETag
      const firstResponse = await worker.fetch('/api/popular-tags?genre=anime&period=hour')
      const etag = firstResponse.headers.get('etag')
      expect(etag).toBeTruthy()

      // Second request with If-None-Match
      const secondResponse = await worker.fetch('/api/popular-tags?genre=anime&period=hour', {
        headers: {
          'If-None-Match': etag!
        }
      })
      expect(secondResponse.status).toBe(304)
    })

    it('should set appropriate cache headers', async () => {
      const response = await worker.fetch('/api/popular-tags?genre=technology&period=24h')

      const cacheControl = response.headers.get('cache-control')
      expect(cacheControl).toContain('public')
      expect(cacheControl).toContain('max-age=1800')
      expect(cacheControl).toContain('s-maxage=3600')

      const etag = response.headers.get('etag')
      expect(etag).toBeTruthy()
    })

    it('should handle missing parameters gracefully', async () => {
      const response = await worker.fetch('/api/popular-tags')
      expect(response.status).toBe(200)

      const data = await response.json()
      expect(data).toHaveProperty('tags')
      // Should default to 'all' genre and '24h' period
    })

    it('should handle invalid genre gracefully', async () => {
      const response = await worker.fetch('/api/popular-tags?genre=invalid&period=24h')
      expect(response.status).toBe(200)

      const data = await response.json()
      expect(data).toHaveProperty('tags')
      expect(data.tags).toEqual([]) // Should return empty array for invalid genre
    })

    it('should support CORS headers', async () => {
      const response = await worker.fetch('/api/popular-tags?genre=all', {
        headers: {
          'Origin': 'https://example.com'
        }
      })

      expect(response.headers.get('access-control-allow-origin')).toBe('*')
      expect(response.headers.get('access-control-allow-methods')).toContain('GET')
    })

    it('should track data source in headers', async () => {
      const response = await worker.fetch('/api/popular-tags?genre=voicesynthesis&period=hour')

      const dataSource = response.headers.get('x-data-source')
      expect(['kv', 'scrape', 'fallback']).toContain(dataSource)
    })
  })

  describe('Performance', () => {
    it('should respond within 100ms for cached data', async () => {
      const start = Date.now()
      const response = await worker.fetch('/api/popular-tags?genre=entertainment&period=24h')
      const duration = Date.now() - start

      expect(response.status).toBe(200)
      expect(duration).toBeLessThan(100)
    })

    it('should handle concurrent requests efficiently', async () => {
      const requests = Array.from({ length: 10 }, (_, i) =>
        worker.fetch(`/api/popular-tags?genre=all&period=24h&page=${i}`)
      )

      const responses = await Promise.all(requests)
      expect(responses.every(r => r.status === 200)).toBe(true)
    })
  })
})