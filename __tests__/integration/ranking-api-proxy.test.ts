import { describe, it, expect, vi, beforeEach } from 'vitest'
import { GET } from '@/app/api/ranking/route'
import { kv } from '@vercel/kv'

vi.mock('@vercel/kv')
vi.mock('@/lib/fetch-rss')
vi.mock('@/lib/nico-api')

describe('Ranking API with Proxy', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    process.env.CLOUDFLARE_PROXY_URL = 'https://test-proxy.workers.dev'
  })

  it('should fetch data via proxy when cache miss', async () => {
    const mockKv = vi.mocked(kv)
    mockKv.get.mockResolvedValue(null) // キャッシュなし
    mockKv.set.mockResolvedValue('OK')

    const { fetchNicoRanking } = await import('@/lib/fetch-rss')
    const mockFetchNicoRanking = vi.mocked(fetchNicoRanking)
    mockFetchNicoRanking.mockResolvedValue([
      {
        rank: 1,
        id: 'sm123456',
        title: 'Test Video',
        thumbURL: 'https://test.jpg',
        views: 1000
      }
    ])

    const { fetchVideoInfoBatch } = await import('@/lib/nico-api')
    const mockFetchVideoInfoBatch = vi.mocked(fetchVideoInfoBatch)
    mockFetchVideoInfoBatch.mockResolvedValue(new Map())

    const request = new Request('http://localhost:3000/api/ranking?period=hour&genre=game')
    const response = await GET(request)
    const data = await response.json()

    expect(mockFetchNicoRanking).toHaveBeenCalledWith('hour', 'game', undefined)
    expect(data).toHaveLength(1)
    expect(data[0].title).toBe('Test Video')
  })

  it('should handle tag ranking requests', async () => {
    const mockKv = vi.mocked(kv)
    mockKv.get.mockResolvedValue(null)
    mockKv.set.mockResolvedValue('OK')

    const { fetchNicoRanking } = await import('@/lib/fetch-rss')
    const mockFetchNicoRanking = vi.mocked(fetchNicoRanking)
    mockFetchNicoRanking.mockResolvedValue([
      {
        rank: 1,
        id: 'sm789012',
        title: 'VOCALOID Video',
        thumbURL: 'https://test2.jpg',
        views: 5000
      }
    ])

    const request = new Request('http://localhost:3000/api/ranking?period=24h&genre=music_sound&tag=VOCALOID')
    const response = await GET(request)
    const data = await response.json()

    expect(mockFetchNicoRanking).toHaveBeenCalledWith('24h', 'music_sound', 'VOCALOID')
    expect(data[0].title).toBe('VOCALOID Video')
  })

  it('should return mock data on error', async () => {
    const mockKv = vi.mocked(kv)
    mockKv.get.mockResolvedValue(null)

    const { fetchNicoRanking } = await import('@/lib/fetch-rss')
    const mockFetchNicoRanking = vi.mocked(fetchNicoRanking)
    mockFetchNicoRanking.mockRejectedValue(new Error('Proxy error'))

    const request = new Request('http://localhost:3000/api/ranking')
    const response = await GET(request)
    const data = await response.json()

    expect(response.headers.get('X-Data-Source')).toBe('mock')
    expect(response.headers.get('X-Error')).toBe('Proxy error')
    expect(data.length).toBeGreaterThan(0) // モックデータが返される
  })
})