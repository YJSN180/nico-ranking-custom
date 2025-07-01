import { render, screen } from '@testing-library/react'
import { vi, describe, it, expect, beforeEach } from 'vitest'
import { WatchHistoryPage } from '@/app/watch-history/watch-history-client'
import { useWatchHistory } from '@/hooks/use-watch-history'
import type { WatchHistoryEntry } from '@/lib/storage/types'

// useWatchHistoryフックをモック
vi.mock('@/hooks/use-watch-history')

// MylistButtonをモック
vi.mock('@/components/mylist-button', () => ({
  MylistButton: ({ video }: any) => (
    <button>マイリストに追加</button>
  )
}))

// OptimizedImageをモック
vi.mock('@/components/optimized-image', () => ({
  OptimizedImage: ({ src, alt }: any) => (
    <img src={src} alt={alt} />
  )
}))

describe('視聴履歴ページのレンダリング（t-wada式TDD）', () => {
  const mockHistory: WatchHistoryEntry[] = [
    {
      videoId: 'sm12345',
      title: 'テスト動画タイトル',
      thumbURL: 'https://example.com/thumb.jpg',
      watchedAt: Date.now(),
      watchCount: 3,
      views: 1000,
      comments: 50,
      mylists: 10,
      likes: 100,
      authorName: 'テスト投稿者',
      authorId: 'user123',
      authorIcon: 'https://example.com/icon.jpg',
      registeredAt: '2025-01-01T00:00:00.000Z'
    }
  ]

  const defaultMockReturn = {
    history: [],
    isLoading: false,
    selectedItems: new Set<string>(),
    stats: null,
    searchHistory: vi.fn(),
    removeSelected: vi.fn(),
    clearAllHistory: vi.fn(),
    toggleSelection: vi.fn(),
    toggleSelectAll: vi.fn(),
    loadStats: vi.fn(),
    addToHistory: vi.fn(),
    loadHistory: vi.fn()
  }

  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('RED: 失敗するテスト', () => {
    it('視聴履歴が空の場合、「まだ視聴履歴がありません」と表示される', () => {
      // Arrange
      ;(useWatchHistory as any).mockReturnValue({
        ...defaultMockReturn,
        history: []
      })

      // Act
      render(<WatchHistoryPage />)

      // Assert
      expect(screen.getByText('まだ視聴履歴がありません')).toBeInTheDocument()
    })

    it('視聴履歴がある場合、動画タイトルが表示される', () => {
      // Arrange
      ;(useWatchHistory as any).mockReturnValue({
        ...defaultMockReturn,
        history: mockHistory
      })

      // Act
      render(<WatchHistoryPage />)

      // Assert
      expect(screen.getByText('テスト動画タイトル')).toBeInTheDocument()
    })

    it('視聴回数が正しく表示される', () => {
      // Arrange
      ;(useWatchHistory as any).mockReturnValue({
        ...defaultMockReturn,
        history: mockHistory
      })

      // Act
      render(<WatchHistoryPage />)

      // Assert
      expect(screen.getByText('視聴回数: 3回')).toBeInTheDocument()
    })

    it('data-testid="video-title"を持つ要素が存在する', () => {
      // Arrange
      ;(useWatchHistory as any).mockReturnValue({
        ...defaultMockReturn,
        history: mockHistory
      })

      // Act
      render(<WatchHistoryPage />)

      // Assert
      const titleElement = screen.getByTestId('video-title')
      expect(titleElement).toBeInTheDocument()
      expect(titleElement).toHaveTextContent('テスト動画タイトル')
    })
  })

  describe('GREEN: コンポーネントの構造確認', () => {
    it('視聴履歴コンポーネントが正しくレンダリングされる', () => {
      // Arrange
      ;(useWatchHistory as any).mockReturnValue({
        ...defaultMockReturn,
        history: mockHistory
      })

      // Act
      const { container } = render(<WatchHistoryPage />)

      // Assert
      // data-testidを持つ要素を探す
      const videoItem = container.querySelector('[data-testid="watch-history-video-item"]')
      expect(videoItem).toBeInTheDocument()

      // クラス名を確認
      const historyList = container.querySelector('.historyList')
      expect(historyList).toBeInTheDocument()

      // 動画アイテムの構造を確認
      const title = container.querySelector('[data-testid="video-title"]')
      expect(title).toBeInTheDocument()
      expect(title).toHaveTextContent('テスト動画タイトル')
    })

    it('複数の視聴履歴が正しく表示される', () => {
      // Arrange
      const multipleHistory: WatchHistoryEntry[] = [
        ...mockHistory,
        {
          ...mockHistory[0],
          videoId: 'sm67890',
          title: '2番目の動画',
          watchCount: 1
        }
      ]

      ;(useWatchHistory as any).mockReturnValue({
        ...defaultMockReturn,
        history: multipleHistory
      })

      // Act
      render(<WatchHistoryPage />)

      // Assert
      expect(screen.getByText('テスト動画タイトル')).toBeInTheDocument()
      expect(screen.getByText('2番目の動画')).toBeInTheDocument()
      expect(screen.getByText('視聴回数: 3回')).toBeInTheDocument()
      expect(screen.getByText('視聴回数: 1回')).toBeInTheDocument()
    })
  })

  describe('REFACTOR: エッジケースと詳細確認', () => {
    it('動画統計情報が未定義の場合でも正しく表示される', () => {
      // Arrange
      const historyWithoutStats: WatchHistoryEntry[] = [{
        videoId: 'sm11111',
        title: '統計なし動画',
        thumbURL: 'https://example.com/thumb2.jpg',
        watchedAt: Date.now(),
        watchCount: 1,
        // 統計情報なし
      }]

      ;(useWatchHistory as any).mockReturnValue({
        ...defaultMockReturn,
        history: historyWithoutStats
      })

      // Act
      render(<WatchHistoryPage />)

      // Assert
      expect(screen.getByText('統計なし動画')).toBeInTheDocument()
      expect(screen.getByText('視聴回数: 1回')).toBeInTheDocument()
    })

    it('検索バーとソート選択が表示される', () => {
      // Arrange
      ;(useWatchHistory as any).mockReturnValue({
        ...defaultMockReturn,
        history: mockHistory
      })

      // Act
      render(<WatchHistoryPage />)

      // Assert
      expect(screen.getByPlaceholderText('視聴履歴を検索...')).toBeInTheDocument()
      expect(screen.getByText('視聴日時（新しい順）')).toBeInTheDocument()
    })
  })
})