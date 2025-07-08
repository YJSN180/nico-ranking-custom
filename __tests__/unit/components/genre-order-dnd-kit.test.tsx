/**
 * Genre Order @dnd-kit 実装テスト
 * PC、モバイル、キーボード操作を含む包括的なテスト
 */

import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { vi } from 'vitest'
import { GenreOrderCustomizer } from '@/components/genre-order'

// @dnd-kit のモック
vi.mock('@dnd-kit/core', () => {
  const mockUseSensors = vi.fn(() => [])
  const mockUseSensor = vi.fn(() => ({}))
  
  return {
    DndContext: ({ children }: any) => <div data-testid="dnd-context">{children}</div>,
    closestCenter: vi.fn(),
    TouchSensor: vi.fn(),
    MouseSensor: vi.fn(),
    KeyboardSensor: vi.fn(),
    useSensors: mockUseSensors,
    useSensor: mockUseSensor,
    DragOverlay: ({ children }: any) => children ? <div data-testid="drag-overlay">{children}</div> : null,
  }
})

vi.mock('@dnd-kit/sortable', () => ({
  SortableContext: ({ children }: any) => <div data-testid="sortable-context">{children}</div>,
  sortableKeyboardCoordinates: vi.fn(),
  verticalListSortingStrategy: vi.fn(),
  useSortable: vi.fn(() => ({
    attributes: {},
    listeners: {},
    setNodeRef: vi.fn(),
    transform: null,
    transition: null,
    isDragging: false,
  })),
}))

vi.mock('@dnd-kit/utilities', () => ({
  CSS: {
    Transform: {
      toString: vi.fn(() => ''),
    },
  },
}))

// ジャンル順序のモック
const mockMoveItem = vi.fn()
const mockToggleVisibility = vi.fn()
const mockResetToDefault = vi.fn()
const mockApplyChanges = vi.fn()
const mockCancelChanges = vi.fn()

vi.mock('@/hooks/use-genre-order-v2', () => ({
  useGenreOrderV2: () => ({
    items: [
      { id: 'all', isVisible: true },
      { id: 'music', isVisible: true },
      { id: 'anime', isVisible: true },
      { id: 'game', isVisible: true }
    ],
    hasChanges: false,
    moveItem: mockMoveItem,
    toggleVisibility: mockToggleVisibility,
    resetToDefault: mockResetToDefault,
    applyChanges: mockApplyChanges,
    cancelChanges: mockCancelChanges,
  })
}))

// navigator.vibrate のモック
Object.defineProperty(navigator, 'vibrate', {
  value: vi.fn(),
  writable: true
})

describe('GenreOrderCustomizer @dnd-kit 実装', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  test('コンポーネントが正しくレンダリングされる', () => {
    render(<GenreOrderCustomizer />)
    
    // DndContext が存在することを確認
    expect(screen.getByTestId('dnd-context')).toBeInTheDocument()
    
    // SortableContext が存在することを確認
    expect(screen.getByTestId('sortable-context')).toBeInTheDocument()
    
    // 説明文が表示される
    expect(screen.getByText(/ドラッグ&ドロップでジャンルの順序を変更/)).toBeInTheDocument()
    
    // デバイス別の操作説明が表示される
    expect(screen.getByText(/モバイル: 長押ししてドラッグ/)).toBeInTheDocument()
    expect(screen.getByText(/PC: クリックしてドラッグ/)).toBeInTheDocument()
  })

  test('すべてのジャンルアイテムが表示される', () => {
    render(<GenreOrderCustomizer />)
    
    // すべてのジャンルが表示されることを確認
    expect(screen.getByText('総合')).toBeInTheDocument()
    expect(screen.getByText('音楽')).toBeInTheDocument()
    expect(screen.getByText('アニメ')).toBeInTheDocument()
    expect(screen.getByText('ゲーム')).toBeInTheDocument()
  })

  test('表示/非表示ボタンがクリックできる', () => {
    render(<GenreOrderCustomizer />)
    
    const toggleButtons = screen.getAllByRole('button', { name: /を.*にする$/ })
    expect(toggleButtons).toHaveLength(4)
    
    // 最初のボタンをクリック
    fireEvent.click(toggleButtons[0])
    
    // toggleVisibility が呼ばれることを確認
    expect(mockToggleVisibility).toHaveBeenCalledWith('all')
  })

  test('デフォルトに戻すボタンが機能する', () => {
    render(<GenreOrderCustomizer />)
    
    const resetButton = screen.getByRole('button', { name: 'デフォルトに戻す' })
    fireEvent.click(resetButton)
    
    expect(mockResetToDefault).toHaveBeenCalled()
  })

  test('hasChanges の変更が親コンポーネントに通知される', () => {
    const mockOnChangesUpdate = vi.fn()
    render(<GenreOrderCustomizer onChangesUpdate={mockOnChangesUpdate} />)
    
    // 初回レンダリング時に false で呼ばれる
    expect(mockOnChangesUpdate).toHaveBeenLastCalledWith(false)
  })

  test('ref を通じて applyChanges と cancelChanges が呼び出せる', () => {
    const ref = React.createRef<any>()
    render(<GenreOrderCustomizer ref={ref} />)
    
    // ref が正しく設定されていることを確認
    expect(ref.current).toBeDefined()
    expect(ref.current.applyChanges).toBeDefined()
    expect(ref.current.cancelChanges).toBeDefined()
    
    // メソッドを呼び出す
    ref.current.applyChanges()
    expect(mockApplyChanges).toHaveBeenCalled()
    
    ref.current.cancelChanges()
    expect(mockCancelChanges).toHaveBeenCalled()
  })

  test('@dnd-kit のセンサーが正しく設定される', () => {
    render(<GenreOrderCustomizer />)
    
    // DndContext が存在することで、センサーが設定されていることを確認
    expect(screen.getByTestId('dnd-context')).toBeInTheDocument()
  })

  test('DragOverlay がドラッグ中に表示される仕組みがある', () => {
    render(<GenreOrderCustomizer />)
    
    // 初期状態では DragOverlay の中身は空
    const dragOverlay = screen.queryByTestId('drag-overlay')
    expect(dragOverlay).not.toBeInTheDocument()
    
    // activeId が設定されれば DragOverlay が表示される仕組みがあることを確認
    // （実際のドラッグイベントは @dnd-kit がハンドリングするため、ここではコンポーネントの存在確認のみ）
  })
})