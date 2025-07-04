import { describe, it, expect, vi, beforeEach } from 'vitest'
import { screen, fireEvent, waitFor } from '@testing-library/react'
import { render } from '@/__tests__/test-utils'
import { MylistButton } from '@/components/mylist-button'
import { useMylistOperations } from '@/context/mylist-operations-context'
import type { RankingItem } from '@/types/ranking'

// useMylistOperationsフックをモック
vi.mock('@/context/mylist-operations-context', () => ({
  useMylistOperations: vi.fn(),
  MylistOperationsProvider: ({ children }: { children: React.ReactNode }) => children
}))

describe('マイリスト複数登録機能', () => {
  const mockVideo: RankingItem = {
    id: 'sm12345',
    rank: 1,
    title: 'テスト動画',
    views: 1000,
    comments: 20,
    mylists: 50,
    likes: 100,
    duration: 180,
    registeredAt: new Date('2025-06-28'),
    tags: ['テスト'],
    thumbURL: 'https://example.com/thumb.jpg',
    authorName: 'テスト投稿者',
    authorId: '123456'
  }

  const mockMylists = [
    {
      id: 'mylist1',
      name: 'お気に入り',
      description: '',
      isDefault: false,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      videoCount: 5
    },
    {
      id: 'mylist2',
      name: '後で見る',
      description: '',
      isDefault: false,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      videoCount: 3
    },
    {
      id: 'default',
      name: 'とりあえずマイリスト',
      description: '',
      isDefault: true,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      videoCount: 10
    }
  ]

  const mockOperations = {
    mylists: mockMylists,
    isLoading: false,
    addVideoToMylist: vi.fn().mockResolvedValue(true),
    removeVideoFromMylist: vi.fn().mockResolvedValue(true),
    isVideoInAnyMylist: vi.fn(),
    createMylist: vi.fn()
  }

  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(useMylistOperations).mockReturnValue(mockOperations)
  })

  describe('チェックマーククリック時の動作', () => {
    it('動画が登録済みでもモーダルが表示される', async () => {
      // 動画が既にマイリストに登録されている状態
      mockOperations.isVideoInAnyMylist.mockResolvedValue({
        inMylist: true,
        mylistIds: ['mylist1']
      })

      render(<MylistButton video={mockVideo} />)

      // 初期化を待つ
      await waitFor(() => {
        expect(screen.queryByTestId('mylist-button-placeholder')).not.toBeInTheDocument()
      })

      // ボタンの状態が更新されるまで待つ
      await waitFor(() => {
        const button = screen.getByTestId('mylist-button')
        expect(button).toHaveAttribute('aria-label', 'マイリストから削除')
      })

      // チェックマークボタンをクリック
      const button = screen.getByTestId('mylist-button')
      fireEvent.click(button)

      // モーダルが表示されることを確認
      await waitFor(() => {
        expect(screen.getByRole('dialog')).toBeInTheDocument()
      })
    })

    it('未登録の状態でもモーダルが表示される', async () => {
      // 動画が未登録の状態
      mockOperations.isVideoInAnyMylist.mockResolvedValue({
        inMylist: false,
        mylistIds: []
      })

      render(<MylistButton video={mockVideo} />)

      // 初期化を待つ
      await waitFor(() => {
        expect(screen.queryByTestId('mylist-button-placeholder')).not.toBeInTheDocument()
      })

      // +ボタンをクリック
      const button = screen.getByTestId('mylist-button')
      fireEvent.click(button)

      // モーダルが表示されることを確認
      await waitFor(() => {
        expect(screen.getByRole('dialog')).toBeInTheDocument()
      })
    })
  })

  describe('登録済みマイリストの表示', () => {
    it('登録済みのマイリストにはチェックマークが表示される', async () => {
      // 動画がmylist1に登録されている状態
      mockOperations.isVideoInAnyMylist.mockResolvedValue({
        inMylist: true,
        mylistIds: ['mylist1']
      })

      render(<MylistButton video={mockVideo} />)

      // 初期化を待つ
      await waitFor(() => {
        expect(screen.queryByTestId('mylist-button-placeholder')).not.toBeInTheDocument()
      })

      // ボタンをクリックしてモーダルを表示  
      const button = screen.getByTestId('mylist-button')
      fireEvent.click(button)

      // モーダル内で登録済みマイリストにチェックマークが表示される
      await waitFor(() => {
        const mylistItems = screen.getAllByTestId('mylist-item-checkbox')
        // 最初のマイリスト（お気に入り）は登録済み
        const mylist1Button = mylistItems[0]
        expect(mylist1Button.className).toContain('selected')
        expect(mylist1Button.textContent).toContain('✓')
        
        // 2番目のマイリスト（後で見る）は未登録
        const mylist2Button = mylistItems[1]
        expect(mylist2Button.className).not.toContain('selected')
        expect(mylist2Button.textContent).not.toContain('✓')
      })
    })

    it('複数のマイリストに登録されている場合、すべてにチェックマークが表示される', async () => {
      // 動画が複数のマイリストに登録されている状態
      mockOperations.isVideoInAnyMylist.mockResolvedValue({
        inMylist: true,
        mylistIds: ['mylist1', 'default']
      })

      render(<MylistButton video={mockVideo} />)

      // 初期化を待つ
      await waitFor(() => {
        expect(screen.queryByTestId('mylist-button-placeholder')).not.toBeInTheDocument()
      })

      // ボタンをクリックしてモーダルを表示  
      const button = screen.getByTestId('mylist-button')
      fireEvent.click(button)

      // 両方のマイリストにチェックマークが表示される
      await waitFor(() => {
        const mylistItems = screen.getAllByTestId('mylist-item-checkbox')
        // お気に入りとデフォルトマイリストが登録済み
        const mylist1Button = mylistItems[0]
        const defaultButton = mylistItems[2] // とりあえずマイリストは3番目
        
        expect(mylist1Button.className).toContain('selected')
        expect(defaultButton.className).toContain('selected')
      })
    })
  })

  describe('重複登録の防止', () => {
    it('既に登録されているマイリストをクリックすると削除される', async () => {
      // 動画がmylist1に登録されている状態
      mockOperations.isVideoInAnyMylist.mockResolvedValue({
        inMylist: true,
        mylistIds: ['mylist1']
      })

      render(<MylistButton video={mockVideo} />)

      // 初期化を待つ
      await waitFor(() => {
        expect(screen.queryByTestId('mylist-button-placeholder')).not.toBeInTheDocument()
      })

      // ボタンをクリックしてモーダルを表示  
      const button = screen.getByTestId('mylist-button')
      fireEvent.click(button)

      // 登録済みのマイリストをクリック
      await waitFor(() => {
        const mylistItems = screen.getAllByTestId('mylist-item-checkbox')
        const mylist1Button = mylistItems[0] // お気に入り
        fireEvent.click(mylist1Button)
      })

      // 削除関数が呼ばれることを確認
      expect(mockOperations.removeVideoFromMylist).toHaveBeenCalledWith('mylist1', 'sm12345')
    })

    it('未登録のマイリストをクリックすると追加される', async () => {
      // 動画がmylist1に登録されている状態
      mockOperations.isVideoInAnyMylist.mockResolvedValue({
        inMylist: true,
        mylistIds: ['mylist1']
      })

      render(<MylistButton video={mockVideo} />)

      // 初期化を待つ
      await waitFor(() => {
        expect(screen.queryByTestId('mylist-button-placeholder')).not.toBeInTheDocument()
      })

      // ボタンをクリックしてモーダルを表示  
      const button = screen.getByTestId('mylist-button')
      fireEvent.click(button)

      // 未登録のマイリストをクリック
      await waitFor(() => {
        const mylistItems = screen.getAllByTestId('mylist-item-checkbox')
        const mylist2Button = mylistItems[1] // 後で見る
        fireEvent.click(mylist2Button)
      })

      // 追加関数が呼ばれることを確認
      expect(mockOperations.addVideoToMylist).toHaveBeenCalledWith('mylist2', expect.objectContaining({
        id: 'sm12345',
        title: 'テスト動画'
      }))
    })
  })

  describe('モーダルの動作', () => {
    it('閉じるボタンでモーダルが閉じる', async () => {
      mockOperations.isVideoInAnyMylist.mockResolvedValue({
        inMylist: false,
        mylistIds: []
      })

      render(<MylistButton video={mockVideo} />)

      // 初期化を待つ
      await waitFor(() => {
        expect(screen.queryByTestId('mylist-button-placeholder')).not.toBeInTheDocument()
      })

      // ボタンをクリックしてモーダルを表示  
      const button = screen.getByTestId('mylist-button')
      fireEvent.click(button)

      // モーダルが表示される
      await waitFor(() => {
        expect(screen.getByRole('dialog')).toBeInTheDocument()
      })

      // 閉じるボタンをクリック（ヘッダーの×ボタン）
      const closeButton = screen.getByTestId('mylist-modal-close')
      fireEvent.click(closeButton)

      // モーダルが閉じる
      await waitFor(() => {
        expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
      })
    })

    it('複数のマイリストに登録してもモーダルは開いたまま', async () => {
      mockOperations.isVideoInAnyMylist.mockResolvedValue({
        inMylist: false,
        mylistIds: []
      })

      render(<MylistButton video={mockVideo} />)

      // 初期化を待つ
      await waitFor(() => {
        expect(screen.queryByTestId('mylist-button-placeholder')).not.toBeInTheDocument()
      })

      // ボタンをクリックしてモーダルを表示  
      const button = screen.getByTestId('mylist-button')
      fireEvent.click(button)

      // マイリストに追加
      await waitFor(() => {
        const mylistItems = screen.getAllByTestId('mylist-item-checkbox')
        const mylist1Button = mylistItems[0] // お気に入り
        fireEvent.click(mylist1Button)
      })

      // モーダルが開いたままであることを確認
      expect(screen.getByRole('dialog')).toBeInTheDocument()

      // 別のマイリストにも追加
      const mylistItems = screen.getAllByTestId('mylist-item-checkbox')
      const mylist2Button = mylistItems[1] // 後で見る
      fireEvent.click(mylist2Button)

      // モーダルがまだ開いていることを確認
      expect(screen.getByRole('dialog')).toBeInTheDocument()
    })
  })
})