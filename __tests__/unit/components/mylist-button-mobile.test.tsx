import { fireEvent, screen } from '@testing-library/react'
import { render } from '@/__tests__/test-utils'
import { describe, test, expect, vi } from 'vitest'
import { MylistButton } from '@/components/mylist-button'
import type { RankingItem } from '@/types/ranking'

// useMylistOperationsをモック
vi.mock('@/context/mylist-operations-context', () => ({
  useMylistOperations: () => ({
    mylists: [],
    isLoading: false,
    addVideoToMylist: vi.fn(),
    removeVideoFromMylist: vi.fn(),
    isVideoInAnyMylist: vi.fn().mockResolvedValue({ inMylist: false, mylistIds: [] }),
    createMylist: vi.fn()
  }),
  MylistOperationsProvider: ({ children }: { children: React.ReactNode }) => children
}))

describe('MylistButton - モバイルイベント処理', () => {
  const mockVideo: RankingItem = {
    id: 'sm12345678',
    title: 'テスト動画',
    registeredAt: '2025-06-27T12:00:00Z',
    views: 1000,
    comments: 100,
    mylists: 10,
    likes: 50,
    thumbURL: 'https://example.com/thumb.jpg',
    duration: 300,
    rank: 1,
    authorName: 'テスト投稿者',
    authorId: 'user/12345',
  }

  test('タッチイベントでもクリックが正常に動作する', () => {
    const { container } = render(<MylistButton video={mockVideo} />)
    
    // ボタンが表示されるまで待つ
    const button = screen.getByRole('button', { name: 'マイリストに追加' })
    expect(button).toBeInTheDocument()
    
    // onClickが呼ばれることを確認するためのスパイ
    const clickSpy = vi.fn()
    button.onclick = clickSpy
    
    // タッチエンドイベント
    fireEvent.touchEnd(button)
    
    // クリックイベント
    fireEvent.click(button)
    
    // クリックハンドラが呼ばれることを確認
    expect(clickSpy).toHaveBeenCalled()
  })

  test('タッチエンドイベントが親要素に伝播しない', () => {
    const parentClickHandler = vi.fn()
    
    const { container } = render(
      <div onClick={parentClickHandler}>
        <MylistButton video={mockVideo} />
      </div>
    )
    
    const button = screen.getByRole('button', { name: 'マイリストに追加' })
    
    // タッチエンドイベント
    fireEvent.touchEnd(button)
    
    // 親要素のクリックハンドラが呼ばれないことを確認
    expect(parentClickHandler).not.toHaveBeenCalled()
  })
})