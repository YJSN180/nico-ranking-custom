import React from 'react'
import { render, screen, fireEvent } from '@testing-library/react'
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
    
    // 統計情報
    expect(screen.getByText(/▶️ 1万/)).toBeInTheDocument()
    expect(screen.getByText(/💬 500/)).toBeInTheDocument()
    expect(screen.getByText(/❤️ 300/)).toBeInTheDocument()
    expect(screen.getByText(/📁 100/)).toBeInTheDocument()
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

  it('削除済み動画の場合、適切に表示される', () => {
    render(
      <MylistVideoItem
        video={mockVideo}
        rank={1}
        onEdit={mockOnEdit}
        onRemove={mockOnRemove}
        isDeleted={true}
      />
    )

    // 削除済みバッジが表示される
    expect(screen.getByText('（削除済み）')).toBeInTheDocument()
    
    // 削除済みメッセージが表示される
    expect(screen.getByText('この動画は削除されたか、非公開になっています')).toBeInTheDocument()
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

  it('順位が1〜3位の場合、特別な色で表示される', () => {
    const { container } = render(
      <MylistVideoItem
        video={mockVideo}
        rank={1}
        onEdit={mockOnEdit}
        onRemove={mockOnRemove}
      />
    )

    const rankingItem = container.querySelector('.mylist-video-item')
    expect(rankingItem).toHaveStyle({
      border: '2px solid var(--rank-gold)'
    })
  })
})