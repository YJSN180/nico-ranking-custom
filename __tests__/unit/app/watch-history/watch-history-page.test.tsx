import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { WatchHistoryPage } from '@/app/watch-history/watch-history-client'
import { useWatchHistory } from '@/hooks/use-watch-history'
import { MylistManager } from '@/lib/storage/mylists'
import { DBManager } from '@/lib/storage/db-manager'

// フックのモック
vi.mock('@/hooks/use-watch-history')

// ストレージのモック
vi.mock('@/lib/storage/db-manager', () => ({
  DBManager: vi.fn().mockImplementation(() => ({
    init: vi.fn().mockResolvedValue(true),
    getDB: vi.fn()
  }))
}))

vi.mock('@/lib/storage/mylists', () => ({
  MylistManager: vi.fn().mockImplementation(() => ({
    getAllMylists: vi.fn().mockResolvedValue([
      { id: 'mylist1', name: 'マイリスト1', videoCount: 5 },
      { id: 'mylist2', name: 'マイリスト2', videoCount: 3 }
    ]),
    addVideoToMylist: vi.fn().mockResolvedValue(true)
  }))
}))

// Next.js navigation モック
vi.mock('next/navigation', () => ({
  useRouter: vi.fn(() => ({
    push: vi.fn()
  }))
}))

