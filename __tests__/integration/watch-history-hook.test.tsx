import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { renderHook, act, waitFor } from '@testing-library/react'
import { useWatchHistory } from '@/hooks/use-watch-history'

describe('useWatchHistoryフックのインテグレーションテスト', () => {
  beforeEach(async () => {
    // IndexedDBをクリア
    await new Promise((resolve) => {
      const deleteReq = indexedDB.deleteDatabase('NicoRankingDB')
      deleteReq.onsuccess = () => resolve(undefined)
      deleteReq.onblocked = () => {
        console.warn('Database deletion blocked')
        resolve(undefined)
      }
    })
  })

  afterEach(async () => {
    // クリーンアップ
    await new Promise((resolve) => {
      const deleteReq = indexedDB.deleteDatabase('NicoRankingDB')
      deleteReq.onsuccess = () => resolve(undefined)
      deleteReq.onblocked = () => {
        console.warn('Database deletion blocked')
        resolve(undefined)
      }
    })
  })

  it('初期状態では履歴が空であること', async () => {
    const { result } = renderHook(() => useWatchHistory())

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false)
    })

    expect(result.current.history).toEqual([])
  })

  it('動画を追加すると履歴に表示されること', async () => {
    const { result } = renderHook(() => useWatchHistory())

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false)
    })

    const video = {
      id: 'sm12345',
      title: 'テスト動画',
      thumbURL: 'https://example.com/thumb.jpg',
      views: 1000,
      comments: 50,
      mylists: 10,
      likes: 100,
      authorName: 'テスト投稿者',
      authorId: 'user123',
      registeredAt: '2024-01-01T00:00:00Z'
    }

    await act(async () => {
      await result.current.addToHistory(video)
    })

    await waitFor(() => {
      expect(result.current.history).toHaveLength(1)
      expect(result.current.history[0].videoId).toBe('sm12345')
      expect(result.current.history[0].title).toBe('テスト動画')
      expect(result.current.history[0].watchCount).toBe(1)
    })
  })

  it('同じ動画を複数回追加するとwatchCountが増加すること', async () => {
    const { result } = renderHook(() => useWatchHistory())

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false)
    })

    const video = {
      id: 'sm12345',
      title: 'テスト動画',
      thumbURL: 'https://example.com/thumb.jpg'
    }

    // 1回目の追加
    await act(async () => {
      await result.current.addToHistory(video)
    })

    await waitFor(() => {
      expect(result.current.history[0]?.watchCount).toBe(1)
    })

    // 2回目の追加
    await act(async () => {
      await result.current.addToHistory(video)
    })

    await waitFor(() => {
      expect(result.current.history[0]?.watchCount).toBe(2)
    })

    // 3回目の追加
    await act(async () => {
      await result.current.addToHistory(video)
    })

    await waitFor(() => {
      expect(result.current.history).toHaveLength(1)
      expect(result.current.history[0].watchCount).toBe(3)
    })
  })
})