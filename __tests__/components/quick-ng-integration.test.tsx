import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import RankingItemResponsive from '../../components/ranking-item-responsive'
import { TagDisplayProvider } from '../../contexts/tag-display-context'
import type { NGType } from '../../components/quick-ng-button'
import type { RankingItem } from '../../types/ranking'

// Mock dependencies
vi.mock('../../components/mylist-button', () => ({
  MylistButton: () => (
    <button data-testid="mylist-button">+</button>
  )
}))

vi.mock('../../components/optimized-image', () => ({
  OptimizedImage: ({ alt }: { alt: string }) => <img alt={alt} />
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

type QuickNGAddHandler = (video: RankingItem, type: NGType, value: string | string[]) => void

// PC は + と ⋮ を操作エリアに常時並べ、スマホは ⋮ だけ（マイリスト追加はメニュー内）。
// NG 設定は PC・スマホとも ⋮ メニュー（ItemActionMenu）に集約され、onQuickNGAdd に合流する
describe('QuickNG Integration Test', () => {
  const renderComponent = (item = mockVideo, disabled = false, onQuickNGAdd?: QuickNGAddHandler) => (
    render(
      <TagDisplayProvider>
        <RankingItemResponsive item={item} disabled={disabled} onQuickNGAdd={onQuickNGAdd} />
      </TagDisplayProvider>
    )
  )

  // ⋮ → NG設定 と進み、NG 候補のビュー（メニュー名「NGリストに追加」）を開く
  const openNGOptions = (): HTMLElement => {
    fireEvent.click(screen.getByRole('button', { name: 'その他の操作' }))
    fireEvent.click(screen.getByRole('menuitem', { name: 'NG設定' }))
    return screen.getByRole('menu', { name: 'NGリストに追加' })
  }

  it('マイリストボタンとNG設定の入口になる⋮メニューが表示される', () => {
    renderComponent()

    // マイリストボタンは 1 つ常時表示。NG は単独のボタンを持たず ⋮ メニューに集約されている
    expect(screen.getAllByTestId('mylist-button')).toHaveLength(1)
    expect(screen.queryByRole('button', { name: /ng追加/i })).not.toBeInTheDocument()
    const trigger = screen.getByRole('button', { name: 'その他の操作' })
    expect(trigger).toBeEnabled()
    expect(trigger).toHaveAttribute('aria-haspopup', 'menu')
    expect(trigger).toHaveAttribute('aria-expanded', 'false')
  })

  it('⋮メニューのNG設定でNG候補の一覧が表示される', () => {
    renderComponent()

    // 開く前は NG 候補を出さない
    expect(screen.queryByRole('menu')).not.toBeInTheDocument()

    openNGOptions()

    expect(screen.getByRole('menuitem', { name: '動画ID: sm12345' })).toBeInTheDocument()
    expect(screen.getByRole('menuitem', { name: 'タイトル: Test Video Title' })).toBeInTheDocument()
    expect(screen.getByRole('menuitem', { name: '投稿者名: Test Author' })).toBeInTheDocument()
    expect(screen.getByRole('menuitem', { name: '投稿者ID: user123' })).toBeInTheDocument()
  })

  it('NG追加時にonQuickNGAddが呼び出される（タイトル）', () => {
    const mockOnQuickNGAdd = vi.fn()
    renderComponent(mockVideo, false, mockOnQuickNGAdd)

    openNGOptions()
    fireEvent.click(screen.getByRole('menuitem', { name: 'タイトル: Test Video Title' }))

    expect(mockOnQuickNGAdd).toHaveBeenCalledWith(mockVideo, 'title', 'Test Video Title')
  })

  it('NG追加時にonQuickNGAddが呼び出される（投稿者名）', () => {
    const mockOnQuickNGAdd = vi.fn()
    renderComponent(mockVideo, false, mockOnQuickNGAdd)

    openNGOptions()
    fireEvent.click(screen.getByRole('menuitem', { name: '投稿者名: Test Author' }))

    expect(mockOnQuickNGAdd).toHaveBeenCalledWith(mockVideo, 'author', 'Test Author')
  })

  it('NG追加時にonQuickNGAddが呼び出される（投稿者ID）', () => {
    const mockOnQuickNGAdd = vi.fn()
    renderComponent(mockVideo, false, mockOnQuickNGAdd)

    openNGOptions()
    fireEvent.click(screen.getByRole('menuitem', { name: '投稿者ID: user123' }))

    expect(mockOnQuickNGAdd).toHaveBeenCalledWith(mockVideo, 'authorId', 'user123')
  })

  it('disabled状態でNG設定の入口（⋮メニュー）が無効化される', () => {
    const mockOnQuickNGAdd = vi.fn()
    renderComponent(mockVideo, true, mockOnQuickNGAdd)

    const trigger = screen.getByRole('button', { name: 'その他の操作' })
    expect(trigger).toBeDisabled()

    // 押してもメニューは開かず、NG は追加されない
    fireEvent.click(trigger)
    expect(screen.queryByRole('menu')).not.toBeInTheDocument()
    expect(mockOnQuickNGAdd).not.toHaveBeenCalled()
  })

  it('マイリストボタンと⋮メニューが同じ操作エリアに配置される', () => {
    renderComponent()

    // 操作エリアは CSS の grid-area で配置されるため、クラス名だけが安定した手がかり
    const actionArea = screen.getByRole('button', { name: 'その他の操作' }).closest<HTMLElement>('.ranking-item-responsive__mylist-area')
    expect(actionArea).toBeInTheDocument()
    expect(actionArea).toContainElement(screen.getByTestId('mylist-button'))
    expect(screen.getByTestId('ranking-item')).toContainElement(actionArea)
  })

  it('⋮メニューからもマイリスト追加とNG設定ができる', () => {
    const mockOnQuickNGAdd = vi.fn()
    renderComponent(mockVideo, false, mockOnQuickNGAdd)

    fireEvent.click(screen.getByRole('button', { name: 'その他の操作' }))

    // メニュー内にマイリスト追加が現れる（操作エリアの常時表示分と合わせて 2 つ）
    expect(screen.getByRole('menu', { name: 'その他の操作' })).toBeInTheDocument()
    expect(screen.getAllByTestId('mylist-button')).toHaveLength(2)

    // NG設定 → タイトルで NG 追加
    fireEvent.click(screen.getByRole('menuitem', { name: 'NG設定' }))
    fireEvent.click(screen.getByRole('menuitem', { name: 'タイトル: Test Video Title' }))

    expect(mockOnQuickNGAdd).toHaveBeenCalledWith(mockVideo, 'title', 'Test Video Title')
    // 選択後はメニューが閉じる
    expect(screen.queryByRole('menu')).not.toBeInTheDocument()
  })
})
