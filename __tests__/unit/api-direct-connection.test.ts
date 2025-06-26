import { APIFallback } from '@/lib/api-fallback'
import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest'

describe('API Direct Connection', () => {
  beforeEach(() => {
    // グローバルfetchをモック
    global.fetch = vi.fn()
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  describe('Cloudflare Worker直接接続', () => {
    it('Cloudflare Workerに直接リクエストを送信する', async () => {
      const mockResponse = new Response(JSON.stringify({ items: [] }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' }
      })
      vi.mocked(global.fetch).mockResolvedValueOnce(mockResponse)

      const params = new URLSearchParams({ genre: 'all', period: '24h' })
      await APIFallback.fetchWithFallback(params)

      expect(global.fetch).toHaveBeenCalledWith(
        'https://nico-rank.com/api/ranking?genre=all&period=24h',
        expect.objectContaining({
          headers: expect.objectContaining({
            'Accept': 'application/json',
            'Accept-Encoding': 'gzip, deflate, br'
          })
        })
      )
    })

    it('ブラウザ環境ではOriginヘッダーを送信する', async () => {
      // window.locationをモック
      Object.defineProperty(window, 'location', {
        value: { origin: 'https://nico-ranking-custom.vercel.app' },
        writable: true
      })

      const mockResponse = new Response(JSON.stringify({ items: [] }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' }
      })
      vi.mocked(global.fetch).mockResolvedValueOnce(mockResponse)

      const params = new URLSearchParams({ genre: 'all' })
      await APIFallback.fetchWithFallback(params)

      expect(global.fetch).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          headers: expect.objectContaining({
            'Origin': 'https://nico-ranking-custom.vercel.app'
          })
        })
      )
    })

    it('Node.js環境（SSR）では空のOriginヘッダーを送信する', async () => {
      // windowを削除してNode.js環境をシミュレート
      const originalWindow = global.window
      // @ts-ignore
      delete global.window

      const mockResponse = new Response(JSON.stringify({ items: [] }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' }
      })
      vi.mocked(global.fetch).mockResolvedValueOnce(mockResponse)

      const params = new URLSearchParams({ genre: 'all' })
      await APIFallback.fetchWithFallback(params)

      expect(global.fetch).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          headers: expect.objectContaining({
            'Origin': ''
          })
        })
      )

      // windowを復元
      global.window = originalWindow
    })

    it('AbortSignalが渡された場合、リクエストに含める', async () => {
      const controller = new AbortController()
      const mockResponse = new Response(JSON.stringify({ items: [] }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' }
      })
      vi.mocked(global.fetch).mockResolvedValueOnce(mockResponse)

      const params = new URLSearchParams({ genre: 'game' })
      await APIFallback.fetchWithFallback(params, controller.signal)

      expect(global.fetch).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          signal: controller.signal
        })
      )
    })
  })

  describe('エラーハンドリング', () => {
    it('ネットワークエラーをそのまま伝播する', async () => {
      const networkError = new Error('Network error')
      vi.mocked(global.fetch).mockRejectedValueOnce(networkError)

      const params = new URLSearchParams({ genre: 'all' })
      await expect(APIFallback.fetchWithFallback(params)).rejects.toThrow('Network error')
    })

    it('HTTPエラーレスポンスをそのまま返す', async () => {
      const errorResponse = new Response('Not Found', {
        status: 404,
        headers: { 'Content-Type': 'text/plain' }
      })
      vi.mocked(global.fetch).mockResolvedValueOnce(errorResponse)

      const params = new URLSearchParams({ genre: 'invalid' })
      const response = await APIFallback.fetchWithFallback(params)

      expect(response.status).toBe(404)
      expect(await response.text()).toBe('Not Found')
    })
  })

  describe('キャッシュヘッダー', () => {
    it('Cloudflare Worker直接接続時はキャッシュヘッダーを送信しない', async () => {
      const mockResponse = new Response(JSON.stringify({ items: [] }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' }
      })
      vi.mocked(global.fetch).mockResolvedValueOnce(mockResponse)

      const params = new URLSearchParams({ genre: 'all' })
      await APIFallback.fetchWithFallback(params)

      expect(global.fetch).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          headers: expect.not.objectContaining({
            'Cache-Control': expect.any(String)
          })
        })
      )
    })
  })
})