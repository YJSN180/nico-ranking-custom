import { describe, test, expect, vi, beforeEach } from 'vitest'
import { GET } from '@/app/api/edge/video-stats/route'
import { NextRequest } from 'next/server'
import * as snapshotApi from '@/lib/snapshot-api'
import * as videoStatsKv from '@/lib/video-stats-kv'

// モジュールのモック
vi.mock('@/lib/snapshot-api', () => ({
  fetchVideoStats: vi.fn()
}))

vi.mock('@/lib/video-stats-kv', () => ({
  getVideoStatsFromKV: vi.fn()
}))

describe('/api/edge/video-stats', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  test('動画IDリストから統計情報を取得できる', async () => {
    const mockStats = {
      sm12345: { viewCounter: 1000, commentCounter: 50 },
      sm67890: { viewCounter: 2000, commentCounter: 100 }
    }

    vi.mocked(videoStatsKv.getVideoStatsFromKV).mockResolvedValueOnce({})
    vi.mocked(snapshotApi.fetchVideoStats).mockResolvedValueOnce(mockStats)

    const request = new NextRequest('http://localhost/api/edge/video-stats?ids=sm12345,sm67890')
    const response = await GET(request)
    const data = await response.json()

    expect(response.status).toBe(200)
    expect(data.stats).toEqual(mockStats)
    expect(data.count).toBe(2)
    expect(data.timestamp).toBeDefined()
    expect(snapshotApi.fetchVideoStats).toHaveBeenCalledWith(['sm12345', 'sm67890'])
  })

  test('動画IDが指定されていない場合は400エラー', async () => {
    const request = new NextRequest('http://localhost/api/edge/video-stats')
    const response = await GET(request)
    const data = await response.json()

    expect(response.status).toBe(400)
    expect(data.error).toBe('No video IDs provided')
  })

  test('動画IDが多すぎる場合は400エラー', async () => {
    const ids = Array.from({ length: 501 }, (_, i) => `sm${i}`).join(',')
    const request = new NextRequest(`http://localhost/api/edge/video-stats?ids=${ids}`)
    const response = await GET(request)
    const data = await response.json()

    expect(response.status).toBe(400)
    expect(data.error).toBe('Too many video IDs (max 500)')
  })

  test('空のIDは除外される', async () => {
    vi.mocked(videoStatsKv.getVideoStatsFromKV).mockResolvedValueOnce({})
    vi.mocked(snapshotApi.fetchVideoStats).mockResolvedValueOnce({})

    const request = new NextRequest('http://localhost/api/edge/video-stats?ids=sm12345,,sm67890,')
    const response = await GET(request)

    expect(response.status).toBe(200)
    expect(snapshotApi.fetchVideoStats).toHaveBeenCalledWith(['sm12345', 'sm67890'])
  })

  test('キャッシュヘッダーが正しく設定される', async () => {
    vi.mocked(videoStatsKv.getVideoStatsFromKV).mockResolvedValueOnce({})
    vi.mocked(snapshotApi.fetchVideoStats).mockResolvedValueOnce({})

    const request = new NextRequest('http://localhost/api/edge/video-stats?ids=sm12345')
    const response = await GET(request)

    // Now uses 3-minute cache with KV integration
    expect(response.headers.get('Cache-Control')).toBe('public, s-maxage=180, max-age=60, stale-while-revalidate=120')
  })

  test('APIエラー時は500エラー', async () => {
    vi.mocked(videoStatsKv.getVideoStatsFromKV).mockResolvedValueOnce({})
    vi.mocked(snapshotApi.fetchVideoStats).mockRejectedValueOnce(new Error('API Error'))

    const request = new NextRequest('http://localhost/api/edge/video-stats?ids=sm12345')
    const response = await GET(request)
    const data = await response.json()

    expect(response.status).toBe(500)
    expect(data.error).toBe('Failed to fetch video stats')
  })
})