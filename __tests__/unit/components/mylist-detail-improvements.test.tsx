/**
 * TDD テスト: MylistDetailClient 改善項目
 * 
 * 要件:
 * 1. 並び替えボタンが存在しない
 * 2. ドラッグ＆ドロップ関連のイベントハンドラーが無効
 * 3. 並び替えモード(isReorderMode)が使用されない
 */

import { render, screen, waitFor } from '@testing-library/react'
import { vi } from 'vitest'
import { useRouter, useParams } from 'next/navigation'
import { MylistDetailClient } from '@/app/mylists/[id]/mylist-detail-client'
import { DBManager } from '@/lib/storage/db-manager'
import { MylistManager } from '@/lib/storage/mylists'

// Nextルーターのモック
vi.mock('next/navigation')
const mockUseRouter = useRouter as vi.MockedFunction<typeof useRouter>
const mockUseParams = useParams as vi.MockedFunction<typeof useParams>

// DBManagerとMylistManagerのモック
vi.mock('@/lib/storage/db-manager')
vi.mock('@/lib/storage/mylists')

const MockedDBManager = DBManager as vi.MockedClass<typeof DBManager>
const MockedMylistManager = MylistManager as vi.MockedClass<typeof MylistManager>

// テスト用データ
const mockMylist = {
  id: 'test-mylist-1',
  name: 'テストマイリスト',
  description: 'テスト用のマイリスト',
  videoCount: 2,
  createdAt: Date.now(),
  updatedAt: Date.now()
}

const mockVideos = [
  {
    id: 'sm12345678',
    title: 'テスト動画1',
    thumbURL: 'https://example.com/thumb1.jpg',
    authorName: 'テスト投稿者1',
    authorId: 'user123',
    views: 100000,
    comments: 500,
    likes: 1000,
    mylists: 200,
    addedAt: Date.now() - 86400000, // 1日前
    memo: ''
  },
  {
    id: 'sm87654321',
    title: 'テスト動画2',
    thumbURL: 'https://example.com/thumb2.jpg',
    authorName: 'テスト投稿者2',
    authorId: 'user456',
    views: 50000,
    comments: 250,
    likes: 500,
    mylists: 100,
    addedAt: Date.now(), // 現在
    memo: 'テストメモ'
  }
]

