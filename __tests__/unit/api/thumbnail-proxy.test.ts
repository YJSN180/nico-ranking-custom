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
    it.each([
      'https://nicovideo.cdn.nimg.jp.evil.example/image.jpg',
      'https://user:password@nicovideo.cdn.nimg.jp/image.jpg',
      'https://nicovideo.cdn.nimg.jp:8443/image.jpg',
      'https://127.0.0.1/image.jpg',
    ])('rejects unsafe origin %s without fetching', async (imageUrl) => {
      const response = await GET(new NextRequest(`http://localhost/api/thumbnail-proxy?url=${encodeURIComponent(imageUrl)}`))
      expect(response.status).toBe(400)
      expect(mockFetch).not.toHaveBeenCalled()
    })

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

      // 解析できない URL は利用者の入力の誤り（上流へは問い合わせない）
      expect(response.status).toBe(400)
      expect(data.error).toBe('Invalid image URL')
      expect(mockFetch).not.toHaveBeenCalled()
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

  // 許可ホストのリダイレクトで外（任意のホストや内部アドレス）へ出ないよう、各ホップの行き先を確かめて自前で追う
  describe('GET /api/thumbnail-proxy のリダイレクト', () => {
    const imageUrl = 'https://tn.smilevideo.jp/smile?i=12345'
    const redirectTo = (location: string | null, status = 302) => ({
      ok: false,
      status,
      headers: new Headers(location === null ? {} : { location }),
      body: null,
    })
    const image = () => ({
      ok: true,
      status: 200,
      headers: new Headers({ 'content-type': 'image/jpeg' }),
      arrayBuffer: () => Promise.resolve(new ArrayBuffer(8)),
    })
    const proxy = () => GET(new NextRequest(`http://localhost/api/thumbnail-proxy?url=${encodeURIComponent(imageUrl)}`))
    const requestedUrls = () => mockFetch.mock.calls.map(([url]) => String(url))

    beforeEach(() => {
      mockFetch.mockReset()
    })

    it('fetch に自動では追わせない（redirect: manual）', async () => {
      mockFetch.mockResolvedValue(image())

      await proxy()

      expect(mockFetch).toHaveBeenCalledWith(imageUrl, expect.objectContaining({ redirect: 'manual' }))
    })

    it.each([301, 302, 303, 307, 308])('%i で許可ホストへ向かうなら追う', async (status) => {
      const cdn = 'https://nicovideo.cdn.nimg.jp/thumbnails/12345/12345'
      mockFetch.mockResolvedValueOnce(redirectTo(cdn, status)).mockResolvedValueOnce(image())

      const response = await proxy()

      expect(response.status).toBe(200)
      expect(requestedUrls()).toEqual([imageUrl, cdn])
    })

    it('相対の Location は今の URL を基準に解決して追う', async () => {
      mockFetch.mockResolvedValueOnce(redirectTo('/smile?i=12345&size=L')).mockResolvedValueOnce(image())

      const response = await proxy()

      expect(response.status).toBe(200)
      expect(requestedUrls()).toEqual([imageUrl, 'https://tn.smilevideo.jp/smile?i=12345&size=L'])
    })

    it.each([
      ['許可ホスト以外', 'https://tracker.example/thumbnail.jpg'],
      ['内部アドレス', 'http://169.254.169.254/latest/meta-data/'],
      ['許可ホストに似た別ホスト', 'https://nicovideo.cdn.nimg.jp.example/thumbnail.jpg'],
      ['http(s) 以外', 'ftp://nicovideo.cdn.nimg.jp/thumbnail.jpg'],
    ])('%s へのリダイレクトは追わずに 502', async (_label, location) => {
      mockFetch.mockResolvedValueOnce(redirectTo(location)).mockResolvedValue(image())

      const response = await proxy()

      expect(response.status).toBe(502)
      expect(await response.json()).toEqual({ error: 'Failed to fetch image' })
      expect(mockFetch).toHaveBeenCalledTimes(1)
    })

    it('Location の無いリダイレクトは 502', async () => {
      mockFetch.mockResolvedValueOnce(redirectTo(null)).mockResolvedValue(image())

      const response = await proxy()

      expect(response.status).toBe(502)
      expect(mockFetch).toHaveBeenCalledTimes(1)
    })

    it('リダイレクトは 3 回まで（4 回目は追わずに 502）', async () => {
      mockFetch.mockResolvedValue(redirectTo('https://nicovideo.cdn.nimg.jp/thumbnails/12345/loop'))

      const response = await proxy()

      expect(response.status).toBe(502)
      expect(mockFetch).toHaveBeenCalledTimes(4)
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
