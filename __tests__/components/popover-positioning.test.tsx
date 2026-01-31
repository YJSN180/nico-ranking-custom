import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { QuickNGButton } from '../../components/quick-ng-button'
import type { RankingItem } from '../../types/ranking'

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
  tagDetails: []
}

describe('Popover Positioning Tests', () => {
  let originalInnerHeight: number
  let originalInnerWidth: number
  let resizeCallback: (() => void) | null = null

  beforeEach(() => {
    // 元の値を保存
    originalInnerHeight = window.innerHeight
    originalInnerWidth = window.innerWidth

    // ResizeObserverをモック
    global.ResizeObserver = vi.fn().mockImplementation((callback: () => void) => {
      resizeCallback = callback
      return {
        observe: vi.fn(),
        unobserve: vi.fn(),
        disconnect: vi.fn()
      }
    })
  })

  afterEach(() => {
    // 元の値を復元
    Object.defineProperty(window, 'innerHeight', {
      writable: true,
      configurable: true,
      value: originalInnerHeight
    })
    Object.defineProperty(window, 'innerWidth', {
      writable: true,
      configurable: true,
      value: originalInnerWidth
    })
    
    // ResizeObserverのモックをクリア
    resizeCallback = null
    vi.clearAllMocks()
  })

  const setPopoverSize = (popover: HTMLElement, width = 300, height = 240) => {
    popover.getBoundingClientRect = vi.fn().mockReturnValue({
      top: 0,
      left: 0,
      bottom: height,
      right: width,
      width,
      height
    })
  }

  it('画面下端のボタンではポップオーバーが上に表示される', async () => {
    // ビューポートサイズを設定
    Object.defineProperty(window, 'innerHeight', {
      writable: true,
      configurable: true,
      value: 800
    })
    Object.defineProperty(window, 'innerWidth', {
      writable: true,
      configurable: true,
      value: 1200
    })

    const { container } = render(<QuickNGButton video={mockVideo} />)
    const button = screen.getByRole('button', { name: /ng追加/i })
    
    // ボタンの位置を画面下端に設定
    const mockGetBoundingClientRect = vi.fn().mockReturnValue({
      top: 750,
      bottom: 788, // 38px height
      left: 100,
      right: 138,
      width: 38,
      height: 38
    })
    button.getBoundingClientRect = mockGetBoundingClientRect

    // クリックしてポップオーバーを開く
    fireEvent.click(button)

    // ポップオーバーが表示されるのを待つ
    await waitFor(() => {
      const popover = container.querySelector('.popover-ng-selector') as HTMLElement
      expect(popover).toBeInTheDocument()
      setPopoverSize(popover)
      resizeCallback?.()
    })

    await waitFor(() => {
      const popover = container.querySelector('.popover-ng-selector') as HTMLElement
      const top = popover.style.top
      const transformOrigin = popover.style.transformOrigin

      const topValue = parseFloat(top)
      expect(topValue).toBeLessThan(750)
      expect(transformOrigin).toContain('bottom')
    })
  })

  it('画面上部のボタンではポップオーバーが下に表示される', async () => {
    // ビューポートサイズを設定
    Object.defineProperty(window, 'innerHeight', {
      writable: true,
      configurable: true,
      value: 800
    })

    const { container } = render(<QuickNGButton video={mockVideo} />)
    const button = screen.getByRole('button', { name: /ng追加/i })
    
    // ボタンの位置を画面上部に設定
    const mockGetBoundingClientRect = vi.fn().mockReturnValue({
      top: 50,
      bottom: 88,
      left: 100,
      right: 138,
      width: 38,
      height: 38
    })
    button.getBoundingClientRect = mockGetBoundingClientRect

    // クリックしてポップオーバーを開く
    fireEvent.click(button)

    // ポップオーバーが表示されるのを待つ
    await waitFor(() => {
      const popover = container.querySelector('.popover-ng-selector') as HTMLElement
      expect(popover).toBeInTheDocument()
      setPopoverSize(popover)
      resizeCallback?.()
    })

    await waitFor(() => {
      const popover = container.querySelector('.popover-ng-selector') as HTMLElement
      const top = popover.style.top
      const transformOrigin = popover.style.transformOrigin

      const topValue = parseFloat(top)
      expect(topValue).toBeGreaterThan(88)
      expect(transformOrigin).toContain('top')
    })
  })

  it('モバイルビューでも位置調整が正しく動作する', async () => {
    // モバイルビューポートサイズを設定
    Object.defineProperty(window, 'innerHeight', {
      writable: true,
      configurable: true,
      value: 667 // iPhone SE
    })
    Object.defineProperty(window, 'innerWidth', {
      writable: true,
      configurable: true,
      value: 375
    })

    const { container } = render(<QuickNGButton video={mockVideo} />)
    const button = screen.getByRole('button', { name: /ng追加/i })
    
    // ボタンの位置を画面下端に設定
    const mockGetBoundingClientRect = vi.fn().mockReturnValue({
      top: 600,
      bottom: 638,
      left: 50,
      right: 88,
      width: 38,
      height: 38
    })
    button.getBoundingClientRect = mockGetBoundingClientRect

    // クリックしてポップオーバーを開く
    fireEvent.click(button)

    // ポップオーバーが表示されるのを待つ
    await waitFor(() => {
      const popover = container.querySelector('.popover-ng-selector') as HTMLElement
      expect(popover).toBeInTheDocument()
      setPopoverSize(popover)
      resizeCallback?.()
    })

    await waitFor(() => {
      const popover = container.querySelector('.popover-ng-selector') as HTMLElement
      const top = popover.style.top
      const transformOrigin = popover.style.transformOrigin

      const topValue = parseFloat(top)
      expect(topValue).toBeLessThan(600)
      expect(transformOrigin).toContain('bottom')
    })
  })
})
