import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { 
  isIOS, 
  isIOSSafari, 
  isAndroid, 
  isPWAInstalled,
  isMobile,
  canInstallPWA,
  shouldShowInstallPrompt,
  markInstallPromptShown,
  markInstallPromptDismissed,
  resetInstallPromptSettings
} from '@/lib/pwa/detection'

describe('PWA Detection', () => {
  let originalNavigator: any
  let originalMatchMedia: any

  beforeEach(() => {
    // NavigatorとmatchMediaのモック保存
    originalNavigator = global.navigator
    originalMatchMedia = global.matchMedia
    
    // LocalStorageのクリア
    if (typeof localStorage !== 'undefined') {
      localStorage.clear()
    }
    
    // デフォルトのmatchMediaモック
    global.matchMedia = vi.fn().mockImplementation((query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    }))
    
    // navigatorのデフォルト値を設定
    Object.defineProperty(global.navigator, 'maxTouchPoints', {
      writable: true,
      configurable: true,
      value: 0
    })
    
    // navigator.standaloneをリセット
    // @ts-ignore
    delete global.navigator.standalone
    
    // デフォルトでfalseに設定
    Object.defineProperty(global.navigator, 'standalone', {
      writable: true,
      configurable: true,
      value: false
    })
    
    // windowオブジェクトのモック（PWA detection関数で使用）
    if (typeof window !== 'undefined') {
      // windowが存在する場合はmatchMediaを確実に設定
      // @ts-ignore
      window.matchMedia = global.matchMedia
      // @ts-ignore
      window.navigator = global.navigator
    }
  })

  afterEach(() => {
    // オリジナルを復元
    global.navigator = originalNavigator
    global.matchMedia = originalMatchMedia
  })

  describe('isIOS', () => {
    it('should detect iOS devices', () => {
      Object.defineProperty(global.navigator, 'userAgent', {
        value: 'Mozilla/5.0 (iPhone; CPU iPhone OS 14_0 like Mac OS X) AppleWebKit/605.1.15',
        configurable: true
      })
      expect(isIOS()).toBe(true)
    })

    it('should not detect Android as iOS', () => {
      Object.defineProperty(global.navigator, 'userAgent', {
        value: 'Mozilla/5.0 (Linux; Android 10; SM-A205U) AppleWebKit/537.36',
        configurable: true
      })
      expect(isIOS()).toBe(false)
    })
  })

  describe('isIOSSafari', () => {
    it('should detect iOS Safari', () => {
      Object.defineProperty(global.navigator, 'userAgent', {
        value: 'Mozilla/5.0 (iPhone; CPU iPhone OS 14_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/14.0 Mobile/15E148 Safari/604.1',
        configurable: true
      })
      expect(isIOSSafari()).toBe(true)
    })

    it('should not detect Chrome on iOS as Safari', () => {
      Object.defineProperty(global.navigator, 'userAgent', {
        value: 'Mozilla/5.0 (iPhone; CPU iPhone OS 14_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/87.0.4280.77 Mobile/15E148 Safari/604.1',
        configurable: true
      })
      expect(isIOSSafari()).toBe(false)
    })
  })

  describe('isAndroid', () => {
    it('should detect Android devices', () => {
      Object.defineProperty(global.navigator, 'userAgent', {
        value: 'Mozilla/5.0 (Linux; Android 10; SM-A205U) AppleWebKit/537.36',
        configurable: true
      })
      expect(isAndroid()).toBe(true)
    })
  })

  describe('isPWAInstalled', () => {
    it('should detect standalone mode', () => {
      const mockMatchMedia = vi.fn().mockImplementation((query: string) => ({
        matches: query === '(display-mode: standalone)',
        media: query,
        onchange: null,
        addListener: vi.fn(),
        removeListener: vi.fn(),
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        dispatchEvent: vi.fn(),
      }))
      
      global.matchMedia = mockMatchMedia
      if (typeof window !== 'undefined') {
        // @ts-ignore
        window.matchMedia = mockMatchMedia
      }
      
      expect(isPWAInstalled()).toBe(true)
    })

    it('should detect iOS standalone mode', () => {
      // @ts-ignore
      global.navigator.standalone = true
      expect(isPWAInstalled()).toBe(true)
    })

    it('should return false when not installed', () => {
      // navigator.standaloneを明示的にfalseに設定
      // @ts-ignore
      global.navigator.standalone = false
      expect(isPWAInstalled()).toBe(false)
    })
  })

  describe('isMobile', () => {
    beforeEach(() => {
      // Window サイズのモック
      Object.defineProperty(window, 'innerWidth', {
        writable: true,
        configurable: true,
        value: 375
      })
    })

    it('should detect mobile devices with touch', () => {
      // @ts-ignore
      window.ontouchstart = {}
      expect(isMobile()).toBe(true)
    })

    it('should not detect desktop as mobile', () => {
      Object.defineProperty(window, 'innerWidth', {
        writable: true,
        configurable: true,
        value: 1024
      })
      expect(isMobile()).toBe(false)
    })
  })

  describe('canInstallPWA', () => {
    it('should return true for iOS Safari', () => {
      Object.defineProperty(global.navigator, 'userAgent', {
        value: 'Mozilla/5.0 (iPhone; CPU iPhone OS 14_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/14.0 Mobile/15E148 Safari/604.1',
        configurable: true
      })
      Object.defineProperty(window, 'innerWidth', {
        writable: true,
        configurable: true,
        value: 375
      })
      // @ts-ignore
      window.ontouchstart = {}
      // @ts-ignore
      global.navigator.standalone = false
      
      expect(canInstallPWA()).toBe(true)
    })

    it('should return false if already installed', () => {
      const mockMatchMedia = vi.fn().mockImplementation((query: string) => ({
        matches: query === '(display-mode: standalone)',
        media: query,
        onchange: null,
        addListener: vi.fn(),
        removeListener: vi.fn(),
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        dispatchEvent: vi.fn(),
      }))
      
      global.matchMedia = mockMatchMedia
      if (typeof window !== 'undefined') {
        // @ts-ignore
        window.matchMedia = mockMatchMedia
      }
      
      expect(canInstallPWA()).toBe(false)
    })
  })

  describe('shouldShowInstallPrompt', () => {
    beforeEach(() => {
      resetInstallPromptSettings()
    })

    it('should not show on first visit', () => {
      Object.defineProperty(global.navigator, 'userAgent', {
        value: 'Mozilla/5.0 (iPhone; CPU iPhone OS 14_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/14.0 Mobile/15E148 Safari/604.1',
        configurable: true
      })
      Object.defineProperty(window, 'innerWidth', {
        writable: true,
        configurable: true,
        value: 375
      })
      // @ts-ignore
      window.ontouchstart = {}
      // @ts-ignore
      global.navigator.standalone = false
      
      expect(shouldShowInstallPrompt()).toBe(false)
    })

    it('should show after 2 days from first visit', () => {
      Object.defineProperty(global.navigator, 'userAgent', {
        value: 'Mozilla/5.0 (iPhone; CPU iPhone OS 14_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/14.0 Mobile/15E148 Safari/604.1',
        configurable: true
      })
      Object.defineProperty(window, 'innerWidth', {
        writable: true,
        configurable: true,
        value: 375
      })
      // @ts-ignore
      window.ontouchstart = {}
      // @ts-ignore
      global.navigator.standalone = false
      
      // 3日前の日付を設定
      const threeDaysAgo = new Date()
      threeDaysAgo.setDate(threeDaysAgo.getDate() - 3)
      localStorage.setItem('first_visit', threeDaysAgo.toISOString())
      
      expect(shouldShowInstallPrompt()).toBe(true)
    })

    it('should not show if dismissed within 30 days', () => {
      Object.defineProperty(global.navigator, 'userAgent', {
        value: 'Mozilla/5.0 (iPhone; CPU iPhone OS 14_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/14.0 Mobile/15E148 Safari/604.1',
        configurable: true
      })
      Object.defineProperty(window, 'innerWidth', {
        writable: true,
        configurable: true,
        value: 375
      })
      // @ts-ignore
      window.ontouchstart = {}
      // @ts-ignore
      global.navigator.standalone = false
      
      // 初回訪問を3日前に設定
      const threeDaysAgo = new Date()
      threeDaysAgo.setDate(threeDaysAgo.getDate() - 3)
      localStorage.setItem('first_visit', threeDaysAgo.toISOString())
      
      // 10日前に拒否
      const tenDaysAgo = new Date()
      tenDaysAgo.setDate(tenDaysAgo.getDate() - 10)
      localStorage.setItem('pwa_install_dismissed', tenDaysAgo.toISOString())
      
      expect(shouldShowInstallPrompt()).toBe(false)
    })

    it('should not show after 3 times', () => {
      Object.defineProperty(global.navigator, 'userAgent', {
        value: 'Mozilla/5.0 (iPhone; CPU iPhone OS 14_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/14.0 Mobile/15E148 Safari/604.1',
        configurable: true
      })
      Object.defineProperty(window, 'innerWidth', {
        writable: true,
        configurable: true,
        value: 375
      })
      // @ts-ignore
      window.ontouchstart = {}
      // @ts-ignore
      global.navigator.standalone = false
      
      // 初回訪問を3日前に設定
      const threeDaysAgo = new Date()
      threeDaysAgo.setDate(threeDaysAgo.getDate() - 3)
      localStorage.setItem('first_visit', threeDaysAgo.toISOString())
      
      // 3回表示済み
      localStorage.setItem('pwa_install_prompt_count', '3')
      
      expect(shouldShowInstallPrompt()).toBe(false)
    })
  })

  describe('prompt management functions', () => {
    it('should increment prompt count when shown', () => {
      markInstallPromptShown()
      expect(localStorage.getItem('pwa_install_prompt_count')).toBe('1')
      
      markInstallPromptShown()
      expect(localStorage.getItem('pwa_install_prompt_count')).toBe('2')
    })

    it('should record dismissal timestamp', () => {
      markInstallPromptDismissed()
      const dismissedAt = localStorage.getItem('pwa_install_dismissed')
      expect(dismissedAt).toBeTruthy()
      expect(new Date(dismissedAt!).getTime()).toBeCloseTo(Date.now(), -2)
    })

    it('should reset all settings', () => {
      localStorage.setItem('pwa_install_dismissed', 'test')
      localStorage.setItem('pwa_install_prompt_count', '2')
      localStorage.setItem('pwa_install_prompt_last_shown', 'test')
      
      resetInstallPromptSettings()
      
      expect(localStorage.getItem('pwa_install_dismissed')).toBeNull()
      expect(localStorage.getItem('pwa_install_prompt_count')).toBeNull()
      expect(localStorage.getItem('pwa_install_prompt_last_shown')).toBeNull()
    })
  })
})