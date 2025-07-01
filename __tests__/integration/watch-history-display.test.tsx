import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import { WatchHistoryPage } from '@/app/watch-history/watch-history-client'
import { useWatchHistory } from '@/hooks/use-watch-history'
import { DBManager } from '@/lib/storage/db-manager'
import { WatchHistoryManager } from '@/lib/storage/watch-history'

// モックの設定
vi.mock('@/hooks/use-watch-history')
vi.mock('@/lib/storage/db-manager')
vi.mock('@/lib/storage/watch-history')
vi.mock('next/navigation', () => ({
  useRouter: vi.fn(() => ({
    push: vi.fn()
  }))
}))

describe('視聴履歴表示のインテグレーションテスト（t-wada式TDD）', () => {
  describe('視聴履歴の表示', () => {
    it('視聴履歴に追加した動画が表示されること', async () => {
      // Arrange
      const mockHistory = [{
        videoId: 'sm12345',
        title: 'テスト動画',
        thumbURL: 'https://example.com/thumb.jpg',
        watchedAt: Date.now(),
        watchCount: 1,
        views: 1000,
        comments: 50,
        mylists: 10,
        likes: 100,
        authorName: 'テスト投稿者',
        authorId: 'user123',
        registeredAt: '2024-01-01T00:00:00Z'
      }]

      vi.mocked(useWatchHistory).mockReturnValue({
        history: mockHistory,
        isLoading: false,
        selectedItems: new Set(),
        stats: {
          totalCount: 1,
          oldestWatchedAt: Date.now(),
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

      // Act
      render(<WatchHistoryPage />)

      // Assert
      await waitFor(() => {
        expect(screen.getByText('テスト動画')).toBeInTheDocument()
        expect(screen.getByText('視聴回数: 1回')).toBeInTheDocument()
        expect(screen.getByText('全1件の視聴履歴')).toBeInTheDocument()
      })
    })

    it('視聴履歴が空の場合、適切なメッセージが表示されること', async () => {
      // Arrange
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

      // Act
      render(<WatchHistoryPage />)

      // Assert
      await waitFor(() => {
        expect(screen.getByText('まだ視聴履歴がありません')).toBeInTheDocument()
      })
    })
  })

  describe('視聴履歴の実際の追加と表示', () => {
    it('動画を視聴した際に視聴履歴が更新されること', async () => {
      // この部分は実際のIndexedDBを使用するため、別途実装
      // TODO: 実際のDB操作のテスト
    })
  })
})