describe('MylistDetailClient 改善項目のTDDテスト', () => {
  let mockRouter: any
  let mockDbManager: any
  let mockMylistManager: any

  beforeEach(() => {
    // ルーターのモック設定
    mockRouter = {
      push: vi.fn(),
      back: vi.fn(),
    }
    mockUseRouter.mockReturnValue(mockRouter)
    mockUseParams.mockReturnValue({ id: 'test-mylist-1' })

    // DBManagerのモック設定
    mockDbManager = {
      init: vi.fn().mockResolvedValue(undefined),
    }
    MockedDBManager.mockImplementation(() => mockDbManager)

    // MylistManagerのモック設定
    mockMylistManager = {
      getMylist: vi.fn().mockResolvedValue(mockMylist),
      getVideosInMylistWithOrder: vi.fn().mockResolvedValue(mockVideos),
      searchVideosInMylist: vi.fn().mockResolvedValue(mockVideos),
      removeVideoFromMylist: vi.fn().mockResolvedValue(undefined),
      updateVideoMemo: vi.fn().mockResolvedValue(undefined),
      updateMylist: vi.fn().mockResolvedValue(undefined),
      deleteMylist: vi.fn().mockResolvedValue(undefined),
      updateVideoOrder: vi.fn().mockResolvedValue(undefined),
    }
    MockedMylistManager.mockImplementation(() => mockMylistManager)
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  describe('並び替え機能の削除', () => {
    test('並び替えボタンが存在しないこと', async () => {
      render(<MylistDetailClient />)

      // データ読み込み完了まで待機
      await waitFor(() => {
        expect(screen.getByText('テストマイリスト')).toBeInTheDocument()
      })

      // 並び替えボタンが存在しないことを確認
      const reorderButton = screen.queryByTestId('toggle-reorder-mode')
      expect(reorderButton).toBeNull()

      // "並び替え" テキストを含むボタンも存在しないことを確認
      const reorderButtonByText = screen.queryByRole('button', { name: /並び替え/ })
      expect(reorderButtonByText).toBeNull()
    })

    test('ドラッグハンドルが存在しないこと', async () => {
      render(<MylistDetailClient />)

      await waitFor(() => {
        expect(screen.getByText('テストマイリスト')).toBeInTheDocument()
      })

      // ドラッグハンドルが存在しないことを確認
      const dragHandles = screen.queryAllByTestId('drag-handle')
      expect(dragHandles).toHaveLength(0)
    })

    test('動画アイテムにドラッグ可能な属性がないこと', async () => {
      render(<MylistDetailClient />)

      await waitFor(() => {
        expect(screen.getByText('テストマイリスト')).toBeInTheDocument()
      })

      // 動画アイテムのli要素を取得
      const videoItems = screen.getAllByTestId('mylist-video-item').map(item => item.closest('li'))
      
      // 全ての動画アイテムがdraggable属性を持たないことを確認
      videoItems.forEach(item => {
        expect(item).not.toHaveAttribute('draggable', 'true')
      })
    })

    test('ドラッグ&ドロップイベントハンドラーが設定されていないこと', async () => {
      render(<MylistDetailClient />)

      await waitFor(() => {
        expect(screen.getByText('テストマイリスト')).toBeInTheDocument()
      })

      // 動画アイテムのli要素を取得
      const videoItems = screen.getAllByTestId('mylist-video-item').map(item => item.closest('li'))
      
      videoItems.forEach(item => {
        // ドラッグイベントハンドラーが設定されていないことを確認
        expect(item).not.toHaveAttribute('onDragStart')
        expect(item).not.toHaveAttribute('onDragEnd')
        expect(item).not.toHaveAttribute('onDragOver')
        expect(item).not.toHaveAttribute('onDragLeave')
        expect(item).not.toHaveAttribute('onDrop')
      })
    })
  })

  describe('ソート機能の維持', () => {
    test('ソートセレクトボックスが存在すること', async () => {
      render(<MylistDetailClient />)

      await waitFor(() => {
        expect(screen.getByText('テストマイリスト')).toBeInTheDocument()
      })

      // ソートセレクトボックスが存在することを確認
      const sortSelect = screen.getByDisplayValue('追加日（新しい順）')
      expect(sortSelect).toBeInTheDocument()
      expect(sortSelect.tagName).toBe('SELECT')
    })

    test('ソートオプションが正しく表示されること', async () => {
      render(<MylistDetailClient />)

      await waitFor(() => {
        expect(screen.getByText('テストマイリスト')).toBeInTheDocument()
      })

      // ソートオプションが正しく存在することを確認
      expect(screen.getByText('追加日（新しい順）')).toBeInTheDocument()
      expect(screen.getByText('追加日（古い順）')).toBeInTheDocument()
      expect(screen.getByText('タイトル（昇順）')).toBeInTheDocument()
      expect(screen.getByText('タイトル（降順）')).toBeInTheDocument()
      expect(screen.getByText('再生数（多い順）')).toBeInTheDocument()
    })

    test('ソートセレクトボックスが無効化されていないこと', async () => {
      render(<MylistDetailClient />)

      await waitFor(() => {
        expect(screen.getByText('テストマイリスト')).toBeInTheDocument()
      })

      const sortSelect = screen.getByDisplayValue('追加日（新しい順）')
      expect(sortSelect).not.toBeDisabled()
    })
  })

  describe('UI一貫性の確保', () => {
    test('検索バーが正常に表示されること', async () => {
      render(<MylistDetailClient />)

      await waitFor(() => {
        expect(screen.getByText('テストマイリスト')).toBeInTheDocument()
      })

      const searchInput = screen.getByPlaceholderText('マイリスト内を検索...')
      expect(searchInput).toBeInTheDocument()
      expect(searchInput.tagName).toBe('INPUT')
    })

    test('マイリスト設定ボタンが表示されること', async () => {
      render(<MylistDetailClient />)

      await waitFor(() => {
        expect(screen.getByText('テストマイリスト')).toBeInTheDocument()
      })

      const settingsButton = screen.getByRole('button', { name: 'マイリスト設定' })
      expect(settingsButton).toBeInTheDocument()
    })
  })
})