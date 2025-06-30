import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { MylistVideoItem } from '@/components/mylist-video-item'
import type { MylistVideo } from '@/lib/storage/types'

describe('MylistVideoItem - 削除済み動画の表示', () => {
  const mockOnEdit = vi.fn()
  const mockOnRemove = vi.fn()
  const mockOnImageError = vi.fn()

  const deletedVideo: MylistVideo = {
    id: 'sm99999',
    mylistId: 'test-mylist',
    title: '【削除済み】テスト動画',
    thumbURL: '/cantwatch.jpg', // 削除済み動画用のサムネイル
    addedAt: Date.now(),
    memo: 'この動画は削除されました',
    authorName: '投稿者名',
    authorId: 'user123',
    registeredAt: '2024-01-01T00:00:00Z',
  }

  const normalVideo: MylistVideo = {
    id: 'sm12345',
    mylistId: 'test-mylist',
    title: '通常の動画',
    thumbURL: 'https://example.com/thumb.jpg',
    addedAt: Date.now(),
    authorName: '投稿者名',
    authorId: 'user123',
    registeredAt: '2024-01-01T00:00:00Z',
  }

  it('削除済み動画の場合、特別な表示になる', () => {
    render(
      <MylistVideoItem
        video={deletedVideo}
        rank={1}
        onEdit={mockOnEdit}
        onRemove={mockOnRemove}
        isDeleted={true}
      />
    )

    // 削除済みメッセージが表示される
    expect(screen.getByText('この動画は削除されたか、非公開になっています')).toBeInTheDocument()

    // タイトルに視聴できませんバッジが表示される
    expect(screen.getByText('（視聴できません）')).toBeInTheDocument()

    // タイトルがリンクではなくテキストとして表示される
    const titleElement = screen.getByText(deletedVideo.title)
    expect(titleElement.tagName).not.toBe('A')
    expect(titleElement).toHaveClass('mylist-video-item__title--deleted')
  })

  it('削除済み動画のサムネイルは半透明になる', () => {
    render(
      <MylistVideoItem
        video={deletedVideo}
        rank={1}
        onEdit={mockOnEdit}
        onRemove={mockOnRemove}
        isDeleted={true}
      />
    )

    const thumbnail = screen.getByAltText(deletedVideo.title)
    expect(thumbnail).toHaveStyle({ opacity: '0.7' })
  })

  it('削除済み動画はクリックしても動画ページに遷移しない', () => {
    render(
      <MylistVideoItem
        video={deletedVideo}
        rank={1}
        onEdit={mockOnEdit}
        onRemove={mockOnRemove}
        isDeleted={true}
      />
    )

    // window.openのモック
    const mockOpen = vi.fn()
    window.open = mockOpen

    // 動画アイテムをクリック
    const videoItem = screen.getByTestId('mylist-video-item')
    fireEvent.click(videoItem)

    // window.openが呼ばれない
    expect(mockOpen).not.toHaveBeenCalled()
  })

  it('削除済み動画でも編集・削除ボタンは機能する', () => {
    render(
      <MylistVideoItem
        video={deletedVideo}
        rank={1}
        onEdit={mockOnEdit}
        onRemove={mockOnRemove}
        isDeleted={true}
      />
    )

    // 編集ボタンをクリック
    const editButton = screen.getByText('編集')
    fireEvent.click(editButton)
    expect(mockOnEdit).toHaveBeenCalledWith(deletedVideo)

    // 削除ボタンをクリック
    const deleteButton = screen.getByText('削除')
    fireEvent.click(deleteButton)
    expect(mockOnRemove).toHaveBeenCalledWith(deletedVideo.id)
  })

  it('通常の動画は通常通り表示される', () => {
    render(
      <MylistVideoItem
        video={normalVideo}
        rank={1}
        onEdit={mockOnEdit}
        onRemove={mockOnRemove}
        isDeleted={false}
      />
    )

    // 削除済みメッセージが表示されない
    expect(screen.queryByText('この動画は削除されたか、非公開になっています')).not.toBeInTheDocument()

    // タイトルがリンクとして表示される
    const titleLink = screen.getByTestId('video-title')
    expect(titleLink.tagName).toBe('A')
    expect(titleLink).toHaveAttribute('href', `https://www.nicovideo.jp/watch/${normalVideo.id}`)
  })

  it('削除済み動画のサムネイルにcantwatch.jpgが使用される', () => {
    render(
      <MylistVideoItem
        video={deletedVideo}
        rank={1}
        onEdit={mockOnEdit}
        onRemove={mockOnRemove}
        isDeleted={true}
      />
    )

    const thumbnail = screen.getByAltText(deletedVideo.title)
    expect(thumbnail).toHaveAttribute('src', '/cantwatch.jpg')
  })

  it('削除済み動画の投稿者情報は表示されない', () => {
    render(
      <MylistVideoItem
        video={deletedVideo}
        rank={1}
        onEdit={mockOnEdit}
        onRemove={mockOnRemove}
        isDeleted={true}
      />
    )

    // 投稿者名が表示されない（削除済みの場合）
    expect(screen.queryByText(deletedVideo.authorName!)).not.toBeInTheDocument()
  })
})