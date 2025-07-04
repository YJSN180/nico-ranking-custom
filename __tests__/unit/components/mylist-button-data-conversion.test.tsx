import { screen, waitFor } from '@testing-library/react'
import { render } from '@/__tests__/test-utils'
import userEvent from '@testing-library/user-event'
import { vi, describe, it, expect, beforeEach } from 'vitest'
import { MylistButton } from '@/components/mylist-button'
import { useMylistOperations } from '@/context/mylist-operations-context'
import type { RankingItem } from '@/types/ranking'

// Mock the context
vi.mock('@/context/mylist-operations-context', () => ({
  useMylistOperations: vi.fn(),
  MylistOperationsProvider: ({ children }: { children: React.ReactNode }) => children
}))

const mockUseMylistOperations = useMylistOperations as unknown as ReturnType<typeof vi.fn>

/**
 * MylistButton データ変換テスト
 * 
 * このテストは以下の修正が正しく動作することを検証します：
 * 1. authorIconフィールドの保存
 * 2. 統計情報（views, comments, mylists, likes）の正しい型変換
 * 3. RankingItem → MylistVideo への完全なデータ変換
 * 
 * 修正前の問題：
 * - Video型とMylistVideo型のフィールド名不一致
 * - authorIconフィールドが欠落
 * - 統計情報がundefinedで保存される
 */
