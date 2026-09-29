import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { NextRequest } from 'next/server'

// Mock the dependencies
vi.mock('@/lib/popular-tags', () => ({
  getPopularTags: vi.fn()
}))

vi.mock('@/lib/cache-durations', () => ({
  getCacheHeaders: vi.fn().mockReturnValue('public, s-maxage=300')
}))

import { getPopularTags } from '@/lib/popular-tags'
import { GET } from '@/app/api/popular-tags/route'

describe('Popular Tags API', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  describe('GET /api/popular-tags', () => {
    it('should return popular tags with default parameters', async () => {
      const mockTags = ['VOCALOID', 'ゲーム', '実況プレイ動画', 'アニメ', '音楽']
      ;(getPopularTags as ReturnType<typeof vi.fn>).mockResolvedValue(mockTags)

      const request = new NextRequest('http://localhost/api/popular-tags')
      const response = await GET(request)
      const data = await response.json()

      expect(response.status).toBe(200)
      expect(data.tags).toEqual(mockTags)
      expect(getPopularTags).toHaveBeenCalledWith('all', '24h')
    })

    it('should accept genre parameter', async () => {
      const mockTags = ['VOCALOID', '初音ミク', 'ボカロ']
      ;(getPopularTags as ReturnType<typeof vi.fn>).mockResolvedValue(mockTags)

      const request = new NextRequest('http://localhost/api/popular-tags?genre=vocaloid')
      const response = await GET(request)
      const data = await response.json()

      expect(response.status).toBe(200)
      expect(data.tags).toEqual(mockTags)
      expect(getPopularTags).toHaveBeenCalledWith('vocaloid', '24h')
    })

    it('should accept period parameter', async () => {
      const mockTags = ['ゲーム', 'RTA', 'speedrun']
      ;(getPopularTags as ReturnType<typeof vi.fn>).mockResolvedValue(mockTags)

      const request = new NextRequest('http://localhost/api/popular-tags?period=hour')
      const response = await GET(request)
      const data = await response.json()

      expect(response.status).toBe(200)
      expect(data.tags).toEqual(mockTags)
      expect(getPopularTags).toHaveBeenCalledWith('all', 'hour')
    })

    // 人気タグがあるのはパイプラインが集める 23 ジャンルと 24h/hour だけ。
    // それ以外は上流（KV・ゲートウェイ）に問い合わせず、失敗時と同じ形（200 の空配列）で返す
    it.each([
      ['period', 'genre=game&period=total'],
      ['genre', 'genre=zzz'],
      ['genre（パス）', 'genre=..%2F..%2Fv1%2Fusers%2Fme'],
      ['genre（プロトタイプのキー）', 'genre=__proto__'],
      ['genre（カスタムランキング）', 'genre=custom'],
    ])('does not query upstream for an unsupported %s', async (_label, query) => {
      ;(getPopularTags as ReturnType<typeof vi.fn>).mockResolvedValue(['上流のタグ'])

      const response = await GET(new NextRequest(`http://localhost/api/popular-tags?${query}`))

      expect(response.status).toBe(200)
      expect(await response.json()).toEqual({ tags: [] })
      expect(getPopularTags).not.toHaveBeenCalled()
    })

    it('should accept both genre and period parameters', async () => {
      const mockTags = ['マインクラフト', 'Minecraft', '建築']
      ;(getPopularTags as ReturnType<typeof vi.fn>).mockResolvedValue(mockTags)

      const request = new NextRequest('http://localhost/api/popular-tags?genre=game&period=hour')
      const response = await GET(request)
      const data = await response.json()

      expect(response.status).toBe(200)
      expect(data.tags).toEqual(mockTags)
      expect(getPopularTags).toHaveBeenCalledWith('game', 'hour')
    })

    it('should return empty array and 200 on error', async () => {
      ;(getPopularTags as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('KV connection failed'))

      const request = new NextRequest('http://localhost/api/popular-tags')
      const response = await GET(request)
      const data = await response.json()

      // API returns 200 with empty tags on error (graceful degradation)
      expect(response.status).toBe(200)
      expect(data.tags).toEqual([])
    })

    it('should return empty array when no tags found', async () => {
      ;(getPopularTags as ReturnType<typeof vi.fn>).mockResolvedValue([])

      const request = new NextRequest('http://localhost/api/popular-tags?genre=other')
      const response = await GET(request)
      const data = await response.json()

      expect(response.status).toBe(200)
      expect(data.tags).toEqual([])
    })

    it('should return 200 status code consistently', async () => {
      // This test verifies the API consistently returns 200
      // even when underlying data source has issues (graceful degradation)
      const mockTags = ['test']
      ;(getPopularTags as ReturnType<typeof vi.fn>).mockResolvedValue(mockTags)

      const request = new NextRequest('http://localhost/api/popular-tags')
      const response = await GET(request)

      expect(response.status).toBe(200)
      expect(response.headers.has('Cache-Control')).toBe(true)
    })
  })
})
