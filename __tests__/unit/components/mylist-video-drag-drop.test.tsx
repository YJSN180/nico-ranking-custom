import React from 'react'
import { screen, fireEvent } from '@testing-library/react'
import { render } from '@/__tests__/test-utils'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { MylistDetailClient } from '@/app/mylists/[id]/mylist-detail-client'
import { MylistManager } from '@/lib/storage/mylists'
import type { MylistVideo } from '@/lib/storage/types'

// Mock next/navigation
// Navigation mock is provided by global setup in vitest.setup.ts

// Mock storage managers
vi.mock('@/lib/storage/db-manager', () => ({
  DBManager: vi.fn().mockImplementation(() => ({
    init: vi.fn().mockResolvedValue(undefined),
  })),
}))

vi.mock('@/lib/storage/mylists', () => ({
  MylistManager: vi.fn().mockImplementation(() => ({
    getMylist: vi.fn().mockResolvedValue({
      id: 'test-mylist-id',
      name: 'テストマイリスト',
      videoCount: 3,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    }),
    getVideosInMylistWithOrder: vi.fn().mockResolvedValue([
      {
        id: 'sm1',
        mylistId: 'test-mylist-id',
        title: '動画1',
        thumbURL: 'https://example.com/thumb1.jpg',
        authorName: '投稿者1',
        views: 1000,
        addedAt: Date.now(),
        orderIndex: 0,
      },
      {
        id: 'sm2',
        mylistId: 'test-mylist-id',
        title: '動画2',
        thumbURL: 'https://example.com/thumb2.jpg',
        authorName: '投稿者2',
        views: 2000,
        addedAt: Date.now(),
        orderIndex: 1,
      },
      {
        id: 'sm3',
        mylistId: 'test-mylist-id',
        title: '動画3',
        thumbURL: 'https://example.com/thumb3.jpg',
        authorName: '投稿者3',
        views: 3000,
        addedAt: Date.now(),
        orderIndex: 2,
      },
    ]),
    searchVideosInMylist: vi.fn(),
    updateVideoOrder: vi.fn().mockResolvedValue(undefined),
  })),
}))

