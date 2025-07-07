import { renderHook, act, waitFor } from '@testing-library/react'
import { useNavigationState } from '@/hooks/use-navigation-state'
import * as pwaUtils from '@/lib/pwa-utils'

// Next.js のルーター関連をモック
const mockPathname = jest.fn()
const mockSearchParams = jest.fn()

jest.mock('next/navigation', () => ({
  usePathname: () => mockPathname(),
  useSearchParams: () => mockSearchParams()
}))

describe('useNavigationState', () => {
  let originalScrollY: number
  let originalMatchMedia: typeof window.matchMedia
  let mockIsPWA: jest.SpyInstance

  beforeEach(() => {
    jest.useFakeTimers()
    
    // デフォルトのモック返却値を設定
    mockPathname.mockReturnValue('/')
    mockSearchParams.mockReturnValue(new URLSearchParams(''))
    // window.scrollY のモック
    originalScrollY = window.scrollY
    Object.defineProperty(window, 'scrollY', {
      value: 100,
      writable: true,
      configurable: true
    })

    // matchMediaのモック
    originalMatchMedia = window.matchMedia
    window.matchMedia = jest.fn().mockImplementation(() => ({
      matches: false,
      media: '',
      onchange: null,
      addListener: jest.fn(),
      removeListener: jest.fn(),
      addEventListener: jest.fn(),
      removeEventListener: jest.fn(),
      dispatchEvent: jest.fn(),
    }))

    // sessionStorage のモック
    const mockSessionStorage = {
      getItem: jest.fn(),
      setItem: jest.fn(),
      removeItem: jest.fn(),
      clear: jest.fn(),
    }
    Object.defineProperty(window, 'sessionStorage', {
      value: mockSessionStorage,
      configurable: true
    })

    // isPWA のモック
    mockIsPWA = jest.spyOn(pwaUtils, 'isPWA')
    
    // scrollTo のモック
    window.scrollTo = jest.fn()
    
    // requestAnimationFrame のモック
    window.requestAnimationFrame = jest.fn((callback) => {
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
    mockIsPWA.mockRestore()
    jest.clearAllMocks()
    jest.useRealTimers()
  })

  it('should not save state when not in PWA mode', () => {
    mockIsPWA.mockReturnValue(false)

    const { result } = renderHook(() => useNavigationState())

    act(() => {
      result.current.saveState()
    })

    expect(window.sessionStorage.setItem).not.toHaveBeenCalled()
  })

  it('should save state when in PWA mode', () => {
    mockIsPWA.mockReturnValue(true)
    mockPathname.mockReturnValue('/test-path')
    mockSearchParams.mockReturnValue(new URLSearchParams('param=value'))

    const { result } = renderHook(() => useNavigationState())

    act(() => {
      result.current.saveState()
    })

    expect(window.sessionStorage.setItem).toHaveBeenCalledWith(
      'navigation-state',
      expect.stringContaining('"pathname":"/test-path"')
    )
    expect(window.sessionStorage.setItem).toHaveBeenCalledWith(
      'navigation-state',
      expect.stringContaining('"searchParams":"param=value"')
    )
    expect(window.sessionStorage.setItem).toHaveBeenCalledWith(
      'navigation-state',
      expect.stringContaining('"scrollPosition":100')
    )
  })

  it('should restore state when in PWA mode', async () => {
    mockIsPWA.mockReturnValue(true)
    mockPathname.mockReturnValue('/test-path')
    mockSearchParams.mockReturnValue(new URLSearchParams('param=value'))
    
    const savedState = {
      pathname: '/test-path',
      searchParams: 'param=value',
      scrollPosition: 200,
      timestamp: Date.now()
    }
    
    ;(window.sessionStorage.getItem as jest.Mock).mockReturnValue(
      JSON.stringify(savedState)
    )

    const { result } = renderHook(() => useNavigationState())

    // useEffectが実行されてからテスト
    await waitFor(() => {
      expect(window.sessionStorage.getItem).toHaveBeenCalledWith('navigation-state')
    })

    act(() => {
      result.current.restoreState()
    })

    // requestAnimationFrame 経由でスクロールされることを確認
    expect(window.scrollTo).toHaveBeenCalledWith(0, 200)
  })

  it('should not restore expired state', () => {
    mockIsPWA.mockReturnValue(true)
    mockPathname.mockReturnValue('/test-path')
    mockSearchParams.mockReturnValue(new URLSearchParams('param=value'))
    
    const expiredState = {
      pathname: '/test-path',
      searchParams: 'param=value',
      scrollPosition: 200,
      timestamp: Date.now() - 40 * 60 * 1000 // 40分前
    }
    
    ;(window.sessionStorage.getItem as jest.Mock).mockReturnValue(
      JSON.stringify(expiredState)
    )

    const { result } = renderHook(() => useNavigationState())

    act(() => {
      result.current.restoreState()
    })

    expect(window.scrollTo).not.toHaveBeenCalled()
    expect(window.sessionStorage.removeItem).toHaveBeenCalledWith('navigation-state')
  })

  it('should clear state', () => {
    mockIsPWA.mockReturnValue(true)

    const { result } = renderHook(() => useNavigationState())

    act(() => {
      result.current.clearState()
    })

    expect(window.sessionStorage.removeItem).toHaveBeenCalledWith('navigation-state')
  })

  it('should save state on beforeunload event', () => {
    mockIsPWA.mockReturnValue(true)

    renderHook(() => useNavigationState())

    // beforeunload イベントを発火
    const event = new Event('beforeunload')
    window.dispatchEvent(event)

    expect(window.sessionStorage.setItem).toHaveBeenCalledWith(
      'navigation-state',
      expect.any(String)
    )
  })

  it('should save state on visibilitychange when hidden', () => {
    mockIsPWA.mockReturnValue(true)
    
    Object.defineProperty(document, 'visibilityState', {
      value: 'hidden',
      configurable: true
    })

    renderHook(() => useNavigationState())

    // visibilitychange イベントを発火
    const event = new Event('visibilitychange')
    document.dispatchEvent(event)

    expect(window.sessionStorage.setItem).toHaveBeenCalledWith(
      'navigation-state',
      expect.any(String)
    )
  })

  it('should restore state on popstate event', async () => {
    mockIsPWA.mockReturnValue(true)
    mockPathname.mockReturnValue('/test-path')
    mockSearchParams.mockReturnValue(new URLSearchParams('param=value'))
    
    const savedState = {
      pathname: '/test-path',
      searchParams: 'param=value',
      scrollPosition: 200,
      timestamp: Date.now()
    }
    
    ;(window.sessionStorage.getItem as jest.Mock).mockReturnValue(
      JSON.stringify(savedState)
    )

    renderHook(() => useNavigationState())

    // popstate イベントを発火
    const event = new PopStateEvent('popstate')
    
    act(() => {
      window.dispatchEvent(event)
    })

    // setTimeout の実行を待つ
    await act(async () => {
      jest.advanceTimersByTime(100)
    })

    expect(window.sessionStorage.getItem).toHaveBeenCalledWith('navigation-state')
  })
})