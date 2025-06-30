import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MylistVideoItem } from '@/components/mylist-video-item'
import type { MylistVideo } from '@/lib/storage/types'

describe('MylistVideoItem Enhanced Features', () => {
  const mockVideo: MylistVideo = {
    id: 'sm12345',
    mylistId: 'test-mylist-id',
    title: 'テスト動画',
    thumbURL: 'https://example.com/thumb.jpg',
    addedAt: Date.now(),
    authorName: 'テスト投稿者',
    authorId: 'user123',
    authorIcon: 'https://example.com/icon.jpg',
    registeredAt: '2023-12-01T10:00:00Z',
    views: 1000,
    comments: 50,
    memo: 'テストメモ'
  }

  const defaultProps = {
    video: mockVideo,
    rank: 1,
    onEdit: vi.fn(),
    onRemove: vi.fn()
  }

  it('投稿者アイコンが表示される', () => {
    render(<MylistVideoItem {...defaultProps} />)
    
    const authorIcon = screen.getByAltText('テスト投稿者のアイコン')
    expect(authorIcon).toBeInTheDocument()
    expect(authorIcon).toHaveAttribute('src', 'https://example.com/icon.jpg')
  })

  it('投稿日時が表示される', () => {
    render(<MylistVideoItem {...defaultProps} />)
    
    const registeredDate = screen.getByText(/投稿: 2023\/12\/01/)
    expect(registeredDate).toBeInTheDocument()
  })

  it('投稿者アイコンがない場合は表示されない', () => {
    const videoWithoutIcon = { ...mockVideo, authorIcon: undefined }
    render(<MylistVideoItem {...defaultProps} video={videoWithoutIcon} />)
    
    const authorIcon = screen.queryByAltText(/のアイコン/)
    expect(authorIcon).not.toBeInTheDocument()
  })

  it('投稿日時がない場合は表示されない', () => {
    const videoWithoutDate = { ...mockVideo, registeredAt: undefined }
    render(<MylistVideoItem {...defaultProps} video={videoWithoutDate} />)
    
    const registeredDate = screen.queryByText(/投稿:/)
    expect(registeredDate).not.toBeInTheDocument()
  })

  it('投稿者名、アイコン、投稿日時が縦並びで表示される', () => {
    render(<MylistVideoItem {...defaultProps} />)
    
    // 投稿者名とアイコンを含む要素を確認
    const authorLink = screen.getByText('テスト投稿者').closest('a')
    expect(authorLink).toBeInTheDocument()
    
    // 投稿日時が同じリンク内にあることを確認
    const registeredDate = screen.getByText(/投稿: 2023\/12\/01/)
    expect(authorLink).toContainElement(registeredDate)
  })

  it('削除済み動画では投稿者情報が表示されない', () => {
    render(<MylistVideoItem {...defaultProps} isDeleted={true} />)
    
    const authorIcon = screen.queryByAltText(/のアイコン/)
    const registeredDate = screen.queryByText(/投稿:/)
    
    expect(authorIcon).not.toBeInTheDocument()
    expect(registeredDate).not.toBeInTheDocument()
  })
})