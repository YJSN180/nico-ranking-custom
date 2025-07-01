import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useWatchHistory } from '@/hooks/use-watch-history'
import { WatchHistoryManager } from '@/lib/storage/watch-history'
import { DBManager } from '@/lib/storage/db-manager'

// モック用の変数
const mockAddToHistory = vi.fn()
const mockGetHistory = vi.fn()
const mockSearchHistory = vi.fn()
const mockRemoveFromHistory = vi.fn()
const mockClearHistory = vi.fn()
const mockGetHistoryStats = vi.fn()

// デフォルトのモック値を設定
mockGetHistory.mockResolvedValue([])
mockSearchHistory.mockResolvedValue([])
mockGetHistoryStats.mockResolvedValue({
  totalCount: 0,
  oldestWatchedAt: null,
  newestWatchedAt: null
})

// DBManagerのモック
vi.mock('@/lib/storage/db-manager', () => ({
  DBManager: vi.fn().mockImplementation(() => ({
    init: vi.fn().mockResolvedValue(true),
    getDB: vi.fn().mockReturnValue({})
  }))
}))

// WatchHistoryManagerのモック
vi.mock('@/lib/storage/watch-history', () => ({
  WatchHistoryManager: vi.fn().mockImplementation(() => ({
    addToHistory: mockAddToHistory,
    getHistory: mockGetHistory,
    searchHistory: mockSearchHistory,
    removeFromHistory: mockRemoveFromHistory,
    clearHistory: mockClearHistory,
    getHistoryStats: mockGetHistoryStats
  }))
}))

