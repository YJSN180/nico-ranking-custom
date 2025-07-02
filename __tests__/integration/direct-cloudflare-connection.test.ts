import { describe, it, expect, vi, beforeEach } from 'vitest'
import { APIFallback } from '@/lib/api-fallback'

describe('Direct Cloudflare Connection Integration', () => {
  beforeEach(() => {
    // fetchをモック
    global.fetch = vi.fn()
  })

  it('クライアントサイドからCloudflare Workerに直接接続する', async () => {
    // window.locationをモック
    Object.defineProperty(window, 'location', {
      value: { 
        origin: 'https://nico-ranking-custom.vercel.app',
        hostname: 'nico-ranking-custom.vercel.app'
      },
      writable: true
    })

    const mockResponse = new Response(
      JSON.stringify({
        items: [
          { id: '1', title: 'Test Video 1', rank: 1 },
          { id: '2', title: 'Test Video 2', rank: 2 }
        ],
        popularTags: ['tag1', 'tag2']
      }),
      {
        status: 200,
        headers: { 
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*'
        }
      }
    )
    vi.mocked(global.fetch).mockResolvedValueOnce(mockResponse)

    const params = new URLSearchParams({ genre: 'all', period: '24h' })
    const response = await APIFallback.fetchWithFallback(params)
    const data = await response.json()

    // Cloudflare Workerのエンドポイントに直接アクセスしていることを確認
    expect(global.fetch).toHaveBeenCalledWith(
      'https://nico-rank.com/api/ranking?genre=all&period=24h',
      expect.objectContaining({
        headers: expect.objectContaining({
          'Accept': 'application/json',
          'Accept-Encoding': 'gzip, deflate, br',
          'Origin': 'https://nico-ranking-custom.vercel.app'
        })
      })
    )

    // レスポンスデータが正しいことを確認
    expect(data.items).toHaveLength(2)
    expect(data.items[0].title).toBe('Test Video 1')
    expect(data.popularTags).toEqual(['tag1', 'tag2'])
  })

  it('Vercel Functionを経由しないことを確認', async () => {
    // window.locationをモック
    Object.defineProperty(window, 'location', {
      value: { 
        origin: 'https://nico-ranking-custom.vercel.app',
        hostname: 'nico-ranking-custom.vercel.app'
      },
      writable: true
    })

    const mockResponse = new Response(JSON.stringify({ items: [] }), { status: 200 })
    vi.mocked(global.fetch).mockResolvedValueOnce(mockResponse)

    const params = new URLSearchParams({ genre: 'game' })
    await APIFallback.fetchWithFallback(params)

    const callArgs = vi.mocked(global.fetch).mock.calls[0]
    const calledUrl = callArgs[0] as string

    // Vercel.appドメインを呼んでいないことを確認
    expect(calledUrl).not.toContain('vercel.app')
    expect(calledUrl).not.toContain('localhost')
    
    // Cloudflare Workerのエンドポイントを呼んでいることを確認
    expect(calledUrl).toBe('https://nico-rank.com/api/ranking?genre=game')
  })

  it('APIFallbackのステータスは常にEdge機能を無効として返す', () => {
    const status = APIFallback.getStatus()
    
    expect(status.usingEdge).toBe(false)
    expect(status.failureCount).toBe(0)
    expect(status.lastFailureTime).toBe(0)
  })
})