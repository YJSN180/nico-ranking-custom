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
  const renderComponent = (item = mockVideo, disabled = false) => (
    render(
      <TagDisplayProvider>
        <RankingItemResponsive item={item} disabled={disabled} />
      </TagDisplayProvider>
    )
  )

  it('マイリストボタンとNGボタンが両方表示される', () => {
    renderComponent()
    
    // レスポンシブレイアウトで2つのマイリストボタンが存在する（モバイル用・デスクトップ用）
    const mylistButtons = screen.getAllByTestId('mylist-button')
    expect(mylistButtons).toHaveLength(2)
    
    // NGボタンは1つのみ（デスクトップのmylist-areaに配置）
    expect(screen.getByRole('button', { name: /ng追加/i })).toBeInTheDocument()
  })

  it('NGボタンクリックでポップオーバーが表示される', () => {
    renderComponent()
    
    const ngButton = screen.getByRole('button', { name: /ng追加/i })
    fireEvent.click(ngButton)
    
    expect(screen.getByTestId('ng-popover')).toBeInTheDocument()
    expect(screen.getByTestId('ng-title')).toHaveTextContent('Title: Test Video Title')
  })

  it('NG追加時にコンソールログが出力される', () => {
    const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {})
    renderComponent()
    
    const ngButton = screen.getByRole('button', { name: /ng追加/i })
    fireEvent.click(ngButton)
    
    const titleButton = screen.getByTestId('ng-title')
    fireEvent.click(titleButton)
    
    expect(consoleSpy).toHaveBeenCalledWith('NG追加:', {
      type: 'title',
      value: 'Test Video Title',
      videoId: 'sm12345',
      videoTitle: 'Test Video Title'
    })
    
    consoleSpy.mockRestore()
  })

  it('disabled状態でNGボタンも無効化される', () => {
    renderComponent(mockVideo, true)
    
    const ngButton = screen.getByRole('button', { name: /ng追加/i })
    expect(ngButton).toBeDisabled()
  })

  it('マイリストエリアにCSSクラスが適用される', () => {
    renderComponent()
    
    // NGボタンが含まれるmylist-areaを検証
    const ngButton = screen.getByRole('button', { name: /ng追加/i })
    const mylistArea = ngButton.closest('.ranking-item-responsive__mylist-area')
    expect(mylistArea).toBeInTheDocument()
    expect(mylistArea).toHaveClass('ranking-item-responsive__mylist-area')
  })
})