describe('WatchHistoryPage', () => {
  const mockHistory = [
    {
      videoId: 'sm12345',
      title: 'テスト動画1',
      thumbURL: 'https://example.com/thumb1.jpg',
      watchedAt: Date.now(),
      watchCount: 3,
      authorName: '投稿者1',
      authorId: 'user1',
      views: 1000,
      comments: 50,
      mylists: 10,
      likes: 100
    },
    {
      videoId: 'sm67890',
      title: 'テスト動画2',
      thumbURL: 'https://example.com/thumb2.jpg',
      watchedAt: Date.now() - 86400000, // 1日前
      watchCount: 1,
      authorName: '投稿者2',
      authorId: 'user2',
      views: 500,
      comments: 20,
      mylists: 5,
      likes: 50
    }
  ]

  beforeEach(() => {
    vi.clearAllMocks()
    
    // useWatchHistoryのデフォルトモック
    vi.mocked(useWatchHistory).mockReturnValue({
      history: mockHistory,
      isLoading: false,
      selectedItems: new Set(),
      stats: {
        totalCount: 2,
        oldestWatchedAt: Date.now() - 86400000,
        newestWatchedAt: Date.now()
      },
      addToHistory: vi.fn(),
      loadHistory: vi.fn(),
      searchHistory: vi.fn(),
      removeSelected: vi.fn(),
      clearAllHistory: vi.fn(),
      toggleSelection: vi.fn(),
      toggleSelectAll: vi.fn(),
      loadStats: vi.fn()
    })

  })

  describe('基本的な表示', () => {
    it('視聴履歴が正しく表示される', () => {
      render(<WatchHistoryPage />)
      
      expect(screen.getByText('視聴履歴')).toBeInTheDocument()
      expect(screen.getByText('テスト動画1')).toBeInTheDocument()
      expect(screen.getByText('テスト動画2')).toBeInTheDocument()
    })

    it('視聴回数が表示される', () => {
      render(<WatchHistoryPage />)
      
      expect(screen.getByText('視聴回数: 3回')).toBeInTheDocument()
      expect(screen.getByText('視聴回数: 1回')).toBeInTheDocument()
    })

    it('統計情報が表示される', () => {
      render(<WatchHistoryPage />)
      
      expect(screen.getByText('全2件の視聴履歴')).toBeInTheDocument()
    })

    it('読み込み中の表示', () => {
      vi.mocked(useWatchHistory).mockReturnValue({
        history: [],
        isLoading: true,
        selectedItems: new Set(),
        stats: null,
        addToHistory: vi.fn(),
        loadHistory: vi.fn(),
        searchHistory: vi.fn(),
        removeSelected: vi.fn(),
        clearAllHistory: vi.fn(),
        toggleSelection: vi.fn(),
        toggleSelectAll: vi.fn(),
        loadStats: vi.fn()
      })

      render(<WatchHistoryPage />)
      
      expect(screen.getByText('読み込み中...')).toBeInTheDocument()
    })

    it('履歴が空の場合の表示', () => {
      vi.mocked(useWatchHistory).mockReturnValue({
        history: [],
        isLoading: false,
        selectedItems: new Set(),
        stats: { totalCount: 0, oldestWatchedAt: null, newestWatchedAt: null },
        addToHistory: vi.fn(),
        loadHistory: vi.fn(),
        searchHistory: vi.fn(),
        removeSelected: vi.fn(),
        clearAllHistory: vi.fn(),
        toggleSelection: vi.fn(),
        toggleSelectAll: vi.fn(),
        loadStats: vi.fn()
      })

      render(<WatchHistoryPage />)
      
      expect(screen.getByText('まだ視聴履歴がありません')).toBeInTheDocument()
      expect(screen.getByText('動画を視聴すると、ここに履歴が表示されます')).toBeInTheDocument()
    })
  })

  describe('検索機能', () => {
    it('検索バーが表示される', () => {
      render(<WatchHistoryPage />)
      
      const searchInput = screen.getByPlaceholderText('視聴履歴を検索...')
      expect(searchInput).toBeInTheDocument()
    })

    it('検索を実行できる', async () => {
      const mockSearchHistory = vi.fn()
      vi.mocked(useWatchHistory).mockReturnValue({
        history: mockHistory,
        isLoading: false,
        selectedItems: new Set(),
        stats: null,
        addToHistory: vi.fn(),
        loadHistory: vi.fn(),
        searchHistory: mockSearchHistory,
        removeSelected: vi.fn(),
        clearAllHistory: vi.fn(),
        toggleSelection: vi.fn(),
        toggleSelectAll: vi.fn(),
        loadStats: vi.fn()
      })

      render(<WatchHistoryPage />)
      
      const searchInput = screen.getByPlaceholderText('視聴履歴を検索...')
      fireEvent.change(searchInput, { target: { value: 'テスト' } })
      
      await waitFor(() => {
        expect(mockSearchHistory).toHaveBeenCalledWith('テスト')
      }, { timeout: 500 })
    })
  })

  describe('選択・削除機能', () => {
    it('選択モードを切り替えられる', () => {
      render(<WatchHistoryPage />)
      
      const selectButton = screen.getByText('選択')
      fireEvent.click(selectButton)
      
      expect(screen.getByText('キャンセル')).toBeInTheDocument()
      expect(screen.getByText('すべて選択')).toBeInTheDocument()
    })

    it('動画を選択できる', () => {
      const mockToggleSelection = vi.fn()
      vi.mocked(useWatchHistory).mockReturnValue({
        history: mockHistory,
        isLoading: false,
        selectedItems: new Set(),
        stats: null,
        addToHistory: vi.fn(),
        loadHistory: vi.fn(),
        searchHistory: vi.fn(),
        removeSelected: vi.fn(),
        clearAllHistory: vi.fn(),
        toggleSelection: mockToggleSelection,
        toggleSelectAll: vi.fn(),
        loadStats: vi.fn()
      })

      render(<WatchHistoryPage />)
      
      // 選択モードに切り替え
      fireEvent.click(screen.getByText('選択'))
      
      // チェックボックスをクリック
      const checkboxes = screen.getAllByRole('checkbox')
      fireEvent.click(checkboxes[0])
      
      expect(mockToggleSelection).toHaveBeenCalledWith('sm12345')
    })

    it('選択した動画を削除できる', () => {
      const mockRemoveSelected = vi.fn()
      vi.mocked(useWatchHistory).mockReturnValue({
        history: mockHistory,
        isLoading: false,
        selectedItems: new Set(['sm12345']),
        stats: null,
        addToHistory: vi.fn(),
        loadHistory: vi.fn(),
        searchHistory: vi.fn(),
        removeSelected: mockRemoveSelected,
        clearAllHistory: vi.fn(),
        toggleSelection: vi.fn(),
        toggleSelectAll: vi.fn(),
        loadStats: vi.fn()
      })

      render(<WatchHistoryPage />)
      
      // 選択モードに切り替え
      fireEvent.click(screen.getByText('選択'))
      
      // 削除ボタンをクリック
      const deleteButton = screen.getByText('削除 (1)')
      fireEvent.click(deleteButton)
      
      expect(mockRemoveSelected).toHaveBeenCalled()
    })

    it('すべて削除ボタンが機能する', () => {
      const mockClearAllHistory = vi.fn()
      vi.mocked(useWatchHistory).mockReturnValue({
        history: mockHistory,
        isLoading: false,
        selectedItems: new Set(),
        stats: null,
        addToHistory: vi.fn(),
        loadHistory: vi.fn(),
        searchHistory: vi.fn(),
        removeSelected: vi.fn(),
        clearAllHistory: mockClearAllHistory,
        toggleSelection: vi.fn(),
        toggleSelectAll: vi.fn(),
        loadStats: vi.fn()
      })

      render(<WatchHistoryPage />)
      
      const clearAllButton = screen.getByText('すべて削除')
      fireEvent.click(clearAllButton)
      
      expect(mockClearAllHistory).toHaveBeenCalled()
    })
  })

  describe('マイリスト追加機能', () => {
    it('マイリストに追加ボタンが表示される', () => {
      render(<WatchHistoryPage />)
      
      const addButtons = screen.getAllByText('マイリストに追加')
      expect(addButtons).toHaveLength(2)
    })

    it('マイリスト選択モーダルが開く', async () => {
      render(<WatchHistoryPage />)
      
      const addButton = screen.getAllByText('マイリストに追加')[0]
      fireEvent.click(addButton)
      
      await waitFor(() => {
        // モーダル内のh2を確認
        expect(screen.getByRole('heading', { name: 'マイリストに追加' })).toBeInTheDocument()
        expect(screen.getByText('マイリスト1')).toBeInTheDocument()
        expect(screen.getByText('マイリスト2')).toBeInTheDocument()
      })
    })
  })


  describe('ソート機能', () => {
    it('ソート選択が表示される', () => {
      render(<WatchHistoryPage />)
      
      const sortSelect = screen.getByRole('combobox')
      expect(sortSelect).toBeInTheDocument()
      expect(sortSelect).toHaveValue('watchedAt-desc')
    })

    it('ソート順を変更できる', async () => {
      render(<WatchHistoryPage />)
      
      const sortSelect = screen.getByRole('combobox')
      fireEvent.change(sortSelect, { target: { value: 'watchedAt-asc' } })
      
      expect(sortSelect).toHaveValue('watchedAt-asc')
    })
  })
})