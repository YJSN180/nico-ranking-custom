import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

describe('Tags Autocomplete API', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.resetModules()
  })

  describe('GET /api/tags/autocomplete', () => {
    it('should return empty suggestions for query shorter than 2 characters', async () => {
      const { GET } = await import('@/app/api/tags/autocomplete/route')
      const request = new NextRequest('http://localhost/api/tags/autocomplete?q=V')

      const response = await GET(request)
      const data = await response.json()

      expect(response.status).toBe(200)
      expect(data.suggestions).toEqual([])
      expect(data.metadata.source).toBe('query-too-short')
    })

    it('should return empty suggestions for empty query', async () => {
      const { GET } = await import('@/app/api/tags/autocomplete/route')
      const request = new NextRequest('http://localhost/api/tags/autocomplete?q=')

      const response = await GET(request)
      const data = await response.json()

      expect(response.status).toBe(200)
      expect(data.suggestions).toEqual([])
      expect(data.metadata.source).toBe('query-too-short')
    })

    it('should return empty suggestions when no query provided', async () => {
      const { GET } = await import('@/app/api/tags/autocomplete/route')
      const request = new NextRequest('http://localhost/api/tags/autocomplete')

      const response = await GET(request)
      const data = await response.json()

      expect(response.status).toBe(200)
      expect(data.suggestions).toEqual([])
    })

    it('should return suggestions for valid query from real data', async () => {
      // This test uses real data file if available
      const { GET } = await import('@/app/api/tags/autocomplete/route')
      const request = new NextRequest('http://localhost/api/tags/autocomplete?q=VO')

      const response = await GET(request)
      const data = await response.json()

      expect(response.status).toBe(200)
      expect(data.metadata.source).toBe('next-api-tagdata')
      // Suggestions should be an array
      expect(Array.isArray(data.suggestions)).toBe(true)
    })

    it('should respect limit parameter', async () => {
      const { GET } = await import('@/app/api/tags/autocomplete/route')
      const request = new NextRequest('http://localhost/api/tags/autocomplete?q=ゲーム&limit=3')

      const response = await GET(request)
      const data = await response.json()

      expect(response.status).toBe(200)
      // Limit should cap results
      expect(data.suggestions.length).toBeLessThanOrEqual(3)
    })

    it('should use default limit of 10 when not specified', async () => {
      const { GET } = await import('@/app/api/tags/autocomplete/route')
      const request = new NextRequest('http://localhost/api/tags/autocomplete?q=test')

      const response = await GET(request)
      const data = await response.json()

      expect(response.status).toBe(200)
      // Default limit is 10
      expect(data.suggestions.length).toBeLessThanOrEqual(10)
    })

    it('should include cache control header', async () => {
      const { GET } = await import('@/app/api/tags/autocomplete/route')
      const request = new NextRequest('http://localhost/api/tags/autocomplete?q=test')

      const response = await GET(request)

      expect(response.status).toBe(200)
      expect(response.headers.get('Cache-Control')).toBe('public, max-age=300')
    })

    it('should include metadata in response', async () => {
      const { GET } = await import('@/app/api/tags/autocomplete/route')
      const request = new NextRequest('http://localhost/api/tags/autocomplete?q=test')

      const response = await GET(request)
      const data = await response.json()

      expect(response.status).toBe(200)
      expect(data).toHaveProperty('query', 'test')
      expect(data).toHaveProperty('suggestions')
      expect(data).toHaveProperty('metadata')
      expect(data.metadata).toHaveProperty('total')
      expect(data.metadata).toHaveProperty('source')
    })

    it('should return query echo in response', async () => {
      const { GET } = await import('@/app/api/tags/autocomplete/route')
      const request = new NextRequest('http://localhost/api/tags/autocomplete?q=VOCALOID')

      const response = await GET(request)
      const data = await response.json()

      expect(response.status).toBe(200)
      expect(data.query).toBe('VOCALOID')
    })
  })
})
