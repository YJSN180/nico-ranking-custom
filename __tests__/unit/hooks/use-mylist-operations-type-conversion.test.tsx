import { renderHook, waitFor } from '@testing-library/react'
import { vi, describe, it, expect, beforeEach, beforeAll, afterEach } from 'vitest'
import { useMylistOperations } from '@/hooks/use-mylist-operations'
import { MylistManager } from '@/lib/storage/mylists'
import { DBManager } from '@/lib/storage/db-manager'
import type { MylistVideo } from '@/lib/storage/types'

// Mock IndexedDB
import 'fake-indexeddb/auto'

// Mock modules
vi.mock('@/lib/storage/db-manager')
vi.mock('@/lib/storage/mylists')

const MockedDBManager = DBManager as unknown as ReturnType<typeof vi.fn>
const MockedMylistManager = MylistManager as unknown as ReturnType<typeof vi.fn>

/**
 * use-mylist-operations Hook 型変換修正テスト
 * 
 * このテストは以下の修正が正しく動作することを検証します：
 * 1. addVideoToMylist の引数型が Video → Partial<MylistVideo> に変更
 * 2. MylistVideo 型の完全なサポート
 * 3. 型安全なデータ変換の動作
 * 
 * 修正前の問題：
 * - Video型とMylistVideo型の型不一致
 * - 型変換時のデータ消失
 */
