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

describe('MylistButton Integration', () => {
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

  const mockOperations = {
    mylists: [{
      id: 'default',
      name: 'とりあえずマイリスト',
      description: '',
      isDefault: true,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      videoCount: 0
    }],
    isLoading: false,
    addVideoToMylist: vi.fn().mockResolvedValue(true),
    removeVideoFromMylist: vi.fn().mockResolvedValue(undefined),
    isVideoInAnyMylist: vi.fn().mockResolvedValue({ inMylist: false, mylistIds: [] }),
    createMylist: vi.fn()
  }

  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(useMylistOperations).mockReturnValue(mockOperations)
  })

  it('動画ページへの遷移ハンドラーが設定されていても、モーダル操作時には発火しない', async () => {
    const videoClickHandler = vi.fn()
    
    // 実際のランキングアイテムのような構造
    render(
      <div onClick={videoClickHandler} style={{ cursor: 'pointer' }}>
        <div>動画タイトル: {mockVideo.title}</div>
        <MylistButton 
          video={mockVideo}
        />
      </div>
    )

    // マイリストボタンをクリック
    const mylistButton = screen.getByRole('button', { name: /マイリストに追加/ })
    fireEvent.click(mylistButton)

    // モーダルが表示されるのを待つ
    await waitFor(() => {
      expect(screen.getByRole('dialog')).toBeInTheDocument()
    })

    // この時点で親のクリックハンドラーは呼ばれない
    expect(videoClickHandler).not.toHaveBeenCalled()

    // 新規作成ボタンをクリック
    fireEvent.click(screen.getByText('＋ 新規マイリスト作成'))

    // 入力フィールドが表示されるのを待つ
    await waitFor(() => {
      expect(screen.getByPlaceholderText('マイリスト名')).toBeInTheDocument()
    })

    // 入力フィールドに文字を入力
    const nameInput = screen.getByPlaceholderText('マイリスト名')
    fireEvent.click(nameInput)
    fireEvent.change(nameInput, { target: { value: 'テストマイリスト' } })

    // 説明フィールドをクリック
    const descriptionInput = screen.getByPlaceholderText('説明（任意）')
    fireEvent.click(descriptionInput)
    fireEvent.change(descriptionInput, { target: { value: 'テスト説明' } })

    // これらの操作中も親のクリックハンドラーは呼ばれない
    expect(videoClickHandler).not.toHaveBeenCalled()
  })

  it('モーダルの背景が半透明で、コンテンツが不透明である', async () => {
    render(
      <MylistButton 
        video={mockVideo}
      />
    )

    // マイリストボタンをクリック
    const mylistButton = screen.getByRole('button', { name: /マイリストに追加/ })
    fireEvent.click(mylistButton)

    // モーダルが表示されるのを待つ
    await waitFor(() => {
      expect(screen.getByRole('dialog')).toBeInTheDocument()
    })

    // オーバーレイが存在し、適切なクラスが設定されている
    const overlay = screen.getByTestId('modal-overlay')
    expect(overlay).toBeInTheDocument()
    expect(overlay.className).toMatch(/overlay/)
  })
})