import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import RankingItemResponsive from '../../components/ranking-item-responsive'
import { TagDisplayProvider } from '../../contexts/tag-display-context'
import type { RankingItem } from '../../types/ranking'

// Mock dependencies
vi.mock('../../components/mylist-button', () => ({
  MylistButton: ({ video }: any) => (
    <button data-testid="mylist-button">+</button>
  )
}))

vi.mock('../../components/popover-ng-selector', () => ({
  PopoverNGSelector: ({ video, isOpen, onClose, onAdd }: any) => 
    isOpen ? (
      <div data-testid="ng-popover">
        <button data-testid="ng-title" onClick={() => onAdd('title', video.title)}>
          Title: {video.title}
        </button>
        <button data-testid="ng-author" onClick={() => onAdd('author', video.authorName)}>
          Author: {video.authorName}
        </button>
        <button data-testid="ng-author-id" onClick={() => onAdd('authorId', video.authorId)}>
          Author ID: {video.authorId}
        </button>
        <button data-testid="ng-close" onClick={onClose}>
          Close
        </button>
      </div>
    ) : null
}))

vi.mock('../../components/optimized-image', () => ({
  OptimizedImage: ({ alt }: any) => <img alt={alt} />
}))

const mockVideo: RankingItem = {
  rank: 1,
  id: 'sm12345',
  title: 'Test Video Title',
  thumbURL: 'https://example.com/thumb.jpg',
  views: 1000,
  comments: 100,
  mylists: 50,
  likes: 30,
  authorId: 'user123',
  authorName: 'Test Author',
  registeredAt: '2025-01-01T00:00:00Z',
  tagDetails: [
    { name: 'ゲーム', isLocked: true },
    { name: '実況プレイ', isLocked: false }
  ]
}

// Mock localStorage
const mockLocalStorage = {
  getItem: vi.fn(() => '[]'),
  setItem: vi.fn(),
  removeItem: vi.fn(),
  clear: vi.fn()
}
Object.defineProperty(window, 'localStorage', {
  value: mockLocalStorage
})

describe('QuickNG Integration Test', () => {
  const renderComponent = (item = mockVideo, disabled = false, onQuickNGAdd?: any) => (
    render(
      <TagDisplayProvider>
        <RankingItemResponsive item={item} disabled={disabled} onQuickNGAdd={onQuickNGAdd} />
      </TagDisplayProvider>
    )
  )

  it('マイリストボタンとNGボタンが両方表示される', () => {
    renderComponent()
    
    // レスポンシブレイアウトで2つのマイリストボタンが存在する（モバイル用・デスクトップ用）
    const mylistButtons = screen.getAllByTestId('mylist-button')
    expect(mylistButtons).toHaveLength(2)
    
    // NGボタンも2つ存在する（モバイル用・デスクトップ用）
    const ngButtons = screen.getAllByRole('button', { name: /ng追加/i })
    expect(ngButtons).toHaveLength(2)
  })

  it('NGボタンクリックでポップオーバーが表示される', () => {
    renderComponent()
    
    const ngButtons = screen.getAllByRole('button', { name: /ng追加/i })
    const ngButton = ngButtons[0] // 最初のNGボタンをテスト
    fireEvent.click(ngButton)
    
    expect(screen.getByTestId('ng-popover')).toBeInTheDocument()
    expect(screen.getByTestId('ng-title')).toHaveTextContent('Title: Test Video Title')
  })

  it('NG追加時にonQuickNGAddが呼び出される（タイトル）', () => {
    const mockOnQuickNGAdd = vi.fn()
    renderComponent(mockVideo, false, mockOnQuickNGAdd)
    
    const ngButtons = screen.getAllByRole('button', { name: /ng追加/i })
    const ngButton = ngButtons[0] // 最初のNGボタンをテスト
    fireEvent.click(ngButton)
    
    const titleButton = screen.getByTestId('ng-title')
    fireEvent.click(titleButton)
    
    expect(mockOnQuickNGAdd).toHaveBeenCalledWith(mockVideo, 'title', 'Test Video Title')
  })

  it('NG追加時にonQuickNGAddが呼び出される（投稿者名）', () => {
    const mockOnQuickNGAdd = vi.fn()
    renderComponent(mockVideo, false, mockOnQuickNGAdd)
    
    const ngButtons = screen.getAllByRole('button', { name: /ng追加/i })
    const ngButton = ngButtons[0] // 最初のNGボタンをテスト
    fireEvent.click(ngButton)
    
    const authorButton = screen.getByTestId('ng-author')
    fireEvent.click(authorButton)
    
    expect(mockOnQuickNGAdd).toHaveBeenCalledWith(mockVideo, 'author', 'Test Author')
  })

  it('NG追加時にonQuickNGAddが呼び出される（投稿者ID）', () => {
    const mockOnQuickNGAdd = vi.fn()
    renderComponent(mockVideo, false, mockOnQuickNGAdd)
    
    const ngButtons = screen.getAllByRole('button', { name: /ng追加/i })
    const ngButton = ngButtons[0] // 最初のNGボタンをテスト
    fireEvent.click(ngButton)
    
    const authorIdButton = screen.getByTestId('ng-author-id')
    fireEvent.click(authorIdButton)
    
    expect(mockOnQuickNGAdd).toHaveBeenCalledWith(mockVideo, 'authorId', 'user123')
  })

  it('disabled状態でNGボタンも無効化される', () => {
    renderComponent(mockVideo, true)
    
    const ngButtons = screen.getAllByRole('button', { name: /ng追加/i })
    // 両方のNGボタンが無効化されていることを確認
    ngButtons.forEach(ngButton => {
      expect(ngButton).toBeDisabled()
    })
  })

  it('マイリストエリアにCSSクラスが適用される', () => {
    renderComponent()
    
    // 両方のNGボタンが適切なエリアに配置されていることを検証
    const ngButtons = screen.getAllByRole('button', { name: /ng追加/i })
    
    // 最初のNGボタン（モバイル用）
    const mobileButton = ngButtons[0]
    const mobileArea = mobileButton.closest('.ranking-item-responsive__mylist-button')
    expect(mobileArea).toBeInTheDocument()
    expect(mobileArea).toHaveClass('ranking-item-responsive__mylist-button')
    
    // 2番目のNGボタン（デスクトップ用）
    const desktopButton = ngButtons[1]
    const desktopArea = desktopButton.closest('.ranking-item-responsive__mylist-area')
    expect(desktopArea).toBeInTheDocument()
    expect(desktopArea).toHaveClass('ranking-item-responsive__mylist-area')
  })
})