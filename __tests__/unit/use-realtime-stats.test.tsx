import { renderHook, waitFor } from '@testing-library/react'
import { describe, test, expect, vi, beforeEach, afterEach } from 'vitest'
import { useRealtimeStats } from '@/hooks/use-realtime-stats'
import type { RankingItem } from '@/types/ranking'

// fetchのモック
global.fetch = vi.fn()

describe('useRealtimeStats', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  const mockItems: RankingItem[] = [
    {
      rank: 1,
      id: 'sm12345',
      title: 'テスト動画1',
      thumbURL: 'https://example.com/thumb1.jpg',
      views: 1000,
      comments: 50,
      mylists: 10,
      likes: 100
    },
    {
      rank: 2,
      id: 'sm67890',
      title: 'テスト動画2',
      thumbURL: 'https://example.com/thumb2.jpg',
      views: 2000,
      comments: 100,
      mylists: 20,
      likes: 200
    }
  ]

  test('初期状態では元のアイテムを返す', () => {
    const { result } = renderHook(() => 
      useRealtimeStats(mockItems, false)
    )

    expect(result.current.items).toEqual(mockItems)
    expect(result.current.isLoading).toBe(false)
    expect(result.current.hasRealtimeData).toBe(false)
  })

  test('有効化されると統計情報を取得する', async () => {
    const mockResponse = {
      stats: {
        sm12345: { viewCounter: 1500, commentCounter: 75 },
        sm67890: { viewCounter: 2500, commentCounter: 125 }
      },
      timestamp: '2025-01-01T00:00:00Z',
      count: 2
    }

    vi.mocked(fetch).mockResolvedValueOnce({
      ok: true,
      json: async () => mockResponse
    } as Response)

    const { result } = renderHook(() => 
      useRealtimeStats(mockItems, true, 60000)
    )

    // 初期状態
    expect(result.current.isLoading).toBe(true)

    // APIコールを待つ
    await waitFor(() => {
      expect(result.current.isLoading).toBe(false)
    }, { timeout: 3000 })

    // 更新された統計情報を確認
    expect(result.current.items[0]?.views).toBe(1500)
    expect(result.current.items[0]?.comments).toBe(75)
    expect(result.current.items[1]?.views).toBe(2500)
    expect(result.current.items[1]?.comments).toBe(125)
    expect(result.current.hasRealtimeData).toBe(true)
    expect(result.current.lastUpdated).toBe('2025-01-01T00:00:00Z')
  })

  test('定期的に更新される', async () => {
    vi.mocked(fetch).mockResolvedValue({
      ok: true,
      json: async () => ({ stats: {}, timestamp: new Date().toISOString(), count: 0 })
    } as Response)

    renderHook(() => 
      useRealtimeStats(mockItems, true, 1000) // 1秒間隔
    )

    // 初回呼び出し
    await waitFor(() => {
      expect(fetch).toHaveBeenCalledTimes(1)
    }, { timeout: 3000 })

    // 1秒後の更新
    vi.advanceTimersByTime(1000)
    await waitFor(() => {
      expect(fetch).toHaveBeenCalledTimes(2)
    }, { timeout: 3000 })

    // さらに1秒後
    vi.advanceTimersByTime(1000)
    await waitFor(() => {
      expect(fetch).toHaveBeenCalledTimes(3)
    }, { timeout: 3000 })
  })

  test('大量のアイテムをバッチ処理する', async () => {
    const manyItems = Array.from({ length: 25 }, (_, i) => ({
      rank: i + 1,
      id: `sm${i}`,
      title: `動画${i}`,
      thumbURL: '',
      views: i * 100
    }))

    vi.mocked(fetch).mockResolvedValue({
      ok: true,
      json: async () => ({ stats: {}, timestamp: new Date().toISOString(), count: 0 })
    } as Response)

    renderHook(() => 
      useRealtimeStats(manyItems, true)
    )

    await waitFor(() => {
      // 25個のアイテムが10個ずつのバッチで処理される（3回のAPIコール）
      expect(fetch).toHaveBeenCalledTimes(3)
    }, { timeout: 3000 })
  })

  test('エラーが発生しても継続する', async () => {
    vi.mocked(fetch)
      .mockRejectedValueOnce(new Error('Network error'))
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ stats: { sm12345: { viewCounter: 9999 } }, timestamp: new Date().toISOString(), count: 1 })
      } as Response)

    const { result } = renderHook(() => 
      useRealtimeStats(mockItems, true, 1000)
    )

    // エラー後も動作
    await waitFor(() => {
      expect(result.current.isLoading).toBe(false)
    }, { timeout: 3000 })

    // 1秒後に再試行
    vi.advanceTimersByTime(1000)
    
    await waitFor(() => {
      expect(result.current.items[0]?.views).toBe(9999)
    }, { timeout: 3000 })
  })
})