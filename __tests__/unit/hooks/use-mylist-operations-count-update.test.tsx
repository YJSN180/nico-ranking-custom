import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, act, waitFor } from '@testing-library/react'
import { useMylistOperations } from '@/hooks/use-mylist-operations'
import { DBManager } from '@/lib/storage/db-manager'
import { MylistManager } from '@/lib/storage/mylists'

// DBManagerとMylistManagerのモック
vi.mock('@/lib/storage/db-manager')
vi.mock('@/lib/storage/mylists')

describe('useMylistOperations - カウント更新テスト', () => {
  let mockDBManager: any
  let mockMylistManager: any

  beforeEach(() => {
    vi.clearAllMocks()
    
    mockDBManager = {
      init: vi.fn().mockResolvedValue(undefined)
    }
    
    mockMylistManager = {
      getOrCreateDefaultMylist: vi.fn().mockResolvedValue('default-mylist-id'),
      getAllMylists: vi.fn().mockResolvedValue([
        {
          id: 'mylist-1',
          name: 'テストマイリスト',
          description: '',
          videoCount: 0,
          isDefault: false
        }
      ]),
      addVideoToMylist: vi.fn().mockResolvedValue(undefined),
      removeVideoFromMylist: vi.fn().mockResolvedValue(undefined),
      createMylist: vi.fn().mockResolvedValue('new-mylist-id'),
      getVideosInMylist: vi.fn().mockResolvedValue([])
    }

    vi.mocked(DBManager).mockImplementation(() => mockDBManager)
    vi.mocked(MylistManager).mockImplementation(() => mockMylistManager)
  })

  it('動画追加後にマイリストのカウントが更新される', async () => {
    const { result } = renderHook(() => useMylistOperations())

    // 初期化を待つ
    await waitFor(() => {
      expect(result.current.isLoading).toBe(false)
    })

    // 初期状態：0件
    expect(result.current.mylists[0].videoCount).toBe(0)

    // 動画追加後のマイリストデータをモック
    mockMylistManager.getAllMylists.mockResolvedValueOnce([
      {
        id: 'mylist-1',
        name: 'テストマイリスト',
        description: '',
        videoCount: 1, // カウントが1に増加
        isDefault: false
      }
    ])

    // 動画を追加
    await act(async () => {
      const success = await result.current.addVideoToMylist('mylist-1', {
        id: 'video-1',
        title: 'テスト動画',
        thumbURL: 'https://example.com/thumb.jpg',
        viewCount: 100,
        commentCount: 10,
        mylistCount: 5,
        duration: 300,
        authorName: 'テスト投稿者',
        authorId: 'author-1',
        registeredAt: '2025-06-29T00:00:00Z',
        tags: ['タグ1', 'タグ2']
      })
      expect(success).toBe(true)
    })

    // カウントが更新されていることを確認
    expect(result.current.mylists[0].videoCount).toBe(1)
    expect(mockMylistManager.getAllMylists).toHaveBeenCalledTimes(2) // 初期化時と追加後
  })

  it('動画削除後にマイリストのカウントが更新される', async () => {
    // 初期状態：1件の動画がある
    mockMylistManager.getAllMylists.mockResolvedValueOnce([
      {
        id: 'mylist-1',
        name: 'テストマイリスト',
        description: '',
        videoCount: 1,
        isDefault: false
      }
    ])

    const { result } = renderHook(() => useMylistOperations())

    // 初期化を待つ
    await waitFor(() => {
      expect(result.current.isLoading).toBe(false)
    })

    // 初期状態：1件
    expect(result.current.mylists[0].videoCount).toBe(1)

    // 動画削除後のマイリストデータをモック
    mockMylistManager.getAllMylists.mockResolvedValueOnce([
      {
        id: 'mylist-1',
        name: 'テストマイリスト',
        description: '',
        videoCount: 0, // カウントが0に減少
        isDefault: false
      }
    ])

    // 動画を削除
    await act(async () => {
      const success = await result.current.removeVideoFromMylist('mylist-1', 'video-1')
      expect(success).toBe(true)
    })

    // カウントが更新されていることを確認
    expect(result.current.mylists[0].videoCount).toBe(0)
    expect(mockMylistManager.getAllMylists).toHaveBeenCalledTimes(2) // 初期化時と削除後
  })
})