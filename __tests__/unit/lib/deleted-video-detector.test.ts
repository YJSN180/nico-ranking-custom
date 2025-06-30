import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { detectDeletedVideos, checkVideoAvailability, clearAvailabilityCache } from '@/lib/deleted-video-detector'
import type { MylistVideo } from '@/lib/storage/types'

// fetchのモック
const originalFetch = global.fetch
beforeEach(() => {
  global.fetch = vi.fn()
})

afterEach(() => {
  global.fetch = originalFetch
})

describe('detectDeletedVideos', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    clearAvailabilityCache() // キャッシュをクリア
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  describe('単一動画の削除確認', () => {
    it('存在する動画はavailable: trueを返す', async () => {
      const mockFetch = vi.mocked(fetch)
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
      } as Response)

      const result = await checkVideoAvailability('sm12345')
      
      expect(result).toEqual({
        videoId: 'sm12345',
        available: true,
      })
      expect(mockFetch).toHaveBeenCalledWith(
        'https://www.nicovideo.jp/watch/sm12345',
        expect.objectContaining({
          method: 'HEAD',
          signal: expect.any(AbortSignal),
        })
      )
    })

    it('削除された動画（404）はavailable: falseを返す', async () => {
      const mockFetch = vi.mocked(fetch)
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 404,
      } as Response)

      const result = await checkVideoAvailability('sm99999')
      
      expect(result).toEqual({
        videoId: 'sm99999',
        available: false,
      })
    })

    it('非公開動画（403）もavailable: falseを返す', async () => {
      const mockFetch = vi.mocked(fetch)
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 403,
      } as Response)

      const result = await checkVideoAvailability('sm88888')
      
      expect(result).toEqual({
        videoId: 'sm88888',
        available: false,
      })
    })

    it('ネットワークエラーの場合はavailable: falseを返す', async () => {
      const mockFetch = vi.mocked(fetch)
      mockFetch.mockRejectedValueOnce(new Error('Network error'))

      const result = await checkVideoAvailability('sm77777')
      
      expect(result).toEqual({
        videoId: 'sm77777',
        available: false,
      })
    })

    it('タイムアウト（5秒）でavailable: falseを返す', async () => {
      const mockFetch = vi.mocked(fetch)
      // AbortErrorをシミュレート
      mockFetch.mockImplementationOnce(() => 
        new Promise((_, reject) => {
          setTimeout(() => reject(new DOMException('The operation was aborted', 'AbortError')), 100)
        })
      )

      const result = await checkVideoAvailability('sm66666')
      
      expect(result).toEqual({
        videoId: 'sm66666',
        available: false,
      })
    })
  })

  describe('複数動画の削除確認', () => {
    it('複数の動画の削除状態を一括確認できる', async () => {
      const videos: MylistVideo[] = [
        {
          id: 'sm12345',
          mylistId: 'mylist1',
          title: '動画1',
          thumbURL: 'https://example.com/thumb1.jpg',
          addedAt: Date.now(),
        },
        {
          id: 'sm99999',
          mylistId: 'mylist1', 
          title: '動画2',
          thumbURL: 'https://example.com/thumb2.jpg',
          addedAt: Date.now(),
        },
        {
          id: 'sm88888',
          mylistId: 'mylist1',
          title: '動画3',
          thumbURL: 'https://example.com/thumb3.jpg',
          addedAt: Date.now(),
        },
      ]

      const mockFetch = vi.mocked(fetch)
      // 1つ目の動画: 存在する
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
      } as Response)
      // 2つ目の動画: 削除済み
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 404,
      } as Response)
      // 3つ目の動画: 非公開
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 403,
      } as Response)

      const results = await detectDeletedVideos(videos)
      
      expect(results).toEqual({
        'sm12345': true,
        'sm99999': false,
        'sm88888': false,
      })
    })

    it('空の配列を渡した場合は空のオブジェクトを返す', async () => {
      const results = await detectDeletedVideos([])
      
      expect(results).toEqual({})
      expect(fetch).not.toHaveBeenCalled()
    })

    it('並列で処理されることを確認（バッチ処理）', async () => {
      const videos: MylistVideo[] = Array.from({ length: 20 }, (_, i) => ({
        id: `sm${i}`,
        mylistId: 'mylist1',
        title: `動画${i}`,
        thumbURL: `https://example.com/thumb${i}.jpg`,
        addedAt: Date.now(),
      }))

      const mockFetch = vi.mocked(fetch)
      mockFetch.mockResolvedValue({
        ok: true,
        status: 200,
      } as Response)

      const startTime = Date.now()
      await detectDeletedVideos(videos)
      const endTime = Date.now()

      // 20個の動画を5個ずつバッチ処理（4バッチ）
      // 各バッチは並列処理されるため、全体の処理時間は短い
      expect(endTime - startTime).toBeLessThan(1000) // 1秒以内
      expect(mockFetch).toHaveBeenCalledTimes(20)
    })
  })

  describe('キャッシュ機能', () => {
    it('一度確認した動画はキャッシュから返される', async () => {
      const mockFetch = vi.mocked(fetch)
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
      } as Response)

      // 1回目の確認
      const result1 = await checkVideoAvailability('sm12345', { useCache: true })
      expect(result1.available).toBe(true)
      expect(mockFetch).toHaveBeenCalledTimes(1)

      // 2回目の確認（キャッシュから）
      const result2 = await checkVideoAvailability('sm12345', { useCache: true })
      expect(result2.available).toBe(true)
      expect(mockFetch).toHaveBeenCalledTimes(1) // fetchは呼ばれない
    })

    it('キャッシュを無効化できる', async () => {
      const mockFetch = vi.mocked(fetch)
      mockFetch.mockResolvedValue({
        ok: true,
        status: 200,
      } as Response)

      // キャッシュ無効で2回確認
      await checkVideoAvailability('sm12345', { useCache: false })
      await checkVideoAvailability('sm12345', { useCache: false })

      expect(mockFetch).toHaveBeenCalledTimes(2)
    })
  })
})