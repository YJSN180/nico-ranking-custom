/**
 * Genre Order Touch Events テスト
 * モバイルデバイスでのドラッグ&ドロップ機能を検証
 */

import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { GenreOrderCustomizer } from '@/components/genre-order'
import { vi } from 'vitest'

// TouchEventコンストラクタのモック
global.TouchEvent = class TouchEvent extends UIEvent {
  touches: Touch[]
  changedTouches: Touch[]
  targetTouches: Touch[]
  
  constructor(type: string, init?: TouchEventInit) {
    super(type, init)
    this.touches = init?.touches || []
    this.changedTouches = init?.changedTouches || []
    this.targetTouches = init?.targetTouches || []
  }
} as any

// Touch オブジェクトのモック
global.Touch = class Touch {
  identifier: number
  target: EventTarget
  clientX: number
  clientY: number
  screenX: number
  screenY: number
  pageX: number
  pageY: number
  radiusX: number
  radiusY: number
  rotationAngle: number
  force: number
  
  constructor(init: any) {
    this.identifier = init.identifier || 0
    this.target = init.target || document.body
    this.clientX = init.clientX || 0
    this.clientY = init.clientY || 0
    this.screenX = init.screenX || 0
    this.screenY = init.screenY || 0
    this.pageX = init.pageX || 0
    this.pageY = init.pageY || 0
    this.radiusX = init.radiusX || 0
    this.radiusY = init.radiusY || 0
    this.rotationAngle = init.rotationAngle || 0
    this.force = init.force || 0
  }
} as any

// navigator.vibrate のモック
Object.defineProperty(navigator, 'vibrate', {
  value: vi.fn(),
  writable: true
})

// document.elementFromPoint のモック
const originalElementFromPoint = document.elementFromPoint
document.elementFromPoint = vi.fn()

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
    cancelChanges: mockCancelChanges
  })
}))

describe('GenreOrderCustomizer タッチイベント', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    ;(document.elementFromPoint as any).mockReset()
  })

  afterAll(() => {
    document.elementFromPoint = originalElementFromPoint
  })

  const createTouchEvent = (type: string, clientX: number, clientY: number, target?: Element) => {
    const touch = new Touch({
      identifier: 1,
      target: target || document.body,
      clientX,
      clientY,
      screenX: clientX,
      screenY: clientY,
      pageX: clientX,
      pageY: clientY
    })

    return new TouchEvent(type, {
      touches: type === 'touchend' ? [] : [touch],
      changedTouches: [touch],
      targetTouches: type === 'touchend' ? [] : [touch],
      bubbles: true,
      cancelable: true
    })
  }

  test('タッチイベントハンドラーが正しく設定される', () => {
    render(<GenreOrderCustomizer />)
    
    const genreItems = screen.getAllByRole('button', { name: /を.*する$/ }).map(btn => btn.parentElement!)
    const firstItem = genreItems[0]
    
    // タッチイベントハンドラーが存在することを確認
    expect(firstItem).toBeDefined()
    
    // タッチ開始イベント
    const touchStartEvent = createTouchEvent('touchstart', 100, 100, firstItem)
    fireEvent(firstItem, touchStartEvent)
    
    // vibrate APIが呼ばれることを確認
    expect(navigator.vibrate).toHaveBeenCalledWith(50)
  })

  test('タッチドラッグ中に要素がスタイル変更される', async () => {
    render(<GenreOrderCustomizer />)
    
    const genreItems = screen.getAllByRole('button', { name: /を.*する$/ }).map(btn => btn.parentElement!)
    const firstItem = genreItems[0]
    
    // タッチ開始
    const touchStartEvent = createTouchEvent('touchstart', 100, 100, firstItem)
    fireEvent(firstItem, touchStartEvent)
    
    // タッチ移動
    const touchMoveEvent = createTouchEvent('touchmove', 100, 200, firstItem)
    fireEvent(firstItem, touchMoveEvent)
    
    // スタイルが適用されることを確認
    expect(firstItem.style.transform).toContain('translateY')
    expect(firstItem.style.zIndex).toBe('1000')
    expect(firstItem.style.opacity).toBe('0.8')
  })

  test('タッチ終了時に要素の順序が変更される', async () => {
    mockMoveItem.mockClear()
    
    render(<GenreOrderCustomizer />)
    
    const genreItems = screen.getAllByRole('button', { name: /を.*する$/ }).map(btn => btn.parentElement!)
    const firstItem = genreItems[0]
    const secondItem = genreItems[1]
    
    // ドロップターゲットのモック設定
    ;(document.elementFromPoint as any).mockReturnValue(secondItem)
    
    // タッチ開始
    const touchStartEvent = createTouchEvent('touchstart', 100, 100, firstItem)
    fireEvent(firstItem, touchStartEvent)
    
    // タッチ終了（別の要素上）
    const touchEndEvent = createTouchEvent('touchend', 100, 200, firstItem)
    fireEvent(firstItem, touchEndEvent)
    
    // moveItemが呼ばれることを確認
    await waitFor(() => {
      expect(mockMoveItem).toHaveBeenCalledWith('all', 'music')
    })
  })

  test('タッチ終了時にスタイルがリセットされる', () => {
    render(<GenreOrderCustomizer />)
    
    const genreItems = screen.getAllByRole('button', { name: /を.*する$/ }).map(btn => btn.parentElement!)
    const firstItem = genreItems[0]
    
    // タッチ開始
    const touchStartEvent = createTouchEvent('touchstart', 100, 100, firstItem)
    fireEvent(firstItem, touchStartEvent)
    
    // タッチ移動でスタイルを設定
    const touchMoveEvent = createTouchEvent('touchmove', 100, 200, firstItem)
    fireEvent(firstItem, touchMoveEvent)
    
    // タッチ終了
    const touchEndEvent = createTouchEvent('touchend', 100, 200, firstItem)
    fireEvent(firstItem, touchEndEvent)
    
    // スタイルがリセットされることを確認
    expect(firstItem.style.transform).toBe('')
    expect(firstItem.style.zIndex).toBe('')
    expect(firstItem.style.opacity).toBe('')
  })

  test('マウスイベントとタッチイベントの両方が共存できる', async () => {
    render(<GenreOrderCustomizer />)
    
    const genreItems = screen.getAllByRole('button', { name: /を.*する$/ }).map(btn => btn.parentElement!)
    const firstItem = genreItems[0]
    
    // マウスドラッグ開始
    fireEvent.dragStart(firstItem, { dataTransfer: { effectAllowed: '' } })
    // CSS modules のクラス名を確認（ハッシュ付き）
    const classes = firstItem.className.split(' ')
    expect(classes.some(c => c.includes('genreItem'))).toBe(true)
    
    // ドラッグ終了
    fireEvent.dragEnd(firstItem)
    
    // タッチイベントも動作することを確認
    const touchStartEvent = createTouchEvent('touchstart', 100, 100, firstItem)
    fireEvent(firstItem, touchStartEvent)
    expect(navigator.vibrate).toHaveBeenCalled()
  })
})