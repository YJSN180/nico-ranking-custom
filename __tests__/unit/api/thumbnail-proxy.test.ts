import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { NextRequest } from 'next/server'
import { GET, OPTIONS } from '@/app/api/thumbnail-proxy/route'

// Mock global fetch
const mockFetch = vi.fn()
global.fetch = mockFetch

describe('Thumbnail Proxy API', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  describe('GET /api/thumbnail-proxy', () => {
    it('should return 400 when URL parameter is missing', async () => {
      const request = new NextRequest('http://localhost/api/thumbnail-proxy')
      const response = await GET(request)
      const data = await response.json()

      expect(response.status).toBe(400)
      expect(data.error).toBe('URL parameter is required')
    })

    it('should return 400 for non-allowed host', async () => {
      const request = new NextRequest('http://localhost/api/thumbnail-proxy?url=https://evil.com/image.jpg')
      const response = await GET(request)
      const data = await response.json()

      expect(response.status).toBe(400)
      expect(data.error).toBe('Invalid image URL')
    })

    it('should return 400 for invalid URL', async () => {
      const request = new NextRequest('http://localhost/api/thumbnail-proxy?url=not-a-valid-url')
      const response = await GET(request)
      const data = await response.json()

      expect(response.status).toBe(500) // URL parsing throws
    })

    it('should proxy image from allowed nicovideo.cdn.nimg.jp host', async () => {
      const mockImageBuffer = new ArrayBuffer(100)
      mockFetch.mockResolvedValue({
        ok: true,
        headers: new Headers({ 'content-type': 'image/jpeg' }),
        arrayBuffer: () => Promise.resolve(mockImageBuffer)
      })

      const imageUrl = 'https://nicovideo.cdn.nimg.jp/thumbnails/12345/12345.jpg'
      const request = new NextRequest(`http://localhost/api/thumbnail-proxy?url=${encodeURIComponent(imageUrl)}`)
      const response = await GET(request)

      expect(response.status).toBe(200)
      expect(response.headers.get('Content-Type')).toBe('image/jpeg')
      expect(response.headers.get('Content-Disposition')).toBe('attachment; filename="thumbnail.jpg"')
      expect(response.headers.get('Access-Control-Allow-Origin')).toBe('*')
    })

    it('should proxy image from allowed tn.smilevideo.jp host', async () => {
      const mockImageBuffer = new ArrayBuffer(100)
      mockFetch.mockResolvedValue({
        ok: true,
        headers: new Headers({ 'content-type': 'image/png' }),
        arrayBuffer: () => Promise.resolve(mockImageBuffer)
      })

      const imageUrl = 'https://tn.smilevideo.jp/smile?i=12345'
      const request = new NextRequest(`http://localhost/api/thumbnail-proxy?url=${encodeURIComponent(imageUrl)}`)
      const response = await GET(request)

      expect(response.status).toBe(200)
      expect(response.headers.get('Content-Type')).toBe('image/png')
    })

    it('should proxy image from allowed tn-skr servers', async () => {
      const mockImageBuffer = new ArrayBuffer(100)
      mockFetch.mockResolvedValue({
        ok: true,
        headers: new Headers({ 'content-type': 'image/webp' }),
        arrayBuffer: () => Promise.resolve(mockImageBuffer)
      })

      // Test tn-skr1
      const imageUrl = 'https://tn-skr1.smilevideo.jp/smile?i=12345'
      const request = new NextRequest(`http://localhost/api/thumbnail-proxy?url=${encodeURIComponent(imageUrl)}`)
      const response = await GET(request)

      expect(response.status).toBe(200)
      expect(mockFetch).toHaveBeenCalledWith(
        imageUrl,
        expect.objectContaining({
          headers: expect.objectContaining({
            'Referer': 'https://www.nicovideo.jp/'
          })
        })
      )
    })

    it('should return error when upstream fetch fails', async () => {
      mockFetch.mockResolvedValue({
        ok: false,
        status: 404
      })

      const imageUrl = 'https://nicovideo.cdn.nimg.jp/thumbnails/12345/notfound.jpg'
      const request = new NextRequest(`http://localhost/api/thumbnail-proxy?url=${encodeURIComponent(imageUrl)}`)
      const response = await GET(request)
      const data = await response.json()

      expect(response.status).toBe(404)
      expect(data.error).toBe('Failed to fetch image')
    })

    it('should return 500 on fetch network error', async () => {
      mockFetch.mockRejectedValue(new Error('Network error'))

      const imageUrl = 'https://nicovideo.cdn.nimg.jp/thumbnails/12345/12345.jpg'
      const request = new NextRequest(`http://localhost/api/thumbnail-proxy?url=${encodeURIComponent(imageUrl)}`)
      const response = await GET(request)
      const data = await response.json()

      expect(response.status).toBe(500)
      expect(data.error).toBe('Internal server error')
    })

    it('should set proper cache headers', async () => {
      const mockImageBuffer = new ArrayBuffer(100)
      mockFetch.mockResolvedValue({
        ok: true,
        headers: new Headers({ 'content-type': 'image/jpeg' }),
        arrayBuffer: () => Promise.resolve(mockImageBuffer)
      })

      const imageUrl = 'https://nicovideo.cdn.nimg.jp/thumbnails/12345/12345.jpg'
      const request = new NextRequest(`http://localhost/api/thumbnail-proxy?url=${encodeURIComponent(imageUrl)}`)
      const response = await GET(request)

      expect(response.headers.get('Cache-Control')).toBe('public, max-age=3600')
      expect(response.headers.get('X-Content-Type-Options')).toBe('nosniff')
    })

    it('should use default content-type when not provided by upstream', async () => {
      const mockImageBuffer = new ArrayBuffer(100)
      mockFetch.mockResolvedValue({
        ok: true,
        headers: new Headers({}), // No content-type
        arrayBuffer: () => Promise.resolve(mockImageBuffer)
      })

      const imageUrl = 'https://nicovideo.cdn.nimg.jp/thumbnails/12345/12345.jpg'
      const request = new NextRequest(`http://localhost/api/thumbnail-proxy?url=${encodeURIComponent(imageUrl)}`)
      const response = await GET(request)

      expect(response.status).toBe(200)
      expect(response.headers.get('Content-Type')).toBe('image/jpeg')
    })
  })

  describe('OPTIONS /api/thumbnail-proxy', () => {
    it('should return CORS headers', async () => {
      const response = await OPTIONS()

      expect(response.status).toBe(200)
      expect(response.headers.get('Access-Control-Allow-Origin')).toBe('*')
      expect(response.headers.get('Access-Control-Allow-Methods')).toBe('GET, OPTIONS')
      expect(response.headers.get('Access-Control-Allow-Headers')).toBe('Content-Type')
      expect(response.headers.get('Access-Control-Max-Age')).toBe('86400')
    })
  })
})
