import React from 'react'
import { screen, fireEvent, waitFor } from '@testing-library/react'
import { render } from '@/__tests__/test-utils'
import { vi, describe, it, expect, beforeEach } from 'vitest'
import { MylistButton } from '@/components/mylist-button'
import { useMylistOperations } from '@/context/mylist-operations-context'
import type { RankingItem } from '@/types/ranking'

// Mock the hooks
vi.mock('@/context/mylist-operations-context', () => ({
  useMylistOperations: vi.fn(),
  MylistOperationsProvider: ({ children }: { children: React.ReactNode }) => children
}))

describe('MylistButton - イベントバブリング防止', () => {
  const mockVideo: RankingItem = {
    id: 'sm12345678',
    rank: 1,
    title: 'テスト動画',
    views: 1000,
    comments: 100,
    mylists: 10,
    likes: 50,
    duration: 300,
    registeredAt: new Date('2025-01-27'),
    tags: ['test'],
    thumbURL: 'https://example.com/thumb.jpg',
    authorName: 'テスト投稿者',
    authorId: '123456'
  }

  const mockOperations = {
    mylists: [],
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

  it('マイリストボタンクリック時に親要素のクリックイベントが発火しない', async () => {
    const parentClickHandler = vi.fn()
    
    const { container } = render(
      <div onClick={parentClickHandler} style={{ padding: '20px' }}>
        <MylistButton video={mockVideo} />
      </div>
    )

    // ローディング完了を待つ
    await waitFor(() => {
      expect(screen.queryByTestId('mylist-button-placeholder')).not.toBeInTheDocument()
    })

    // マイリストボタンをクリック
    const button = screen.getByRole('button', { name: 'マイリストに追加' })
    fireEvent.click(button)

    // 親要素のクリックハンドラーが呼ばれていないことを確認
    expect(parentClickHandler).not.toHaveBeenCalled()
  })

  it('マイリストボタン外の親要素をクリックした場合は親のイベントが発火する', async () => {
    const parentClickHandler = vi.fn()
    
    const { container } = render(
      <div 
        onClick={parentClickHandler} 
        style={{ padding: '20px', background: 'lightgray' }}
        data-testid="parent-div"
      >
        <MylistButton video={mockVideo} />
      </div>
    )

    // ローディング完了を待つ
    await waitFor(() => {
      expect(screen.queryByTestId('mylist-button-placeholder')).not.toBeInTheDocument()
    })

    // 親要素の余白部分をクリック
    const parentDiv = screen.getByTestId('parent-div')
    fireEvent.click(parentDiv)

    // 親要素のクリックハンドラーが呼ばれたことを確認
    expect(parentClickHandler).toHaveBeenCalledTimes(1)
  })

  it('モーダル表示中も親要素のクリックイベントがブロックされる', async () => {
    const parentClickHandler = vi.fn()
    
    render(
      <div onClick={parentClickHandler}>
        <MylistButton video={mockVideo} />
      </div>
    )

    // ローディング完了を待つ
    await waitFor(() => {
      expect(screen.queryByTestId('mylist-button-placeholder')).not.toBeInTheDocument()
    })

    // マイリストボタンをクリックしてモーダルを表示
    const button = screen.getByRole('button', { name: 'マイリストに追加' })
    fireEvent.click(button)

    // モーダルが表示されることを確認
    await waitFor(() => {
      expect(screen.getByRole('dialog')).toBeInTheDocument()
    })

    // この時点でも親要素のクリックハンドラーが呼ばれていないことを確認
    expect(parentClickHandler).not.toHaveBeenCalled()
  })
})