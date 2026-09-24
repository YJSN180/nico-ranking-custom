import { describe, it, expect, vi, beforeAll, afterAll } from 'vitest'
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

// デスクトップは + / 🚫 を常時表示し、モバイルは ⋮ メニュー（ItemActionMenu）に
// マイリスト追加と NG 設定を集約する。どちらも onQuickNGAdd に合流する
describe('QuickNG Integration Test', () => {
  beforeAll(() => {
    // ⋮メニューのビュー切替（FLIP）は requestAnimationFrame を使う。jsdom では同期実行にする
    vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
      callback(0)
      return 0
    })
  })

  afterAll(() => {
    vi.unstubAllGlobals()
  })

  const renderComponent = (item = mockVideo, disabled = false, onQuickNGAdd?: any) => (
    render(
      <TagDisplayProvider>
        <RankingItemResponsive item={item} disabled={disabled} onQuickNGAdd={onQuickNGAdd} />
      </TagDisplayProvider>
    )
  )

  it('デスクトップ用のマイリスト・NGボタンとモバイル用の⋮メニューが表示される', () => {
    renderComponent()
    
    // デスクトップ用は 1 つずつ常時表示。モバイル用は ⋮ メニューに集約されている
    expect(screen.getAllByTestId('mylist-button')).toHaveLength(1)
    expect(screen.getAllByRole('button', { name: /ng追加/i })).toHaveLength(1)
    expect(screen.getByRole('button', { name: 'その他の操作' })).toBeInTheDocument()
  })

  it('NGボタンクリックでポップオーバーが表示される', () => {
    renderComponent()
    
    fireEvent.click(screen.getByRole('button', { name: /ng追加/i }))
    
    expect(screen.getByTestId('ng-popover')).toBeInTheDocument()
    expect(screen.getByTestId('ng-title')).toHaveTextContent('Title: Test Video Title')
  })

  it('NG追加時にonQuickNGAddが呼び出される（タイトル）', () => {
    const mockOnQuickNGAdd = vi.fn()
    renderComponent(mockVideo, false, mockOnQuickNGAdd)
    
    fireEvent.click(screen.getByRole('button', { name: /ng追加/i }))
    fireEvent.click(screen.getByTestId('ng-title'))
    
    expect(mockOnQuickNGAdd).toHaveBeenCalledWith(mockVideo, 'title', 'Test Video Title')
  })

  it('NG追加時にonQuickNGAddが呼び出される（投稿者名）', () => {
    const mockOnQuickNGAdd = vi.fn()
    renderComponent(mockVideo, false, mockOnQuickNGAdd)
    
    fireEvent.click(screen.getByRole('button', { name: /ng追加/i }))
    fireEvent.click(screen.getByTestId('ng-author'))
    
    expect(mockOnQuickNGAdd).toHaveBeenCalledWith(mockVideo, 'author', 'Test Author')
  })

  it('NG追加時にonQuickNGAddが呼び出される（投稿者ID）', () => {
    const mockOnQuickNGAdd = vi.fn()
    renderComponent(mockVideo, false, mockOnQuickNGAdd)
    
    fireEvent.click(screen.getByRole('button', { name: /ng追加/i }))
    fireEvent.click(screen.getByTestId('ng-author-id'))
    
    expect(mockOnQuickNGAdd).toHaveBeenCalledWith(mockVideo, 'authorId', 'user123')
  })

  it('disabled状態でNGボタンと⋮メニューも無効化される', () => {
    renderComponent(mockVideo, true)
    
    expect(screen.getByRole('button', { name: /ng追加/i })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'その他の操作' })).toBeDisabled()
  })

  it('操作ボタンがそれぞれのエリアに配置される', () => {
    renderComponent()
    
    // デスクトップ用: マイリストボタンと NG ボタンが同じエリアに並ぶ
    const desktopArea = screen.getByRole('button', { name: /ng追加/i }).closest('.ranking-item-responsive__mylist-area')
    expect(desktopArea).toBeInTheDocument()
    expect(desktopArea).toContainElement(screen.getByTestId('mylist-button'))
    
    // モバイル用: ⋮ メニューはタイトル行のメニュー枠に置かれる
    const menuArea = screen.getByRole('button', { name: 'その他の操作' }).closest('.ranking-item-responsive__menu')
    expect(menuArea).toBeInTheDocument()
  })

  it('⋮メニューからもマイリスト追加とNG設定ができる', () => {
    const mockOnQuickNGAdd = vi.fn()
    renderComponent(mockVideo, false, mockOnQuickNGAdd)
    
    fireEvent.click(screen.getByRole('button', { name: 'その他の操作' }))
    
    // メニュー内にマイリスト追加が現れる（デスクトップ用と合わせて 2 つ）
    expect(screen.getByRole('menu')).toBeInTheDocument()
    expect(screen.getAllByTestId('mylist-button')).toHaveLength(2)
    
    // NG設定 → タイトルで NG 追加
    fireEvent.click(screen.getByRole('button', { name: 'NG設定' }))
    fireEvent.click(screen.getByTestId('menu-ng-title'))
    
    expect(mockOnQuickNGAdd).toHaveBeenCalledWith(mockVideo, 'title', 'Test Video Title')
    // 選択後はメニューが閉じる
    expect(screen.queryByRole('menu')).not.toBeInTheDocument()
  })
})