describe.skip('MylistDetailClient ドラッグ＆ドロップ', () => {
  // TODO: 現在の実装ではドラッグ＆ドロップ機能がサポートされていないため、スキップ
  // 将来的にマイリスト内の動画並び替え機能を実装する場合は、これらのテストを有効化する
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('並び替えモードで動画アイテムがドラッグ可能である', async () => {
    render(<MylistDetailClient />)
    
    // 読み込み完了を待つ
    await screen.findByText('テストマイリスト')
    
    // 並び替えモードを有効化
    const reorderButton = screen.getByTestId('toggle-reorder-mode')
    fireEvent.click(reorderButton)
    
    // li要素を直接探す（ulの子要素として）
    const ul = screen.getByRole('list')
    const liElements = ul.querySelectorAll('li')
    expect(liElements).toHaveLength(3)
    
    // li要素がドラッグ可能であることを確認
    liElements.forEach(li => {
      expect(li).toHaveAttribute('draggable', 'true')
    })
  })

  it('並び替えモードでドラッグハンドルが表示される', async () => {
    render(<MylistDetailClient />)
    
    await screen.findByText('テストマイリスト')
    
    // 並び替えモードを有効化
    const reorderButton = screen.getByTestId('toggle-reorder-mode')
    fireEvent.click(reorderButton)
    
    // ドラッグハンドルが各動画に表示されることを確認
    const dragHandles = screen.getAllByTestId('drag-handle')
    expect(dragHandles).toHaveLength(3)
  })

  it('ドラッグ開始時にドラッグ状態が設定される', async () => {
    render(<MylistDetailClient />)
    
    await screen.findByText('テストマイリスト')
    
    // 並び替えモードを有効化
    const reorderButton = screen.getByTestId('toggle-reorder-mode')
    fireEvent.click(reorderButton)
    
    const ul = screen.getByRole('list')
    const firstLi = ul.querySelector('li')
    
    // ドラッグ開始
    fireEvent.dragStart(firstLi, {
      dataTransfer: {
        setData: vi.fn(),
        effectAllowed: 'move',
      },
    })
    
    // ドラッグ中のクラスが適用されることを確認
    expect(firstLi).toHaveClass('dragging')
  })

  it('ドラッグオーバー時にドロップ可能位置が表示される', async () => {
    render(<MylistDetailClient />)
    
    await screen.findByText('テストマイリスト')
    
    // 並び替えモードを有効化
    const reorderButton = screen.getByTestId('toggle-reorder-mode')
    fireEvent.click(reorderButton)
    
    const ul = screen.getByRole('list')
    const liElements = ul.querySelectorAll('li')
    const firstLi = liElements[0]
    const secondLi = liElements[1]
    
    // 最初の動画をドラッグ開始
    fireEvent.dragStart(firstLi, {
      dataTransfer: {
        setData: vi.fn(),
        effectAllowed: 'move',
      },
    })
    
    // 2番目の動画にドラッグオーバー
    fireEvent.dragOver(secondLi, {
      dataTransfer: {
        effectAllowed: 'move',
      },
      preventDefault: vi.fn(),
    })
    
    // ドロップ可能インジケーターが表示されることを確認
    expect(secondLi).toHaveClass('drag-over')
  })

  it('ドロップ時に動画の順序が更新される', async () => {
    const mockUpdateVideoOrder = vi.fn().mockResolvedValue(undefined)
    
    vi.mocked(MylistManager).mockImplementation(() => ({
      getMylist: vi.fn().mockResolvedValue({
        id: 'test-mylist-id',
        name: 'テストマイリスト',
        videoCount: 3,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      }),
      getVideosInMylistWithOrder: vi.fn().mockResolvedValue([
        { id: 'sm1', mylistId: 'test-mylist-id', title: '動画1', thumbURL: 'https://example.com/thumb1.jpg', orderIndex: 0, addedAt: Date.now() },
        { id: 'sm2', mylistId: 'test-mylist-id', title: '動画2', thumbURL: 'https://example.com/thumb2.jpg', orderIndex: 1, addedAt: Date.now() },
        { id: 'sm3', mylistId: 'test-mylist-id', title: '動画3', thumbURL: 'https://example.com/thumb3.jpg', orderIndex: 2, addedAt: Date.now() },
      ]),
      searchVideosInMylist: vi.fn(),
      updateVideoOrder: mockUpdateVideoOrder,
    }))
    
    render(<MylistDetailClient />)
    
    await screen.findByText('テストマイリスト')
    
    // 並び替えモードを有効化
    const reorderButton = screen.getByTestId('toggle-reorder-mode')
    fireEvent.click(reorderButton)
    
    const ul = screen.getByRole('list')
    const liElements = ul.querySelectorAll('li')
    const firstLi = liElements[0]
    const thirdLi = liElements[2]
    
    // 最初の動画をドラッグ開始
    fireEvent.dragStart(firstLi, {
      dataTransfer: {
        setData: vi.fn(),
        effectAllowed: 'move',
      },
    })
    
    // 3番目の動画にドロップ
    fireEvent.drop(thirdLi, {
      dataTransfer: {
        getData: vi.fn().mockReturnValue('0'), // 最初の動画のインデックス
      },
      preventDefault: vi.fn(),
    })
    
    // 順序更新関数が呼ばれることを確認
    expect(mockUpdateVideoOrder).toHaveBeenCalledWith('test-mylist-id', [
      { id: 'sm2', orderIndex: 0 },
      { id: 'sm3', orderIndex: 1 },
      { id: 'sm1', orderIndex: 2 },
    ])
  })

  it('並び替えモードの切り替えボタンが表示される', async () => {
    render(<MylistDetailClient />)
    
    await screen.findByText('テストマイリスト')
    
    // 並び替えモード切り替えボタンが存在することを確認
    const reorderButton = screen.getByTestId('toggle-reorder-mode')
    expect(reorderButton).toBeInTheDocument()
    expect(reorderButton).toHaveTextContent('並び替え')
  })

  it('並び替えモードでのみドラッグ可能', async () => {
    render(<MylistDetailClient />)
    
    await screen.findByText('テストマイリスト')
    
    const reorderButton = screen.getByTestId('toggle-reorder-mode')
    const ul = screen.getByRole('list')
    const liElements = ul.querySelectorAll('li')
    
    // 初期状態ではドラッグ不可
    liElements.forEach(li => {
      expect(li).toHaveAttribute('draggable', 'false')
    })
    
    // 並び替えモードを有効化
    fireEvent.click(reorderButton)
    
    // ドラッグ可能になることを確認
    liElements.forEach(li => {
      expect(li).toHaveAttribute('draggable', 'true')
    })
  })
})