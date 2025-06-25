/**
 * Tests for fetch-with-compression utility
 */

import { describe, test, expect, vi, beforeEach } from 'vitest'
import { fetchWithCompression, parseCompressedJSON, fetchJSON } from '@/lib/fetch-with-compression'

// Mock the unified-compression module
vi.mock('@/lib/unified-compression', () => ({
  decompressAndParseJSON: vi.fn()
}))

describe('fetch-with-compression', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    // Reset fetch mock
    global.fetch = vi.fn()
  })

  describe('fetchWithCompression', () => {
    test('should add Accept-Encoding header automatically', async () => {
      const mockResponse = new Response('{}', { status: 200 })
      vi.mocked(global.fetch).mockResolvedValue(mockResponse)

      await fetchWithCompression('/test')

      expect(global.fetch).toHaveBeenCalledWith('/test', {
        headers: expect.any(Headers)
      })

      const [, options] = vi.mocked(global.fetch).mock.calls[0]
      const headers = new Headers(options?.headers)
      expect(headers.get('Accept-Encoding')).toBe('gzip, deflate, br')
      expect(headers.get('Accept')).toBe('application/json')
    })

    test('should preserve existing headers', async () => {
      const mockResponse = new Response('{}', { status: 200 })
      vi.mocked(global.fetch).mockResolvedValue(mockResponse)

      await fetchWithCompression('/test', {
        headers: {
          'Custom-Header': 'value',
          'Accept': 'application/xml'
        }
      })

      const [, options] = vi.mocked(global.fetch).mock.calls[0]
      const headers = new Headers(options?.headers)
      expect(headers.get('Custom-Header')).toBe('value')
      expect(headers.get('Accept')).toBe('application/xml') // Should preserve custom Accept
      expect(headers.get('Accept-Encoding')).toBe('gzip, deflate, br')
    })

    test('should preserve Next.js specific options', async () => {
      const mockResponse = new Response('{}', { status: 200 })
      vi.mocked(global.fetch).mockResolvedValue(mockResponse)

      await fetchWithCompression('/test', {
        next: { revalidate: 300 },
        cache: 'force-cache'
      })

      const [, options] = vi.mocked(global.fetch).mock.calls[0]
      expect(options?.next).toEqual({ revalidate: 300 })
      expect(options?.cache).toBe('force-cache')
    })
  })

  describe('parseCompressedJSON', () => {
    test('should handle gzip compressed response', async () => {
      const mockData = { test: 'data' }
      const mockDecompress = vi.fn().mockResolvedValue({ data: mockData })
      
      // Mock the dynamic import
      vi.doMock('@/lib/unified-compression', () => ({
        decompressAndParseJSON: mockDecompress
      }))

      const mockArrayBuffer = new ArrayBuffer(8)
      const mockResponse = {
        headers: new Headers({ 'content-encoding': 'gzip' }),
        arrayBuffer: vi.fn().mockResolvedValue(mockArrayBuffer)
      } as any

      const result = await parseCompressedJSON(mockResponse)

      expect(mockResponse.arrayBuffer).toHaveBeenCalled()
      expect(mockDecompress).toHaveBeenCalledWith(expect.any(Uint8Array))
      expect(result).toEqual(mockData)
    })

    test('should handle deflate compressed response', async () => {
      const mockData = { test: 'deflate-data' }
      const mockDecompress = vi.fn().mockResolvedValue({ data: mockData })
      
      vi.doMock('@/lib/unified-compression', () => ({
        decompressAndParseJSON: mockDecompress
      }))

      const mockArrayBuffer = new ArrayBuffer(8)
      const mockResponse = {
        headers: new Headers({ 'content-encoding': 'deflate' }),
        arrayBuffer: vi.fn().mockResolvedValue(mockArrayBuffer)
      } as any

      const result = await parseCompressedJSON(mockResponse)

      expect(result).toEqual(mockData)
    })

    test('should handle uncompressed response', async () => {
      const mockData = { test: 'uncompressed' }
      const mockResponse = {
        headers: new Headers(),
        json: vi.fn().mockResolvedValue(mockData)
      } as any

      const result = await parseCompressedJSON(mockResponse)

      expect(mockResponse.json).toHaveBeenCalled()
      expect(result).toEqual(mockData)
    })

    test('should fallback to TextDecoder on decompression error', async () => {
      const mockDecompress = vi.fn().mockRejectedValue(new Error('Decompression failed'))
      
      vi.doMock('@/lib/unified-compression', () => ({
        decompressAndParseJSON: mockDecompress
      }))

      const jsonString = '{"fallback": "data"}'
      const mockArrayBuffer = new TextEncoder().encode(jsonString).buffer
      const mockResponse = {
        headers: new Headers({ 'content-encoding': 'gzip' }),
        arrayBuffer: vi.fn().mockResolvedValue(mockArrayBuffer)
      } as any

      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

      const result = await parseCompressedJSON(mockResponse)

      expect(consoleSpy).toHaveBeenCalledWith('[FetchCompression] Decompression failed:', expect.any(Error))
      expect(result).toEqual({ fallback: 'data' })
      
      consoleSpy.mockRestore()
    })
  })

  describe('fetchJSON', () => {
    test('should fetch and parse JSON successfully', async () => {
      const mockData = { success: true }
      const mockResponse = new Response(JSON.stringify(mockData), {
        status: 200,
        headers: { 'content-type': 'application/json' }
      })
      vi.mocked(global.fetch).mockResolvedValue(mockResponse)

      const result = await fetchJSON('/api/test')

      expect(result).toEqual(mockData)
    })

    test('should throw error for non-OK responses', async () => {
      const mockResponse = new Response('Not Found', { status: 404, statusText: 'Not Found' })
      vi.mocked(global.fetch).mockResolvedValue(mockResponse)

      await expect(fetchJSON('/api/test')).rejects.toThrow('HTTP 404: Not Found')
    })

    test('should handle compressed responses in fetchJSON', async () => {
      const mockData = { compressed: true }
      const mockDecompress = vi.fn().mockResolvedValue({ data: mockData })
      
      vi.doMock('@/lib/unified-compression', () => ({
        decompressAndParseJSON: mockDecompress
      }))

      const mockArrayBuffer = new ArrayBuffer(8)
      const mockResponse = new Response(mockArrayBuffer, {
        status: 200,
        headers: { 'content-encoding': 'gzip' }
      })
      // Mock arrayBuffer method
      mockResponse.arrayBuffer = vi.fn().mockResolvedValue(mockArrayBuffer)
      
      vi.mocked(global.fetch).mockResolvedValue(mockResponse)

      const result = await fetchJSON('/api/compressed')

      expect(result).toEqual(mockData)
    })

    test('should pass through options correctly', async () => {
      const mockResponse = new Response('{}', { status: 200 })
      vi.mocked(global.fetch).mockResolvedValue(mockResponse)

      await fetchJSON('/test', {
        method: 'POST',
        body: 'test-body',
        next: { revalidate: 600 }
      })

      const [url, options] = vi.mocked(global.fetch).mock.calls[0]
      expect(url).toBe('/test')
      expect(options?.method).toBe('POST')
      expect(options?.body).toBe('test-body')
      expect(options?.next).toEqual({ revalidate: 600 })
    })
  })

  describe('error handling', () => {
    test('should handle network errors', async () => {
      vi.mocked(global.fetch).mockRejectedValue(new Error('Network error'))

      await expect(fetchJSON('/api/test')).rejects.toThrow('Network error')
    })

    test('should handle invalid JSON in uncompressed response', async () => {
      const mockResponse = new Response('invalid json', {
        status: 200,
        headers: { 'content-type': 'application/json' }
      })
      vi.mocked(global.fetch).mockResolvedValue(mockResponse)

      await expect(fetchJSON('/api/test')).rejects.toThrow()
    })
  })
})