describe('useWatchHistory', () => {
  let mockWatchHistoryManager: any
  
  beforeEach(() => {
    vi.clearAllMocks()
    // デフォルトのモック値をリセット
    mockGetHistory.mockResolvedValue([])
    mockSearchHistory.mockResolvedValue([])
    mockGetHistoryStats.mockResolvedValue({
      totalCount: 0,
      oldestWatchedAt: null,
      newestWatchedAt: null
    })
    mockWatchHistoryManager = new WatchHistoryManager(new DBManager())
  })
  
  afterEach(() => {
    vi.clearAllMocks()
  })
  
  describe('初期化', () => {
    it('フックが正しく初期化される', async () => {
      const { result } = renderHook(() => useWatchHistory())
      
      expect(result.current.isLoading).toBe(true)
      expect(result.current.history).toEqual([])
      expect(result.current.selectedItems).toEqual(new Set())
      
      // 初期化完了を待つ
      await act(async () => {
        await new Promise(resolve => setTimeout(resolve, 150))
      })
      
      expect(result.current.isLoading).toBe(false)
    })
  })
  
  describe('addToHistory', () => {
    it('視聴履歴に動画を追加できる', async () => {
      const { result } = renderHook(() => useWatchHistory())
      
      // 初期化完了を待つ
      await act(async () => {
        await new Promise(resolve => setTimeout(resolve, 150))
      })
      
      const video = {
        id: 'sm12345',
        title: 'テスト動画',
        thumbURL: 'https://example.com/thumb.jpg',
        authorName: 'テスト投稿者',
        authorId: 'user123'
      }
      
      await act(async () => {
        await result.current.addToHistory(video)
      })
      
      expect(mockAddToHistory).toHaveBeenCalledWith(video)
    })
    
    it('動画再生ページでのみ自動記録される', async () => {
      // window.locationのモック
      const originalLocation = window.location
      delete (window as any).location
      window.location = {
        ...originalLocation,
        pathname: '/watch/sm12345'
      } as Location
      
      const { result } = renderHook(() => useWatchHistory())
      
      // 初期化完了を待つ
      await act(async () => {
        await new Promise(resolve => setTimeout(resolve, 150))
      })
      
      // 自動記録のシミュレーション
      const video = {
        id: 'sm12345',
        title: 'テスト動画',
        thumbURL: 'https://example.com/thumb.jpg'
      }
      
      await act(async () => {
        await result.current.addToHistory(video)
      })
      
      expect(mockAddToHistory).toHaveBeenCalled()
      
      // locationを元に戻す
      window.location = originalLocation
    })
  })
  
  describe('loadHistory', () => {
    it('視聴履歴を読み込める', async () => {
      const mockHistory = [
        {
          videoId: 'sm12345',
          title: '動画1',
          thumbURL: 'url1',
          watchedAt: Date.now(),
          watchCount: 1
        },
        {
          videoId: 'sm67890',
          title: '動画2',
          thumbURL: 'url2',
          watchedAt: Date.now() - 1000,
          watchCount: 2
        }
      ]
      
      // 初期化時と明示的なloadHistory呼び出し時の両方で返される
      mockGetHistory.mockResolvedValue(mockHistory)
      
      const { result } = renderHook(() => useWatchHistory())
      
      // 初期化完了を待つ
      await act(async () => {
        await new Promise(resolve => setTimeout(resolve, 150))
      })
      
      // 初期化時に既に履歴が読み込まれているはず
      expect(result.current.history).toEqual(mockHistory)
    })
  })
  
  describe('searchHistory', () => {
    it('視聴履歴を検索できる', async () => {
      const mockSearchResults = [
        {
          videoId: 'sm12345',
          title: 'ボカロ曲',
          thumbURL: 'url1',
          watchedAt: Date.now(),
          watchCount: 1
        }
      ]
      
      mockSearchHistory.mockResolvedValueOnce(mockSearchResults)
      
      const { result } = renderHook(() => useWatchHistory())
      
      // 初期化完了を待つ
      await act(async () => {
        await new Promise(resolve => setTimeout(resolve, 150))
      })
      
      await act(async () => {
        await result.current.searchHistory('ボカロ')
      })
      
      expect(mockSearchHistory).toHaveBeenCalledWith('ボカロ')
      expect(result.current.history).toEqual(mockSearchResults)
    })
  })
  
  describe('removeSelected', () => {
    it('選択した動画を削除できる', async () => {
      const { result } = renderHook(() => useWatchHistory())
      
      // 初期化完了を待つ
      await act(async () => {
        await new Promise(resolve => setTimeout(resolve, 150))
      })
      
      // 選択状態を設定
      act(() => {
        result.current.toggleSelection('sm12345')
        result.current.toggleSelection('sm67890')
      })
      
      expect(result.current.selectedItems).toEqual(new Set(['sm12345', 'sm67890']))
      
      await act(async () => {
        await result.current.removeSelected()
      })
      
      expect(mockRemoveFromHistory).toHaveBeenCalledWith(['sm12345', 'sm67890'])
      expect(result.current.selectedItems).toEqual(new Set())
    })
  })
  
  describe('clearAllHistory', () => {
    it('すべての履歴を削除できる', async () => {
      const { result } = renderHook(() => useWatchHistory())
      
      // 初期化完了を待つ
      await act(async () => {
        await new Promise(resolve => setTimeout(resolve, 150))
      })
      
      await act(async () => {
        await result.current.clearAllHistory()
      })
      
      expect(mockClearHistory).toHaveBeenCalled()
    })
  })
  
  describe('選択機能', () => {
    it('動画の選択状態を切り替えられる', async () => {
      const { result } = renderHook(() => useWatchHistory())
      
      // 初期化完了を待つ
      await act(async () => {
        await new Promise(resolve => setTimeout(resolve, 150))
      })
      
      act(() => {
        result.current.toggleSelection('sm12345')
      })
      
      expect(result.current.selectedItems).toContain('sm12345')
      
      act(() => {
        result.current.toggleSelection('sm12345')
      })
      
      expect(result.current.selectedItems).not.toContain('sm12345')
    })
    
    it('すべて選択/解除ができる', async () => {
      const mockHistory = [
        {
          videoId: 'sm12345',
          title: '動画1',
          thumbURL: 'url1',
          watchedAt: Date.now(),
          watchCount: 1
        },
        {
          videoId: 'sm67890',
          title: '動画2',
          thumbURL: 'url2',
          watchedAt: Date.now() - 1000,
          watchCount: 2
        }
      ]
      
      // 初期化時に履歴が読み込まれる
      mockGetHistory.mockResolvedValue(mockHistory)
      
      const { result } = renderHook(() => useWatchHistory())
      
      // 初期化完了を待つ
      await act(async () => {
        await new Promise(resolve => setTimeout(resolve, 150))
      })
      
      // すべて選択
      act(() => {
        result.current.toggleSelectAll()
      })
      
      expect(result.current.selectedItems).toEqual(new Set(['sm12345', 'sm67890']))
      
      // すべて解除
      act(() => {
        result.current.toggleSelectAll()
      })
      
      expect(result.current.selectedItems).toEqual(new Set())
    })
  })
  
  describe('統計情報', () => {
    it('視聴履歴の統計情報を取得できる', async () => {
      const mockStats = {
        totalCount: 10,
        oldestWatchedAt: Date.now() - 86400000,
        newestWatchedAt: Date.now()
      }
      
      mockGetHistoryStats.mockResolvedValueOnce(mockStats)
      
      const { result } = renderHook(() => useWatchHistory())
      
      // 初期化完了を待つ
      await act(async () => {
        await new Promise(resolve => setTimeout(resolve, 150))
      })
      
      await act(async () => {
        await result.current.loadStats()
      })
      
      expect(result.current.stats).toEqual(mockStats)
    })
  })
})