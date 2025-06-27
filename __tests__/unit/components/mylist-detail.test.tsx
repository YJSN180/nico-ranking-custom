import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { MylistDetailClient } from '@/app/mylists/[id]/mylist-detail-client'
import { MylistManager } from '@/lib/storage/mylists'
import { DBManager } from '@/lib/storage/db-manager'
import type { Mylist, MylistVideo } from '@/lib/storage/types'

// モックの設定
vi.mock('next/navigation', () => ({
  useRouter: () => ({
    push: vi.fn(),
    back: vi.fn(),
  }),
  useParams: () => ({
    id: 'test-mylist-id'
  })
}))

vi.mock('@/lib/storage/db-manager')
vi.mock('@/lib/storage/mylists')

describe('MylistDetailClient', () => {
  let mockDBManager: any
  let mockMylistManager: any
  
  const mockMylist: Mylist = {
    id: 'test-mylist-id',
    name: 'テストマイリスト',
    description: 'テスト用の説明',
    createdAt: Date.now(),
    updatedAt: Date.now(),
    videoCount: 2,
    isDefault: false
  }
  
  const mockVideos: MylistVideo[] = [
    {
      id: 'sm12345',
      mylistId: 'test-mylist-id',
      title: 'テスト動画1',
      thumbURL: 'https://example.com/thumb1.jpg',
      addedAt: Date.now() - 1000,
      memo: '素晴らしい動画',
      views: 1000,
      comments: 50,
      mylists: 10,
      likes: 100,
      authorName: '投稿者A',
      authorId: 'user123',
    },
    {
      id: 'sm67890',
      mylistId: 'test-mylist-id',
      title: 'テスト動画2',
      thumbURL: 'https://example.com/thumb2.jpg',
      addedAt: Date.now(),
      views: 2000,
      comments: 100,
      mylists: 20,
      likes: 200,
      authorName: '投稿者B',
      authorId: 'user456',
    }
  ]

  beforeEach(() => {
    // DBManagerのモック
    mockDBManager = {
      init: vi.fn(),
      isInitialized: vi.fn().mockReturnValue(true),
      getDB: vi.fn()
    }
    DBManager.mockImplementation(() => mockDBManager)
    
    // MylistManagerのモック
    mockMylistManager = {
      getMylist: vi.fn().mockResolvedValue(mockMylist),
      getVideosInMylist: vi.fn().mockResolvedValue(mockVideos),
      removeVideoFromMylist: vi.fn().mockResolvedValue(undefined),
      updateVideoMemo: vi.fn().mockResolvedValue(undefined),
      updateMylist: vi.fn().mockResolvedValue(undefined),
      deleteMylist: vi.fn().mockResolvedValue(undefined),
      searchVideosInMylist: vi.fn().mockResolvedValue(mockVideos)
    }
    MylistManager.mockImplementation(() => mockMylistManager)
  })

  describe('基本表示', () => {
    it('マイリスト情報と動画一覧が表示される', async () => {
      render(<MylistDetailClient />)
      
      await waitFor(() => {
        expect(screen.getByText('テストマイリスト')).toBeInTheDocument()
        expect(screen.getByText('2 件の動画')).toBeInTheDocument()
        expect(screen.getByText('テスト動画1')).toBeInTheDocument()
        expect(screen.getByText('テスト動画2')).toBeInTheDocument()
      })
    })

    it('動画のメタ情報が表示される', async () => {
      render(<MylistDetailClient />)
      
      await waitFor(() => {
        expect(screen.getByText('投稿者A')).toBeInTheDocument()
        expect(screen.getByText('▶️ 1,000')).toBeInTheDocument()
        expect(screen.getByText('素晴らしい動画')).toBeInTheDocument()
      })
    })

    it('マイリストが空の場合、適切なメッセージが表示される', async () => {
      mockMylistManager.getVideosInMylist.mockResolvedValue([])
      mockMylistManager.getMylist.mockResolvedValue({ ...mockMylist, videoCount: 0 })
      
      render(<MylistDetailClient />)
      
      await waitFor(() => {
        expect(screen.getByText('まだ動画が登録されていません')).toBeInTheDocument()
        expect(screen.getByText('ランキングページから動画を追加してください')).toBeInTheDocument()
      })
    })
  })

  describe('検索機能', () => {
    it('検索ボックスに入力すると動画がフィルタリングされる', async () => {
      mockMylistManager.searchVideosInMylist.mockResolvedValue([mockVideos[0]])
      
      render(<MylistDetailClient />)
      
      await waitFor(() => {
        const searchInput = screen.getByPlaceholderText('マイリスト内を検索...')
        fireEvent.change(searchInput, { target: { value: '動画1' } })
      })
      
      await waitFor(() => {
        expect(mockMylistManager.searchVideosInMylist).toHaveBeenCalledWith('test-mylist-id', '動画1')
        expect(screen.getByText('テスト動画1')).toBeInTheDocument()
        expect(screen.queryByText('テスト動画2')).not.toBeInTheDocument()
      })
    })
  })

  describe('ソート機能', () => {
    it('ソート順を変更できる', async () => {
      render(<MylistDetailClient />)
      
      await waitFor(() => {
        const sortSelect = screen.getByRole('combobox')
        fireEvent.change(sortSelect, { target: { value: 'title-asc' } })
      })
      
      // ソート後の順序を確認（実装により異なる）
      await waitFor(() => {
        const titles = screen.getAllByTestId('video-title')
        expect(titles[0]).toHaveTextContent('テスト動画1')
        expect(titles[1]).toHaveTextContent('テスト動画2')
      })
    })
  })

  describe('動画削除', () => {
    it('削除ボタンクリックで確認後、動画が削除される', async () => {
      const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(true)
      
      render(<MylistDetailClient />)
      
      await waitFor(() => {
        const deleteButtons = screen.getAllByText('削除')
        fireEvent.click(deleteButtons[0])
      })
      
      expect(confirmSpy).toHaveBeenCalledWith('この動画をマイリストから削除しますか？')
      expect(mockMylistManager.removeVideoFromMylist).toHaveBeenCalledWith('test-mylist-id', 'sm12345')
    })

    it('削除確認でキャンセルした場合、削除されない', async () => {
      const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(false)
      
      render(<MylistDetailClient />)
      
      await waitFor(() => {
        const deleteButtons = screen.getAllByText('削除')
        fireEvent.click(deleteButtons[0])
      })
      
      expect(mockMylistManager.removeVideoFromMylist).not.toHaveBeenCalled()
    })
  })

  describe('メモ編集', () => {
    it('編集ボタンクリックでメモ編集モーダルが開く', async () => {
      render(<MylistDetailClient />)
      
      await waitFor(() => {
        const editButtons = screen.getAllByText('編集')
        fireEvent.click(editButtons[0])
      })
      
      expect(screen.getByText('動画メモの編集')).toBeInTheDocument()
      expect(screen.getByDisplayValue('素晴らしい動画')).toBeInTheDocument()
    })

    it('メモを更新できる', async () => {
      render(<MylistDetailClient />)
      
      await waitFor(() => {
        const editButtons = screen.getAllByText('編集')
        fireEvent.click(editButtons[0])
      })
      
      const memoTextarea = screen.getByDisplayValue('素晴らしい動画')
      fireEvent.change(memoTextarea, { target: { value: '更新されたメモ' } })
      
      const saveButton = screen.getByText('保存')
      fireEvent.click(saveButton)
      
      await waitFor(() => {
        expect(mockMylistManager.updateVideoMemo).toHaveBeenCalledWith(
          'test-mylist-id',
          'sm12345',
          '更新されたメモ'
        )
      })
    })
  })

  describe('マイリスト設定', () => {
    it('マイリスト設定ボタンで編集モーダルが開く', async () => {
      render(<MylistDetailClient />)
      
      await waitFor(() => {
        const settingsButton = screen.getByRole('button', { name: 'マイリスト設定' })
        fireEvent.click(settingsButton)
      })
      
      expect(screen.getByDisplayValue('テストマイリスト')).toBeInTheDocument()
      expect(screen.getByDisplayValue('テスト用の説明')).toBeInTheDocument()
    })

    it('デフォルトマイリストは削除ボタンが表示されない', async () => {
      mockMylistManager.getMylist.mockResolvedValue({ ...mockMylist, isDefault: true })
      
      render(<MylistDetailClient />)
      
      await waitFor(() => {
        const settingsButton = screen.getByText('マイリスト設定')
        fireEvent.click(settingsButton)
      })
      
      expect(screen.queryByText('マイリストを削除')).not.toBeInTheDocument()
    })
  })
})