import { screen, waitFor } from '@testing-library/react'
import { render } from '@/__tests__/test-utils'
import userEvent from '@testing-library/user-event'
import { vi, describe, it, expect, beforeEach } from 'vitest'
import { MylistButton } from '@/components/mylist-button'
import { useMylistOperations } from '@/context/mylist-operations-context'
import type { RankingItem } from '@/types/ranking'

// useMylistOperationsフックをモック - CI環境対応
vi.mock('@/context/mylist-operations-context', () => {
  const mockOperations = {
    mylists: [],
    isLoading: false,
    addVideoToMylist: vi.fn().mockResolvedValue(true),
    removeVideoFromMylist: vi.fn().mockResolvedValue(undefined),
    isVideoInAnyMylist: vi.fn().mockResolvedValue({ inMylist: false, mylistIds: [] }),
    createMylist: vi.fn()
  }
  
  return {
    useMylistOperations: vi.fn(() => mockOperations),
    MylistOperationsProvider: ({ children }: { children: React.ReactNode }) => children
  }
})

const mockUseMylistOperations = useMylistOperations as unknown as ReturnType<typeof vi.fn>

describe('MylistButton', () => {
  const mockVideo: RankingItem = {
    id: 'sm12345',
    title: 'Test Video',
    thumbURL: 'https://example.com/thumb.jpg',
    views: 1000,
    comments: 50,
    mylists: 10,
    likes: 100,
    duration: 300,
    authorName: 'Test Author',
    authorId: '123456',
    registeredAt: '2024-01-01T00:00:00Z',
    tags: ['tag1', 'tag2'],
    rank: 1
  }

  const mockDefaultMylist = {
    id: 'default-mylist',
    name: 'お気に入り',
    description: '',
    isDefault: true,
    videoCount: 0,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  }

  const mockOperations = {
    mylists: [mockDefaultMylist],
    isLoading: false,
    addVideoToMylist: vi.fn(),
    removeVideoFromMylist: vi.fn(),
    isVideoInAnyMylist: vi.fn().mockResolvedValue({ inMylist: false, mylistIds: [] }),
    createMylist: vi.fn()
  }

  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(useMylistOperations).mockReturnValue(mockOperations)
  })

  describe('ローディング状態', () => {
    it('ローディング中はプレースホルダーを表示する', async () => {
      vi.mocked(useMylistOperations).mockReturnValue({
        ...mockOperations,
        isLoading: true
      })

      render(<MylistButton video={mockVideo} />)

      // SSR時はプレースホルダーが表示される
      const placeholder = screen.getByTestId('mylist-button-placeholder')
      expect(placeholder).toBeInTheDocument()
      // スタイルの代わりにクラス名の存在を確認
      expect(placeholder).toHaveClass('mylist-button-placeholder')
    })

    it('ローディング完了後はボタンを表示する', async () => {
      vi.mocked(useMylistOperations).mockReturnValue({
        ...mockOperations,
        isLoading: false
      })

      render(<MylistButton video={mockVideo} />)

      // ボタンが表示されることを確認
      const button = await screen.findByRole('button', { name: 'マイリストに追加' })
      expect(button).toBeInTheDocument()
      expect(screen.queryByTestId('mylist-button-placeholder')).not.toBeInTheDocument()
    })

    it('IndexedDBエラー時でもフォールバック表示を行う', async () => {
      // エラー状態をシミュレート
      const errorFn = vi.fn().mockRejectedValue(new Error('IndexedDB error'))
      vi.mocked(useMylistOperations).mockReturnValue({
        ...mockOperations,
        isLoading: false,
        mylists: [],
        isVideoInAnyMylist: errorFn
      })

      render(<MylistButton video={mockVideo} />)

      // エラーがMylistButton内で適切にハンドリングされる
      await waitFor(() => {
        expect(errorFn).toHaveBeenCalled()
      })

      // エラーでもボタンは表示される
      const button = await screen.findByRole('button')
      expect(button).toBeInTheDocument()
      expect(button).toHaveAttribute('aria-label', 'マイリストに追加')
    })
  })

  describe('基本的な動作', () => {
    it('未追加の動画には「+」ボタンを表示する', async () => {
      render(<MylistButton video={mockVideo} />)

      const button = await screen.findByRole('button', { name: 'マイリストに追加' })
      expect(button).toHaveTextContent('+')
    })

    it('追加済みの動画には「✓」ボタンを表示する', async () => {
      vi.mocked(useMylistOperations).mockReturnValue({
        ...mockOperations,
        isVideoInAnyMylist: vi.fn().mockResolvedValue({ 
          inMylist: true, 
          mylistIds: ['default-mylist'] 
        })
      })

      render(<MylistButton video={mockVideo} />)

      const button = await screen.findByRole('button', { name: 'マイリストから削除' })
      expect(button).toHaveTextContent('✓')
    })
  })

  describe('インタラクション', () => {
    it('「+」ボタンクリックでモーダルを表示する', async () => {
      const user = userEvent.setup()
      render(<MylistButton video={mockVideo} />)

      const button = await screen.findByRole('button', { name: 'マイリストに追加' })
      await user.click(button)

      // モーダルが表示される
      expect(screen.getByRole('dialog')).toBeInTheDocument()
    })

    it('処理中はボタンを無効化する', async () => {
      const user = userEvent.setup()
      mockOperations.addVideoToMylist.mockImplementation(async () => {
        await new Promise(resolve => setTimeout(resolve, 100))
        return true
      })

      render(<MylistButton video={mockVideo} />)

      const button = await screen.findByRole('button', { name: 'マイリストに追加' })
      await user.click(button)

      // モーダルから選択
      const defaultMylist = await screen.findByRole('button', { name: 'お気に入り' })
      await user.click(defaultMylist)

      // 処理中はボタンが無効化される
      expect(button).toBeDisabled()
      // カーソルスタイルの代わりに無効化状態を確認
      expect(button).toHaveAttribute('disabled')
    })
  })

  describe('エラーハンドリング', () => {
    it('追加エラー時はエラー状態を表示しない（ユーザー体験優先）', async () => {
      const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})
      mockOperations.addVideoToMylist.mockRejectedValue(new Error('Add failed'))

      const user = userEvent.setup()
      render(<MylistButton video={mockVideo} />)

      const button = await screen.findByRole('button', { name: 'マイリストに追加' })
      await user.click(button)

      // モーダルでマイリストを選択
      const defaultMylist = await screen.findByRole('button', { name: 'お気に入り' })
      await user.click(defaultMylist)

      // エラーがコンソールに出力される
      await waitFor(() => {
        expect(consoleError).toHaveBeenCalledWith(
          expect.stringContaining('Failed to add to mylist'),
          expect.any(Error)
        )
      })

      // ボタンは通常状態に戻る
      expect(button).not.toBeDisabled()
      expect(button).toHaveTextContent('+')

      consoleError.mockRestore()
    })
  })
})