describe('use-mylist-operations - Type Conversion Fix', () => {
  let mockDbManager: any
  let mockMylistManager: any

  const mockMylist = {
    id: 'test-mylist-id',
    name: 'Test Mylist',
    description: 'Test Description',
    videoCount: 0,
    createdAt: Date.now(),
    updatedAt: Date.now()
  }

  const mockMylistVideoData: Partial<MylistVideo> = {
    id: 'sm12345',
    title: 'Test Video',
    thumbURL: 'https://example.com/thumb.jpg',
    views: 1500,
    comments: 75,
    mylists: 25,
    likes: 200,
    authorName: 'Test Author',
    authorId: '123456',
    authorIcon: 'https://example.com/author-icon.jpg',
    registeredAt: '2024-01-01T00:00:00Z'
  }

  beforeAll(() => {
    // テスト環境フラグを設定
    Object.defineProperty(window, '__TEST_ENV__', {
      value: false, // 実際のDBロジックをテストするためfalse
      writable: true
    })
  })

  beforeEach(() => {
    vi.clearAllMocks()

    // DBManager mock
    mockDbManager = {
      init: vi.fn().mockResolvedValue(undefined),
      getDB: vi.fn().mockReturnValue({})
    }
    MockedDBManager.mockImplementation(() => mockDbManager)

    // MylistManager mock
    mockMylistManager = {
      getOrCreateDefaultMylist: vi.fn().mockResolvedValue(mockMylist),
      getAllMylists: vi.fn().mockResolvedValue([mockMylist]),
      addVideoToMylist: vi.fn().mockResolvedValue(undefined),
      removeVideoFromMylist: vi.fn().mockResolvedValue(undefined),
      getVideosInMylist: vi.fn().mockResolvedValue([]),
      isVideoInAnyMylist: vi.fn().mockResolvedValue({ inMylist: false, mylistIds: [] })
    }
    MockedMylistManager.mockImplementation(() => mockMylistManager)
  })

  afterEach(() => {
    vi.resetAllMocks()
  })

  describe('addVideoToMylist 型修正テスト', () => {
    it('Partial<MylistVideo>型のデータを正しく受け入れる', async () => {
      const { result } = renderHook(() => useMylistOperations())

      // フックの初期化を待つ
      await waitFor(() => {
        expect(result.current.isLoading).toBe(false)
      })

      // addVideoToMylistを呼び出し
      const success = await result.current.addVideoToMylist('test-mylist-id', mockMylistVideoData)

      expect(success).toBe(true)
      expect(mockMylistManager.addVideoToMylist).toHaveBeenCalledWith(
        'test-mylist-id',
        mockMylistVideoData
      )
    })

    it('authorIconフィールドを含むデータを正しく処理する', async () => {
      const { result } = renderHook(() => useMylistOperations())

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false)
      })

      const videoDataWithIcon: Partial<MylistVideo> = {
        ...mockMylistVideoData,
        authorIcon: 'https://example.com/special-icon.jpg'
      }

      await result.current.addVideoToMylist('test-mylist-id', videoDataWithIcon)

      expect(mockMylistManager.addVideoToMylist).toHaveBeenCalledWith(
        'test-mylist-id',
        expect.objectContaining({
          authorIcon: 'https://example.com/special-icon.jpg'
        })
      )
    })

    it('authorIconがundefinedの場合も正しく処理する', async () => {
      const { result } = renderHook(() => useMylistOperations())

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false)
      })

      const videoDataWithoutIcon: Partial<MylistVideo> = {
        ...mockMylistVideoData,
        authorIcon: undefined
      }

      await result.current.addVideoToMylist('test-mylist-id', videoDataWithoutIcon)

      expect(mockMylistManager.addVideoToMylist).toHaveBeenCalledWith(
        'test-mylist-id',
        expect.objectContaining({
          authorIcon: undefined
        })
      )
    })

    it('統計情報フィールドを正しく処理する', async () => {
      const { result } = renderHook(() => useMylistOperations())

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false)
      })

      const videoDataWithStats: Partial<MylistVideo> = {
        id: 'sm67890',
        title: 'Stats Test Video',
        thumbURL: 'https://example.com/thumb2.jpg',
        views: 5000,
        comments: 250,
        mylists: 100,
        likes: 800
      }

      await result.current.addVideoToMylist('test-mylist-id', videoDataWithStats)

      expect(mockMylistManager.addVideoToMylist).toHaveBeenCalledWith(
        'test-mylist-id',
        expect.objectContaining({
          views: 5000,
          comments: 250,
          mylists: 100,
          likes: 800
        })
      )
    })

    it('部分的なMylistVideoデータ（Partial）を正しく処理する', async () => {
      const { result } = renderHook(() => useMylistOperations())

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false)
      })

      // 必須フィールドのみのデータ
      const minimalVideoData: Partial<MylistVideo> = {
        id: 'sm99999',
        title: 'Minimal Video',
        thumbURL: 'https://example.com/minimal.jpg'
        // 他のフィールドは省略
      }

      await result.current.addVideoToMylist('test-mylist-id', minimalVideoData)

      expect(mockMylistManager.addVideoToMylist).toHaveBeenCalledWith(
        'test-mylist-id',
        minimalVideoData
      )
    })
  })

  describe('エラーハンドリング', () => {
    it('MylistManagerでエラーが発生した場合、falseを返す', async () => {
      const { result } = renderHook(() => useMylistOperations())

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false)
      })

      // MylistManagerでエラーを発生させる
      mockMylistManager.addVideoToMylist.mockRejectedValue(new Error('Database error'))

      const success = await result.current.addVideoToMylist('test-mylist-id', mockMylistVideoData)

      expect(success).toBe(false)
      expect(mockMylistManager.addVideoToMylist).toHaveBeenCalledWith(
        'test-mylist-id',
        mockMylistVideoData
      )
    })

    it('MylistManagerが初期化されていない場合、falseを返す', async () => {
      // MylistManagerの初期化に失敗させる
      mockDbManager.init.mockRejectedValue(new Error('DB initialization failed'))

      const { result } = renderHook(() => useMylistOperations())

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false)
      })

      const success = await result.current.addVideoToMylist('test-mylist-id', mockMylistVideoData)

      expect(success).toBe(false)
    })
  })

  describe('型安全性テスト', () => {
    it('正しい型のデータのみを受け入れる', async () => {
      const { result } = renderHook(() => useMylistOperations())

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false)
      })

      // TypeScriptレベルでの型チェックは実行時には検証できないが、
      // 実際に呼び出される引数が期待する型であることを確認
      await result.current.addVideoToMylist('test-mylist-id', mockMylistVideoData)

      const calledArgs = mockMylistManager.addVideoToMylist.mock.calls[0]
      const [mylistId, videoData] = calledArgs

      // 型構造の検証
      expect(typeof mylistId).toBe('string')
      expect(typeof videoData).toBe('object')
      expect(videoData).not.toBeNull()

      // MylistVideo型の必須フィールド
      if (videoData.id) expect(typeof videoData.id).toBe('string')
      if (videoData.title) expect(typeof videoData.title).toBe('string')
      if (videoData.thumbURL) expect(typeof videoData.thumbURL).toBe('string')
      
      // 統計情報フィールド
      if (videoData.views !== undefined) expect(typeof videoData.views).toBe('number')
      if (videoData.comments !== undefined) expect(typeof videoData.comments).toBe('number')
      if (videoData.mylists !== undefined) expect(typeof videoData.mylists).toBe('number')
      if (videoData.likes !== undefined) expect(typeof videoData.likes).toBe('number')
      
      // 投稿者情報フィールド
      if (videoData.authorName !== undefined) expect(typeof videoData.authorName).toBe('string')
      if (videoData.authorId !== undefined) expect(typeof videoData.authorId).toBe('string')
      if (videoData.authorIcon !== undefined) expect(typeof videoData.authorIcon).toBe('string')
    })
  })

  describe('データ整合性テスト', () => {
    it('完全なMylistVideoデータが保持される', async () => {
      const { result } = renderHook(() => useMylistOperations())

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false)
      })

      const completeVideoData: Partial<MylistVideo> = {
        id: 'sm11111',
        title: 'Complete Test Video',
        thumbURL: 'https://example.com/complete.jpg',
        views: 10000,
        comments: 500,
        mylists: 200,
        likes: 1500,
        authorName: 'Complete Author',
        authorId: '999999',
        authorIcon: 'https://example.com/complete-icon.jpg',
        registeredAt: '2024-01-01T12:00:00Z',
        memo: 'Test memo'
      }

      await result.current.addVideoToMylist('test-mylist-id', completeVideoData)

      expect(mockMylistManager.addVideoToMylist).toHaveBeenCalledWith(
        'test-mylist-id',
        completeVideoData
      )

      // データが完全に保持されることを確認
      const calledData = mockMylistManager.addVideoToMylist.mock.calls[0][1]
      expect(calledData).toEqual(completeVideoData)
    })
  })
})