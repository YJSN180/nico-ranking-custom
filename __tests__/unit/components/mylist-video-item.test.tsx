import React from 'react'
import { screen, fireEvent } from '@testing-library/react'
import { render } from '@/__tests__/test-utils'
import { describe, it, expect, vi } from 'vitest'
import { MylistVideoItem } from '@/components/mylist-video-item'
import type { MylistVideo } from '@/lib/storage/types'

// Mock OptimizedImage
vi.mock('@/components/optimized-image', () => ({
  OptimizedImage: ({ src, alt, onError, ...props }: any) => (
    <img src={src} alt={alt} onError={onError} {...props} />
  )
}))

describe('MylistVideoItem', () => {
  const mockVideo: MylistVideo = {
    id: 'sm12345',
    title: 'テスト動画タイトル',
    thumbURL: 'https://example.com/thumb.jpg',
    authorName: '投稿者名',
    authorId: '12345',
    views: 10000,
    comments: 500,
    likes: 300,
    mylists: 100,
    addedAt: Date.now(),
  }

  const mockOnEdit = vi.fn()
  const mockOnRemove = vi.fn()

  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('動画情報が正しく表示される', () => {
    render(
      <MylistVideoItem
        video={mockVideo}
        rank={1}
        onEdit={mockOnEdit}
        onRemove={mockOnRemove}
      />
    )

    // タイトル
    expect(screen.getByText('テスト動画タイトル')).toBeInTheDocument()
    
    // 投稿者
    expect(screen.getByText('投稿者名')).toBeInTheDocument()
    
    // 統計情報は削除されたため、存在しないことを確認
    expect(screen.queryByText(/▶️ 1万/)).not.toBeInTheDocument()
    expect(screen.queryByText(/💬 500/)).not.toBeInTheDocument()
    expect(screen.queryByText(/❤️ 300/)).not.toBeInTheDocument()
    expect(screen.queryByText(/📁 100/)).not.toBeInTheDocument()
  })

  it('編集ボタンをクリックするとonEditが呼ばれる', () => {
    render(
      <MylistVideoItem
        video={mockVideo}
        rank={1}
        onEdit={mockOnEdit}
        onRemove={mockOnRemove}
      />
    )

    const editButton = screen.getByText('編集')
    fireEvent.click(editButton)

    expect(mockOnEdit).toHaveBeenCalledWith(mockVideo)
  })

  it('削除ボタンをクリックするとonRemoveが呼ばれる', () => {
    render(
      <MylistVideoItem
        video={mockVideo}
        rank={1}
        onEdit={mockOnEdit}
        onRemove={mockOnRemove}
      />
    )

    const deleteButton = screen.getByText('削除')
    fireEvent.click(deleteButton)

    expect(mockOnRemove).toHaveBeenCalledWith('sm12345')
  })


  it('メモがある場合、メモが表示される', () => {
    const videoWithMemo = { ...mockVideo, memo: 'これはメモです' }
    
    render(
      <MylistVideoItem
        video={videoWithMemo}
        rank={1}
        onEdit={mockOnEdit}
        onRemove={mockOnRemove}
      />
    )

    expect(screen.getByText('これはメモです')).toBeInTheDocument()
  })

  it('順位が表示されない', () => {
    const { container } = render(
      <MylistVideoItem
        video={mockVideo}
        rank={1}
        onEdit={mockOnEdit}
        onRemove={mockOnRemove}
      />
    )

    // 順位を表示する要素が存在しないことを確認
    const rankElements = container.querySelectorAll('.mylist-video-item__rank')
    expect(rankElements.length).toBe(0)
    
    // 数字の1が表示されていないことを確認（テキストとして）
    expect(screen.queryByText('1')).not.toBeInTheDocument()
  })
  
  it('削除ボタンが赤色で表示される', () => {
    render(
      <MylistVideoItem
        video={mockVideo}
        rank={1}
        onEdit={mockOnEdit}
        onRemove={mockOnRemove}
      />
    )

    const deleteButton = screen.getByText('削除')
    // 削除ボタンが赤色のスタイルを持っていることを確認
    expect(deleteButton).toHaveClass('mylist-video-item__delete-button')
    // 色が白であることを確認
    const buttonStyle = window.getComputedStyle(deleteButton)
    expect(buttonStyle.color).toBe('rgb(255, 255, 255)') // white
  })
  
  it('編集・削除ボタンが動画ボックスの最下部に配置される', () => {
    const { container } = render(
      <MylistVideoItem
        video={mockVideo}
        rank={1}
        onEdit={mockOnEdit}
        onRemove={mockOnRemove}
      />
    )

    const content = container.querySelector('.mylist-video-item__content')
    const lastChild = content?.lastElementChild
    
    // 最後の要素がアクションエリアであることを確認
    expect(lastChild).toHaveClass('mylist-video-item__actions')
    
    // アクションエリアが動画ボックスの下部に配置されていることを確認
    const actions = container.querySelector('.mylist-video-item__actions')
    expect(actions).toHaveStyle({
      gridColumn: '1 / -1' // グリッドの全幅を使用
    })
  })

  it('追加日が編集・削除ボタンと同じ行に表示される', () => {
    const { container } = render(
      <MylistVideoItem
        video={mockVideo}
        rank={1}
        onEdit={mockOnEdit}
        onRemove={mockOnRemove}
      />
    )
    
    // アクションエリアを取得
    const actionsArea = container.querySelector('.mylist-video-item__actions')
    expect(actionsArea).toBeTruthy()
    
    // アクションエリア内に追加日が含まれることを確認
    const addedDate = actionsArea.querySelector('.mylist-video-item__added-date')
    expect(addedDate).toBeTruthy()
    expect(addedDate.textContent).toContain('追加日:')
    
    // 編集・削除ボタンも同じエリアにあることを確認
    const editButton = actionsArea.querySelector('.mylist-video-item__edit-button')
    const deleteButton = actionsArea.querySelector('.mylist-video-item__delete-button')
    expect(editButton).toBeTruthy()
    expect(deleteButton).toBeTruthy()
  })
})