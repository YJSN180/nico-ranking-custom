import { isPWA, getLinkTarget, navigateToVideo } from '@/lib/pwa-utils'

describe('pwa-utils', () => {
  let originalMatchMedia: typeof window.matchMedia
  let originalNavigator: typeof window.navigator
  let originalLocation: typeof window.location
  let originalOpen: typeof window.open

  beforeEach(() => {
    // 元の値を保存
    originalMatchMedia = window.matchMedia
    originalNavigator = window.navigator
    originalLocation = window.location
    originalOpen = window.open

    // モック設定
    Object.defineProperty(window, 'location', {
      value: { href: '' },
      writable: true,
      configurable: true
    })
    
    window.open = jest.fn()
  })

  afterEach(() => {
    // 元の値を復元
    window.matchMedia = originalMatchMedia
    Object.defineProperty(window, 'navigator', {
      value: originalNavigator,
      configurable: true
    })
    Object.defineProperty(window, 'location', {
      value: originalLocation,
      configurable: true
    })
    window.open = originalOpen
  })

  describe('isPWA', () => {
    it('should return true for standalone mode', () => {
      window.matchMedia = jest.fn().mockImplementation(query => ({
        matches: query === '(display-mode: standalone)',
        media: query,
        onchange: null,
        addListener: jest.fn(),
        removeListener: jest.fn(),
        addEventListener: jest.fn(),
        removeEventListener: jest.fn(),
        dispatchEvent: jest.fn(),
      }))

      expect(isPWA()).toBe(true)
    })

    it('should return true for fullscreen mode', () => {
      window.matchMedia = jest.fn().mockImplementation(query => ({
        matches: query === '(display-mode: fullscreen)',
        media: query,
        onchange: null,
        addListener: jest.fn(),
        removeListener: jest.fn(),
        addEventListener: jest.fn(),
        removeEventListener: jest.fn(),
        dispatchEvent: jest.fn(),
      }))

      expect(isPWA()).toBe(true)
    })

    it('should return true for iOS standalone mode', () => {
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

      Object.defineProperty(window, 'navigator', {
        value: { standalone: true },
        configurable: true
      })

      expect(isPWA()).toBe(true)
    })

    it('should return false for browser mode', () => {
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

      Object.defineProperty(window, 'navigator', {
        value: { standalone: false },
        configurable: true
      })

      expect(isPWA()).toBe(false)
    })
  })

  describe('getLinkTarget', () => {
    it('should return _self for PWA mode', () => {
      window.matchMedia = jest.fn().mockImplementation(query => ({
        matches: query === '(display-mode: standalone)',
        media: query,
        onchange: null,
        addListener: jest.fn(),
        removeListener: jest.fn(),
        addEventListener: jest.fn(),
        removeEventListener: jest.fn(),
        dispatchEvent: jest.fn(),
      }))

      expect(getLinkTarget()).toBe('_self')
    })

    it('should return _blank for browser mode', () => {
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

      expect(getLinkTarget()).toBe('_blank')
    })
  })

  describe('navigateToVideo', () => {
    const testUrl = 'https://www.nicovideo.jp/watch/sm12345'

    it('should navigate in same tab for PWA mode', () => {
      window.matchMedia = jest.fn().mockImplementation(query => ({
        matches: query === '(display-mode: standalone)',
        media: query,
        onchange: null,
        addListener: jest.fn(),
        removeListener: jest.fn(),
        addEventListener: jest.fn(),
        removeEventListener: jest.fn(),
        dispatchEvent: jest.fn(),
      }))

      navigateToVideo(testUrl)

      expect(window.location.href).toBe(testUrl)
      expect(window.open).not.toHaveBeenCalled()
    })

    it('should open new tab for browser mode', () => {
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

      navigateToVideo(testUrl)

      expect(window.open).toHaveBeenCalledWith(testUrl, '_blank', 'noopener,noreferrer')
      expect(window.location.href).toBe('')
    })

    it('should prevent default when event is provided in PWA mode', () => {
      window.matchMedia = jest.fn().mockImplementation(query => ({
        matches: query === '(display-mode: standalone)',
        media: query,
        onchange: null,
        addListener: jest.fn(),
        removeListener: jest.fn(),
        addEventListener: jest.fn(),
        removeEventListener: jest.fn(),
        dispatchEvent: jest.fn(),
      }))

      const mockEvent = {
        preventDefault: jest.fn()
      } as unknown as React.MouseEvent

      navigateToVideo(testUrl, mockEvent)

      expect(mockEvent.preventDefault).toHaveBeenCalled()
      expect(window.location.href).toBe(testUrl)
    })
  })
})