describe('MylistButton - Data Conversion Fix', () => {
  const mockVideoWithFullData: RankingItem = {
    id: 'sm12345',
    title: 'Test Video with Full Data',
    thumbURL: 'https://example.com/thumb.jpg',
    views: 1500, // 統計情報のテスト
    comments: 75,
    mylists: 25,
    likes: 200,
    duration: 300,
    authorName: 'Test Author',
    authorId: '123456',
    authorIcon: 'https://example.com/author-icon.jpg', // 重要: authorIconのテスト
    registeredAt: '2024-01-01T00:00:00Z',
    tags: ['tag1', 'tag2'],
    rank: 1
  }

  const mockVideoWithoutAuthorIcon: RankingItem = {
    id: 'sm67890',
    title: 'Test Video without Author Icon',
    thumbURL: 'https://example.com/thumb2.jpg',
    views: 2000,
    comments: 100,
    mylists: 30,
    likes: 250,
    duration: 200,
    authorName: 'Another Author',
    authorId: '789012',
    // authorIcon: undefined（意図的に省略）
    registeredAt: '2024-01-02T00:00:00Z',
    tags: ['tag3'],
    rank: 2
  }

  const mockDefaultMylist = {
    id: 'default-mylist',
    name: 'とりあえずマイリスト',
    description: '',
    videoCount: 0,
    createdAt: Date.now(),
    updatedAt: Date.now()
  }

  let mockAddVideoToMylist: ReturnType<typeof vi.fn>

  const mockOperations = {
    mylists: [mockDefaultMylist],
    isLoading: false,
    addVideoToMylist: vi.fn(),
    removeVideoFromMylist: vi.fn(),
    isVideoInAnyMylist: vi.fn(),
    createMylist: vi.fn()
  }

  beforeEach(() => {
    vi.clearAllMocks()
    
    // 関数のモックを設定
    mockAddVideoToMylist = vi.fn().mockResolvedValue(true)
    
    // すべての操作を再定義して、新しいモックインスタンスを確実に使用
    mockOperations.addVideoToMylist = mockAddVideoToMylist
    mockOperations.removeVideoFromMylist = vi.fn().mockResolvedValue(true)
    mockOperations.isVideoInAnyMylist = vi.fn().mockImplementation(async (videoId) => {
      // デバッグ用ログ
      console.log('[Test] isVideoInAnyMylist called with:', videoId)
      return { inMylist: false, mylistIds: [] }
    })
    mockOperations.createMylist = vi.fn()
    
    // モックを返す前に再度確認
    mockUseMylistOperations.mockReturnValue(mockOperations)
    
    // クライアントサイド環境をシミュレート
    Object.defineProperty(window, '__TEST_ENV__', {
      value: true,
      writable: true
    })
  })

  describe('authorIcon フィールドの保存', () => {
    it('authorIconが存在する場合、正しく保存される', async () => {
      const user = userEvent.setup()
      
      render(<MylistButton video={mockVideoWithFullData} />)
      
      // プレースホルダーが消えて実際のボタンが表示されるまで待つ
      await waitFor(() => {
        expect(screen.queryByTestId('mylist-button-placeholder')).not.toBeInTheDocument()
      })
      
      // ボタンが正しい状態になるまで待つ（追加ボタンになるはず）
      await waitFor(() => {
        const button = screen.getByTestId('mylist-button')
        expect(button).toHaveAttribute('aria-label', 'マイリストに追加')
      })
      
      // マイリストボタンをクリック
      const button = screen.getByTestId('mylist-button')
      await user.click(button)
      
      // モーダルが表示されることを確認
      await waitFor(() => {
        expect(screen.getByTestId('mylist-modal')).toBeInTheDocument()
      })
      
      // デフォルトマイリストに追加
      const mylistItem = screen.getByTestId('mylist-item-checkbox')
      await user.click(mylistItem)
      
      // addVideoToMylistが正しいデータで呼ばれることを確認
      await waitFor(() => {
        expect(mockAddVideoToMylist).toHaveBeenCalledWith(
          'default-mylist',
          expect.objectContaining({
            id: 'sm12345',
            title: 'Test Video with Full Data',
            thumbURL: 'https://example.com/thumb.jpg',
            views: 1500,
            comments: 75,
            mylists: 25,
            likes: 200,
            authorName: 'Test Author',
            authorId: '123456',
            authorIcon: 'https://example.com/author-icon.jpg', // 重要：authorIconが保存される
            registeredAt: '2024-01-01T00:00:00Z'
          })
        )
      })
    })

    it('authorIconが存在しない場合、undefinedで保存される', async () => {
      const user = userEvent.setup()
      
      render(<MylistButton video={mockVideoWithoutAuthorIcon} />)
      
      // プレースホルダーが消えて実際のボタンが表示されるまで待つ
      await waitFor(() => {
        expect(screen.queryByTestId('mylist-button-placeholder')).not.toBeInTheDocument()
      })
      
      // ボタンが正しい状態になるまで待つ（追加ボタンになるはず）
      await waitFor(() => {
        const button = screen.getByTestId('mylist-button')
        expect(button).toHaveAttribute('aria-label', 'マイリストに追加')
      })
      
      const button = screen.getByTestId('mylist-button')
      await user.click(button)
      
      await waitFor(() => {
        expect(screen.getByTestId('mylist-modal')).toBeInTheDocument()
      })
      
      const mylistItem = screen.getByTestId('mylist-item-checkbox')
      await user.click(mylistItem)
      
      await waitFor(() => {
        expect(mockAddVideoToMylist).toHaveBeenCalledWith(
          'default-mylist',
          expect.objectContaining({
            id: 'sm67890',
            authorName: 'Another Author',
            authorId: '789012',
            authorIcon: undefined // authorIconがundefinedで保存される
          })
        )
      })
    })
  })

  describe('統計情報の型変換', () => {
    it('views, comments, mylists, likesが正しく保存される', async () => {
      const user = userEvent.setup()
      
      render(<MylistButton video={mockVideoWithFullData} />)
      
      // プレースホルダーが消えて実際のボタンが表示されるまで待つ
      await waitFor(() => {
        expect(screen.queryByTestId('mylist-button-placeholder')).not.toBeInTheDocument()
      })
      
      // ボタンが正しい状態になるまで待つ（追加ボタンになるはず）
      await waitFor(() => {
        const button = screen.getByTestId('mylist-button')
        expect(button).toHaveAttribute('aria-label', 'マイリストに追加')
      })
      
      const button = screen.getByTestId('mylist-button')
      await user.click(button)
      
      await waitFor(() => {
        expect(screen.getByTestId('mylist-modal')).toBeInTheDocument()
      })
      
      const mylistItem = screen.getByTestId('mylist-item-checkbox')
      await user.click(mylistItem)
      
      await waitFor(() => {
        expect(mockAddVideoToMylist).toHaveBeenCalledWith(
          'default-mylist',
          expect.objectContaining({
            // 修正前は Video.viewCount → MylistVideo.views で変換失敗
            // 修正後は RankingItem.views → MylistVideo.views で直接マッピング
            views: 1500,
            comments: 75,
            mylists: 25,
            likes: 200
          })
        )
      })
    })

    it('統計情報がundefinedの場合、デフォルト値で保存される', async () => {
      const incompleteVideo: RankingItem = {
        ...mockVideoWithFullData,
        views: undefined,
        comments: undefined,
        mylists: undefined,
        likes: undefined
      }
      
      const user = userEvent.setup()
      
      render(<MylistButton video={incompleteVideo} />)
      
      // プレースホルダーが消えて実際のボタンが表示されるまで待つ
      await waitFor(() => {
        expect(screen.queryByTestId('mylist-button-placeholder')).not.toBeInTheDocument()
      })
      
      // ボタンが正しい状態になるまで待つ（追加ボタンになるはず）
      await waitFor(() => {
        const button = screen.getByTestId('mylist-button')
        expect(button).toHaveAttribute('aria-label', 'マイリストに追加')
      })
      
      const button = screen.getByTestId('mylist-button')
      await user.click(button)
      
      await waitFor(() => {
        expect(screen.getByTestId('mylist-modal')).toBeInTheDocument()
      })
      
      const mylistItem = screen.getByTestId('mylist-item-checkbox')
      await user.click(mylistItem)
      
      await waitFor(() => {
        expect(mockAddVideoToMylist).toHaveBeenCalledWith(
          'default-mylist',
          expect.objectContaining({
            views: 0, // デフォルト値
            comments: 0,
            mylists: 0,
            likes: 0
          })
        )
      })
    })
  })

  describe('完全なデータ変換の検証', () => {
    it('RankingItemの全フィールドが正しくMylistVideo形式に変換される', async () => {
      const user = userEvent.setup()
      
      render(<MylistButton video={mockVideoWithFullData} />)
      
      // プレースホルダーが消えて実際のボタンが表示されるまで待つ
      await waitFor(() => {
        expect(screen.queryByTestId('mylist-button-placeholder')).not.toBeInTheDocument()
      })
      
      // ボタンが正しい状態になるまで待つ（追加ボタンになるはず）
      await waitFor(() => {
        const button = screen.getByTestId('mylist-button')
        expect(button).toHaveAttribute('aria-label', 'マイリストに追加')
      })
      
      const button = screen.getByTestId('mylist-button')
      await user.click(button)
      
      await waitFor(() => {
        expect(screen.getByTestId('mylist-modal')).toBeInTheDocument()
      })
      
      const mylistItem = screen.getByTestId('mylist-item-checkbox')
      await user.click(mylistItem)
      
      // 完全なデータ構造の検証
      await waitFor(() => {
        expect(mockAddVideoToMylist).toHaveBeenCalledWith(
          'default-mylist',
          {
            id: 'sm12345',
            title: 'Test Video with Full Data',
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
        )
      })
    })

    it('MylistVideo型として無効なフィールドは除外される', async () => {
      const user = userEvent.setup()
      
      render(<MylistButton video={mockVideoWithFullData} />)
      
      // プレースホルダーが消えて実際のボタンが表示されるまで待つ
      await waitFor(() => {
        expect(screen.queryByTestId('mylist-button-placeholder')).not.toBeInTheDocument()
      })
      
      // ボタンが正しい状態になるまで待つ（追加ボタンになるはず）
      await waitFor(() => {
        const button = screen.getByTestId('mylist-button')
        expect(button).toHaveAttribute('aria-label', 'マイリストに追加')
      })
      
      const button = screen.getByTestId('mylist-button')
      await user.click(button)
      
      await waitFor(() => {
        expect(screen.getByTestId('mylist-modal')).toBeInTheDocument()
      })
      
      const mylistItem = screen.getByTestId('mylist-item-checkbox')
      await user.click(mylistItem)
      
      await waitFor(() => {
        const calledData = mockAddVideoToMylist.mock.calls[0][1]
        
        // MylistVideo型に含まれないフィールドが除外されることを確認
        expect(calledData).not.toHaveProperty('duration')
        expect(calledData).not.toHaveProperty('tags')
        expect(calledData).not.toHaveProperty('rank')
        
        // 必要なフィールドは含まれることを確認
        expect(calledData).toHaveProperty('id')
        expect(calledData).toHaveProperty('title')
        expect(calledData).toHaveProperty('thumbURL')
        expect(calledData).toHaveProperty('views')
        expect(calledData).toHaveProperty('authorIcon')
      })
    })
  })

  describe('型の整合性テスト', () => {
    it('addVideoToMylistにPartial<MylistVideo>型が渡される', async () => {
      const user = userEvent.setup()
      
      render(<MylistButton video={mockVideoWithFullData} />)
      
      // プレースホルダーが消えて実際のボタンが表示されるまで待つ
      await waitFor(() => {
        expect(screen.queryByTestId('mylist-button-placeholder')).not.toBeInTheDocument()
      })
      
      // ボタンが正しい状態になるまで待つ（追加ボタンになるはず）
      await waitFor(() => {
        const button = screen.getByTestId('mylist-button')
        expect(button).toHaveAttribute('aria-label', 'マイリストに追加')
      })
      
      const button = screen.getByTestId('mylist-button')
      await user.click(button)
      
      await waitFor(() => {
        expect(screen.getByTestId('mylist-modal')).toBeInTheDocument()
      })
      
      const mylistItem = screen.getByTestId('mylist-item-checkbox')
      await user.click(mylistItem)
      
      await waitFor(() => {
        expect(mockAddVideoToMylist).toHaveBeenCalledTimes(1)
        
        const [mylistId, videoData] = mockAddVideoToMylist.mock.calls[0]
        
        // 正しい型で呼ばれることを確認
        expect(typeof mylistId).toBe('string')
        expect(typeof videoData).toBe('object')
        expect(videoData).not.toBeNull()
        
        // MylistVideo構造であることを確認
        expect(videoData).toMatchObject({
          id: expect.any(String),
          title: expect.any(String),
          thumbURL: expect.any(String),
          views: expect.any(Number),
          comments: expect.any(Number),
          mylists: expect.any(Number),
          likes: expect.any(Number),
          authorName: expect.any(String),
          authorId: expect.any(String)
        })
      })
    })
  })
})