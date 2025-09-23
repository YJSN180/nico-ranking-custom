import { describe, it, expect } from 'vitest'
import {
  generateETag,
  handleConditionalRequest,
  paginate,
  selectFields,
  getOptimizedHeaders,
  estimateTransferSize
} from '@/lib/api-optimization'

describe('API Optimization Library', () => {
  describe('generateETag', () => {
    it('should generate consistent ETags for same data', () => {
      const data = JSON.stringify({ test: 'data' })
      const etag1 = generateETag(data)
      const etag2 = generateETag(data)

      expect(etag1).toBe(etag2)
      expect(etag1).toMatch(/^"[a-z0-9]+"$/)
    })

    it('should generate different ETags for different data', () => {
      const data1 = JSON.stringify({ test: 'data1' })
      const data2 = JSON.stringify({ test: 'data2' })

      const etag1 = generateETag(data1)
      const etag2 = generateETag(data2)

      expect(etag1).not.toBe(etag2)
    })

    it('should handle empty strings', () => {
      const etag = generateETag('')
      expect(etag).toMatch(/^"[a-z0-9]+"$/)
    })

    it('should handle large data efficiently', () => {
      const largeData = JSON.stringify({
        items: Array(1000).fill(0).map((_, i) => ({
          id: i,
          title: `Item ${i}`,
          description: `Description for item ${i}`,
          tags: [`tag${i}`, `tag${i + 1}`],
          metadata: { created: new Date().toISOString() }
        }))
      })

      const startTime = Date.now()
      const etag = generateETag(largeData)
      const duration = Date.now() - startTime

      expect(etag).toMatch(/^"[a-z0-9]+"$/)
      expect(duration).toBeLessThan(100) // Should be fast
    })
  })

  describe('handleConditionalRequest', () => {
    it('should return 304 for matching ETag', () => {
      const request = new Request('http://localhost/api/test', {
        headers: {
          'if-none-match': '"abc123"'
        }
      })

      const data = { test: 'data' }
      const response = handleConditionalRequest(request, data, '"abc123"')

      expect(response).toBeInstanceOf(Response)
      expect(response?.status).toBe(304)
      expect(response?.headers.get('etag')).toBe('"abc123"')
      expect(response?.headers.get('cache-control')).toBeDefined()
    })

    it('should return null for non-matching ETag', () => {
      const request = new Request('http://localhost/api/test', {
        headers: {
          'if-none-match': '"old-etag"'
        }
      })

      const data = { test: 'data' }
      const response = handleConditionalRequest(request, data, '"new-etag"')

      expect(response).toBeNull()
    })

    it('should return null when no If-None-Match header', () => {
      const request = new Request('http://localhost/api/test')

      const data = { test: 'data' }
      const response = handleConditionalRequest(request, data, '"abc123"')

      expect(response).toBeNull()
    })

    it('should handle weak ETags correctly', () => {
      const request = new Request('http://localhost/api/test', {
        headers: {
          'if-none-match': 'W/"abc123"'
        }
      })

      const data = { test: 'data' }
      const response = handleConditionalRequest(request, data, 'W/"abc123"')

      expect(response).toBeInstanceOf(Response)
      expect(response?.status).toBe(304)
    })
  })

  describe('paginate', () => {
    const testItems = Array(100).fill(0).map((_, i) => ({
      id: i,
      name: `Item ${i}`
    }))

    it('should paginate with default values', () => {
      const result = paginate(testItems, {})

      expect(result.items).toHaveLength(30) // default is 30
      expect(result.items[0].id).toBe(0)
      expect(result.items[29].id).toBe(29)
      expect(result.total).toBe(100)
      expect(result.hasMore).toBe(true)
    })

    it('should paginate with custom limit', () => {
      const result = paginate(testItems, { limit: 10 })

      expect(result.items).toHaveLength(10)
      expect(result.total).toBe(100)
      expect(result.hasMore).toBe(true)
    })

    it('should paginate with offset', () => {
      const result = paginate(testItems, { offset: 50, limit: 20 })

      expect(result.items).toHaveLength(20)
      expect(result.items[0].id).toBe(50)
      expect(result.items[19].id).toBe(69)
      expect(result.hasMore).toBe(true)
    })

    it('should handle last page correctly', () => {
      const result = paginate(testItems, { offset: 90, limit: 20 })

      expect(result.items).toHaveLength(10)
      expect(result.items[0].id).toBe(90)
      expect(result.items[9].id).toBe(99)
      expect(result.hasMore).toBe(false)
    })

    it('should handle offset beyond items', () => {
      const result = paginate(testItems, { offset: 150, limit: 20 })

      expect(result.items).toHaveLength(0)
      expect(result.total).toBe(100)
      expect(result.hasMore).toBe(false)
    })

    it('should handle empty arrays', () => {
      const result = paginate([], {})

      expect(result.items).toHaveLength(0)
      expect(result.total).toBe(0)
      expect(result.hasMore).toBe(false)
    })

    it('should respect maximum limit', () => {
      const result = paginate(testItems, { limit: 200 })

      expect(result.items).toHaveLength(100) // All items, capped by total
      expect(result.limit).toBe(100) // limit is capped at 100
      expect(result.hasMore).toBe(false)
    })

    it('should handle page parameter', () => {
      const result = paginate(testItems, { page: 2, limit: 10 })

      expect(result.items).toHaveLength(10)
      expect(result.items[0].id).toBe(10) // page 2 starts at offset 10
      expect(result.offset).toBe(10)
    })
  })

  describe('selectFields', () => {
    const testData = [
      {
        id: 1,
        name: 'Test Item',
        description: 'Long description text',
        metadata: {
          created: '2025-01-01',
          updated: '2025-01-02'
        },
        tags: ['tag1', 'tag2'],
        private: 'secret'
      },
      {
        id: 2,
        name: 'Test Item 2',
        description: 'Another description',
        metadata: {
          created: '2025-01-03',
          updated: '2025-01-04'
        },
        tags: ['tag3', 'tag4'],
        private: 'secret2'
      }
    ]

    it('should select specified fields only', () => {
      const result = selectFields(testData, 'id,name')

      expect(result).toEqual([
        { id: 1, name: 'Test Item' },
        { id: 2, name: 'Test Item 2' }
      ])
    })

    it('should handle nested fields', () => {
      const result = selectFields(testData, 'id,metadata')

      expect(result).toEqual([
        {
          id: 1,
          metadata: {
            created: '2025-01-01',
            updated: '2025-01-02'
          }
        },
        {
          id: 2,
          metadata: {
            created: '2025-01-03',
            updated: '2025-01-04'
          }
        }
      ])
    })

    it('should return all fields when fields is undefined', () => {
      const result = selectFields(testData)

      expect(result).toEqual(testData)
    })

    it('should handle non-existent fields gracefully', () => {
      const result = selectFields(testData, 'id,nonexistent')

      expect(result).toEqual([
        { id: 1 },
        { id: 2 }
      ])
    })

    it('should handle spaces in field list', () => {
      const result = selectFields(testData, 'id, name, tags')

      expect(result).toEqual([
        { id: 1, name: 'Test Item', tags: ['tag1', 'tag2'] },
        { id: 2, name: 'Test Item 2', tags: ['tag3', 'tag4'] }
      ])
    })
  })

  describe('getOptimizedHeaders', () => {
    it('should return headers with ETag and cache control', () => {
      const headers = getOptimizedHeaders('"test-etag"', 300, 600)

      expect(headers['etag']).toBe('"test-etag"')
      expect(headers['cache-control']).toContain('public')
      expect(headers['cache-control']).toContain('max-age=300')
      expect(headers['cache-control']).toContain('s-maxage=600')
      expect(headers['cache-control']).toContain('stale-while-revalidate=86400')
      expect(headers['vary']).toBe('Accept-Encoding, Accept')
    })

    it('should handle default values', () => {
      const headers = getOptimizedHeaders()

      expect(headers['etag']).toBeUndefined()
      expect(headers['cache-control']).toContain('max-age=60')
      expect(headers['cache-control']).toContain('s-maxage=3600')
    })

    it('should include CDN cache control', () => {
      const headers = getOptimizedHeaders('"test-etag"', 300, 600)

      expect(headers['cdn-cache-control']).toContain('max-age=600')
      expect(headers['cdn-cache-control']).toContain('stale-while-revalidate=86400')
    })

    it('should set content-type to application/json', () => {
      const headers = getOptimizedHeaders()

      expect(headers['content-type']).toBe('application/json')
    })
  })

  describe('estimateTransferSize', () => {
    it('should estimate transfer size for small data', () => {
      const data = { test: 'data' }
      const estimate = estimateTransferSize(data)

      expect(estimate.raw).toBeGreaterThan(0)
      expect(estimate.json).toBe(JSON.stringify(data).length)
      expect(estimate.humanReadable).toMatch(/^\d+(\.\d+)?\s+B$/)
    })

    it('should estimate transfer size in KB', () => {
      const data = {
        items: Array(100).fill(0).map((_, i) => ({
          id: i,
          title: `Item ${i}`,
          description: `Description for item ${i}`
        }))
      }
      const estimate = estimateTransferSize(data)

      expect(estimate.raw).toBeGreaterThan(1024)
      expect(estimate.humanReadable).toMatch(/^\d+\.\d+\s+KB$/)
    })

    it('should estimate transfer size in MB', () => {
      const data = {
        items: Array(10000).fill(0).map((_, i) => ({
          id: i,
          title: `Item ${i}`,
          description: `Very long description for item ${i} that contains a lot of text to make the data larger`,
          metadata: {
            created: new Date().toISOString(),
            updated: new Date().toISOString(),
            tags: [`tag${i}`, `tag${i + 1}`, `tag${i + 2}`]
          }
        }))
      }
      const estimate = estimateTransferSize(data)

      expect(estimate.raw).toBeGreaterThan(1024 * 1024)
      expect(estimate.humanReadable).toMatch(/^\d+\.\d+\s+MB$/)
    })
  })

  describe('Integration tests', () => {
    it('should handle full optimization flow', () => {
      // Simulate API data
      const apiData = Array(50).fill(0).map((_, i) => ({
        id: i,
        title: `Item ${i}`,
        description: `Description ${i}`,
        metadata: { views: i * 100 }
      }))

      // Generate ETag
      const dataStr = JSON.stringify(apiData)
      const etag = generateETag(dataStr)

      // Paginate data
      const paginatedResult = paginate(apiData, { limit: 10, offset: 20 })

      // Select fields
      const fieldsResult = selectFields(paginatedResult.items, 'id,title')

      // Get headers
      const headers = getOptimizedHeaders(etag, 300, 600)

      expect(fieldsResult).toHaveLength(10)
      expect(fieldsResult[0]).toEqual({ id: 20, title: 'Item 20' })
      expect(headers['etag']).toBe(etag)
      expect(headers['cache-control']).toContain('max-age=300')
    })

    it('should handle conditional request in integration', () => {
      const data = { test: 'data' }
      const dataStr = JSON.stringify(data)
      const etag = generateETag(dataStr)

      // First request - no cache
      const request1 = new Request('http://localhost/api/test')
      const response1 = handleConditionalRequest(request1, data, etag)
      expect(response1).toBeNull()

      // Second request - with matching ETag
      const request2 = new Request('http://localhost/api/test', {
        headers: {
          'if-none-match': etag
        }
      })
      const response2 = handleConditionalRequest(request2, data, etag)
      expect(response2?.status).toBe(304)
    })

    it('should estimate size for paginated and filtered data', () => {
      const fullData = Array(100).fill(0).map((_, i) => ({
        id: i,
        title: `Item ${i}`,
        description: `Description ${i}`,
        extra: 'unnecessary data'
      }))

      // Paginate
      const paginated = paginate(fullData, { limit: 10 })

      // Select fields
      const filtered = selectFields(paginated.items, 'id,title')

      // Estimate sizes
      const fullSize = estimateTransferSize(fullData)
      const optimizedSize = estimateTransferSize(filtered)

      expect(optimizedSize.raw).toBeLessThan(fullSize.raw)
    })
  })
})