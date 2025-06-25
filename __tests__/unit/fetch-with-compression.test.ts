/**
 * Tests for fetch-with-compression utility
 */

import { describe, test, expect, vi, beforeEach } from 'vitest'
import { fetchWithCompression } from '@/lib/fetch-with-compression'

describe('fetch-with-compression', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    // Reset fetch mock
    global.fetch = vi.fn()
  })

  describe('fetchWithCompression', () => {
    test('should pass through to native fetch', async () => {
      const mockResponse = new Response('{}', { status: 200 })
      vi.mocked(global.fetch).mockResolvedValue(mockResponse)

      const result = await fetchWithCompression('/test')

      expect(global.fetch).toHaveBeenCalledWith('/test', undefined)
      expect(result).toBe(mockResponse)
    })

    test('should pass options to native fetch', async () => {
      const mockResponse = new Response('{}', { status: 200 })
      vi.mocked(global.fetch).mockResolvedValue(mockResponse)

      const options = {
        headers: {
          'Custom-Header': 'value',
          'Accept': 'application/xml'
        },
        method: 'POST'
      }

      await fetchWithCompression('/test', options)

      expect(global.fetch).toHaveBeenCalledWith('/test', options)
    })

    test('should handle fetch errors', async () => {
      const error = new Error('Network error')
      vi.mocked(global.fetch).mockRejectedValue(error)

      await expect(fetchWithCompression('/test')).rejects.toThrow('Network error')
    })
  })
})

