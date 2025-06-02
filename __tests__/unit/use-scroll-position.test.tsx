import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useScrollPosition } from '@/hooks/use-scroll-position'

// sessionStorageのモック
const mockSessionStorage = {
  getItem: vi.fn(),
  setItem: vi.fn(),
  removeItem: vi.fn(),
  clear: vi.fn(),
  length: 0,
  key: vi.fn()
}

Object.defineProperty(window, 'sessionStorage', {
  value: mockSessionStorage,
  writable: true
})

// scrollToのモック
window.scrollTo = vi.fn()

describe('useScrollPosition', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    // スクロール位置をリセット
    Object.defineProperty(window, 'scrollY', {
      value: 0,
      writable: true,
      configurable: true
    })
  })

  afterEach(() => {
    vi.clearAllTimers()
  })

  it('should save scroll position when scrolling', async () => {
    const { result } = renderHook(() => useScrollPosition('test-key'))
    
    // スクロール位置を変更
    Object.defineProperty(window, 'scrollY', { value: 500 })
    
    // スクロールイベントを発火
    act(() => {
      window.dispatchEvent(new Event('scroll'))
    })
    
    // デバウンス待機
    await act(async () => {
      await new Promise(resolve => setTimeout(resolve, 200))
    })
    
    expect(mockSessionStorage.setItem).toHaveBeenCalledWith('scroll-test-key', '500')
  })

  it('should restore scroll position on mount', async () => {
    // 保存されたスクロール位置を設定
    mockSessionStorage.getItem.mockReturnValue('750')
    
    const { result } = renderHook(() => useScrollPosition('test-key'))
    
    // マウント後の復元を待つ
    await act(async () => {
      await new Promise(resolve => setTimeout(resolve, 150))
    })
    
    expect(window.scrollTo).toHaveBeenCalledWith(0, 750)
    expect(result.current.isRestored).toBe(true)
  })

  it('should not restore if no saved position', async () => {
    mockSessionStorage.getItem.mockReturnValue(null)
    
    const { result } = renderHook(() => useScrollPosition('test-key'))
    
    await act(async () => {
      await new Promise(resolve => setTimeout(resolve, 150))
    })
    
    expect(window.scrollTo).not.toHaveBeenCalled()
    expect(result.current.isRestored).toBe(false)
  })

  it('should clean up event listener on unmount', () => {
    const removeEventListenerSpy = vi.spyOn(window, 'removeEventListener')
    
    const { unmount } = renderHook(() => useScrollPosition('test-key'))
    
    unmount()
    
    expect(removeEventListenerSpy).toHaveBeenCalledWith('scroll', expect.any(Function))
  })

  it('should update scroll position in state', async () => {
    const { result } = renderHook(() => useScrollPosition('test-key'))
    
    expect(result.current.scrollY).toBe(0)
    
    // スクロール位置を変更
    Object.defineProperty(window, 'scrollY', { value: 300 })
    
    act(() => {
      window.dispatchEvent(new Event('scroll'))
    })
    
    // 即座に状態が更新される
    expect(result.current.scrollY).toBe(300)
  })
})