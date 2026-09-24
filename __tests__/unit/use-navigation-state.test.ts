import { renderHook, act, waitFor } from '@testing-library/react'
import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest'
import { useNavigationState } from '@/hooks/use-navigation-state'
import * as pwaUtils from '@/lib/pwa-utils'

const mockPathname = vi.fn()
const mockSearchParams = vi.fn()

vi.mock('next/navigation', () => ({
  usePathname: () => mockPathname(),
  useSearchParams: () => mockSearchParams()
}))

describe('useNavigationState', () => {
  let originalScrollY: number
  let originalMatchMedia: typeof window.matchMedia
  let isPWASpy: ReturnType<typeof vi.spyOn>
  let sessionStorageGetItem: ReturnType<typeof vi.fn>
  let sessionStorageSetItem: ReturnType<typeof vi.fn>
  let sessionStorageRemoveItem: ReturnType<typeof vi.fn>

  beforeEach(() => {
    vi.useFakeTimers()

    mockPathname.mockReturnValue('/')
    mockSearchParams.mockReturnValue(new URLSearchParams(''))

    originalScrollY = window.scrollY
    Object.defineProperty(window, 'scrollY', {
      value: 100,
      writable: true,
      configurable: true
    })

    originalMatchMedia = window.matchMedia
    window.matchMedia = vi.fn().mockImplementation(() => ({
      matches: false,
      media: '',
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn()
    }))

    sessionStorageGetItem = vi.fn()
    sessionStorageSetItem = vi.fn()
    sessionStorageRemoveItem = vi.fn()
    Object.defineProperty(window, 'sessionStorage', {
      value: {
        getItem: sessionStorageGetItem,
        setItem: sessionStorageSetItem,
        removeItem: sessionStorageRemoveItem,
        clear: vi.fn()
      },
      configurable: true
    })

    isPWASpy = vi.spyOn(pwaUtils, 'isPWA')
    window.scrollTo = vi.fn()
    window.requestAnimationFrame = vi.fn((callback: FrameRequestCallback) => {
      callback(0)
      return 0
    })
  })

  afterEach(() => {
    Object.defineProperty(window, 'scrollY', {
      value: originalScrollY,
      configurable: true
    })
    window.matchMedia = originalMatchMedia
    isPWASpy.mockRestore()
    vi.clearAllMocks()
    vi.useRealTimers()
  })

  it('PWA でなくても状態を保存する（フェーズ3-3: 通常ブラウザの「戻る」にも適用）', () => {
    isPWASpy.mockReturnValue(false)
    mockPathname.mockReturnValue('/test-path')
    mockSearchParams.mockReturnValue(new URLSearchParams('param=value'))

    const { result } = renderHook(() => useNavigationState())

    act(() => {
      result.current.saveState()
    })

    expect(sessionStorageSetItem).toHaveBeenCalledWith(
      'navigation-state',
      expect.stringContaining('"pathname":"/test-path"')
    )
  })

  it('PWA では現在状態を保存する', () => {
    isPWASpy.mockReturnValue(true)
    mockPathname.mockReturnValue('/test-path')
    mockSearchParams.mockReturnValue(new URLSearchParams('param=value'))

    const { result } = renderHook(() => useNavigationState())

    act(() => {
      result.current.saveState()
    })

    expect(sessionStorageSetItem).toHaveBeenCalledWith(
      'navigation-state',
      expect.stringContaining('"pathname":"/test-path"')
    )
    expect(sessionStorageSetItem).toHaveBeenCalledWith(
      'navigation-state',
      expect.stringContaining('"searchParams":"param=value"')
    )
    expect(sessionStorageSetItem).toHaveBeenCalledWith(
      'navigation-state',
      expect.stringContaining('"scrollPosition":100')
    )
  })

  it('一致する保存状態があれば復元する', async () => {
    isPWASpy.mockReturnValue(true)
    mockPathname.mockReturnValue('/test-path')
    mockSearchParams.mockReturnValue(new URLSearchParams('param=value'))
    sessionStorageGetItem.mockReturnValue(
      JSON.stringify({
        pathname: '/test-path',
        searchParams: 'param=value',
        scrollPosition: 200,
        timestamp: Date.now()
      })
    )

    const { result } = renderHook(() => useNavigationState())

    await waitFor(() => {
      expect(sessionStorageGetItem).toHaveBeenCalledWith('navigation-state')
    })

    act(() => {
      result.current.restoreState()
    })

    expect(window.scrollTo).toHaveBeenCalledWith(0, 200)
  })

  it('期限切れ状態は破棄する', () => {
    isPWASpy.mockReturnValue(true)
    mockPathname.mockReturnValue('/test-path')
    mockSearchParams.mockReturnValue(new URLSearchParams('param=value'))
    sessionStorageGetItem.mockReturnValue(
      JSON.stringify({
        pathname: '/test-path',
        searchParams: 'param=value',
        scrollPosition: 200,
        timestamp: Date.now() - 40 * 60 * 1000
      })
    )

    const { result } = renderHook(() => useNavigationState())

    act(() => {
      result.current.restoreState()
    })

    expect(window.scrollTo).not.toHaveBeenCalled()
    expect(sessionStorageRemoveItem).toHaveBeenCalledWith('navigation-state')
  })

  it('clearState で保存状態を削除する', () => {
    isPWASpy.mockReturnValue(true)

    const { result } = renderHook(() => useNavigationState())

    act(() => {
      result.current.clearState()
    })

    expect(sessionStorageRemoveItem).toHaveBeenCalledWith('navigation-state')
  })

  it('beforeunload で保存する', () => {
    isPWASpy.mockReturnValue(true)

    renderHook(() => useNavigationState())
    window.dispatchEvent(new Event('beforeunload'))

    expect(sessionStorageSetItem).toHaveBeenCalledWith(
      'navigation-state',
      expect.any(String)
    )
  })

  it('visibilitychange hidden で保存する', () => {
    isPWASpy.mockReturnValue(true)
    Object.defineProperty(document, 'visibilityState', {
      value: 'hidden',
      configurable: true
    })

    renderHook(() => useNavigationState())
    document.dispatchEvent(new Event('visibilitychange'))

    expect(sessionStorageSetItem).toHaveBeenCalledWith(
      'navigation-state',
      expect.any(String)
    )
  })

  it('popstate で遅延復元する', async () => {
    isPWASpy.mockReturnValue(true)
    mockPathname.mockReturnValue('/test-path')
    mockSearchParams.mockReturnValue(new URLSearchParams('param=value'))
    sessionStorageGetItem.mockReturnValue(
      JSON.stringify({
        pathname: '/test-path',
        searchParams: 'param=value',
        scrollPosition: 200,
        timestamp: Date.now()
      })
    )

    renderHook(() => useNavigationState())
    vi.clearAllMocks()

    window.dispatchEvent(new PopStateEvent('popstate'))

    act(() => {
      vi.advanceTimersByTime(100)
    })

    await waitFor(() => {
      expect(window.scrollTo).toHaveBeenCalledWith(0, 200)
    })
  })
})
