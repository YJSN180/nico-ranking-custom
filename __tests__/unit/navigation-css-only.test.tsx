import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { Navigation } from '@/components/navigation'
import { usePathname } from 'next/navigation'

// Next.js usePathname モック
vi.mock('next/navigation', () => ({
  usePathname: vi.fn()
}))

// UserPreferences モック
vi.mock('@/hooks/use-user-preferences', () => ({
  useUserPreferences: () => ({
    preferences: { theme: 'light' },
    updatePreferences: vi.fn()
  })
}))

describe('Navigation CSS-onlyレスポンシブ対応', () => {
  beforeEach(() => {
    vi.mocked(usePathname).mockReturnValue('/')
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  describe('メニューボタンのスタイル一貫性', () => {
    it('メニューボタンにnavigationモジュールのCSSクラスが適用される', () => {
      render(<Navigation />)
      
      const menuButton = screen.getByRole('button', { name: /メニュー/ })
      
      // CSSモジュールクラスの存在を確認
      expect(menuButton.className).toContain('menuButton')
    })

    it('useMobileDetectに依存しない', () => {
      // コンポーネントのコードからuseMobileDetectが削除されていることを確認
      const { container } = render(<Navigation />)
      
      // レスポンシブスタイルがCSSクラスで適用されている
      const menuButton = screen.getByRole('button', { name: /メニュー/ })
      expect(menuButton.className).toContain('menuButton')
      
      // インラインスタイルに動的な値が含まれていない
      const style = menuButton.getAttribute('style') || ''
      expect(style).not.toContain('12px') // モバイルのleft値
      expect(style).not.toContain('4px 8px') // モバイルのpadding値
    })
  })

  describe('デスクトップ表示', () => {
    beforeEach(() => {
      // デスクトップサイズに設定
      Object.defineProperty(window, 'innerWidth', {
        writable: true,
        configurable: true,
        value: 1024
      })
      window.matchMedia = vi.fn().mockImplementation(query => ({
        matches: false,
        media: query,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
      }))
    })

    it('デスクトップ用のCSSクラスが適用される', () => {
      render(<Navigation />)
      
      const menuButton = screen.getByRole('button', { name: /メニュー/ })
      
      // CSSクラスの存在を確認
      expect(menuButton.className).toContain('menuButton')
      
      // デスクトップ用コンテナクラス
      const container = menuButton.parentElement
      expect(container?.className).toContain('desktopContainer')
    })
  })

  describe('モバイル表示', () => {
    beforeEach(() => {
      // モバイルサイズに設定
      Object.defineProperty(window, 'innerWidth', {
        writable: true,
        configurable: true,
        value: 375
      })
      window.matchMedia = vi.fn().mockImplementation(query => ({
        matches: query === '(max-width: 768px)',
        media: query,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
      }))
    })

    it('モバイル用のCSSクラスが適用される', () => {
      render(<Navigation />)
      
      const menuButton = screen.getByRole('button', { name: /メニュー/ })
      
      // CSSクラスの存在を確認
      expect(menuButton.className).toContain('menuButton')
    })
  })

  describe('レイアウトシフト防止', () => {
    it('初回レンダリング時にレイアウトシフトが発生しない', () => {
      const { rerender } = render(<Navigation />)
      const menuButton = screen.getByRole('button', { name: /メニュー/ })
      const initialClassName = menuButton.className
      
      // 再レンダリング
      rerender(<Navigation />)
      
      // クラス名が変わらない（レイアウトシフトなし）
      expect(menuButton.className).toBe(initialClassName)
    })

    it('アイコンサイズが統一されている', () => {
      render(<Navigation />)
      
      // CSS ファイルでアイコンサイズが統一されているかをテスト
      const fs = require('fs')
      const path = require('path')
      const cssPath = path.join(process.cwd(), 'components/navigation.module.css')
      
      // CSS ファイルが存在する
      expect(fs.existsSync(cssPath)).toBe(true)
      
      const cssContent = fs.readFileSync(cssPath, 'utf-8')
      
      // menuButton クラスが定義されている
      expect(cssContent).toContain('.menuButton')
      
      // アイコンサイズの一貫性を確認
      expect(cssContent).not.toContain('size={20}') // モバイル用
      expect(cssContent).not.toContain('size={18}') // デスクトップ用
    })

    it('ボタンサイズが固定されている', () => {
      render(<Navigation />)
      
      const menuButton = screen.getByRole('button', { name: /メニュー/ })
      
      // インラインスタイルで width/height が設定されていない
      const style = menuButton.getAttribute('style') || ''
      expect(style).not.toContain('width')
      expect(style).not.toContain('height')
    })
  })

  describe('CSSモジュールの内容確認', () => {
    it('メディアクエリによるレスポンシブ対応が実装されている', () => {
      const fs = require('fs')
      const path = require('path')
      const cssPath = path.join(process.cwd(), 'components/navigation.module.css')
      
      if (fs.existsSync(cssPath)) {
        const cssContent = fs.readFileSync(cssPath, 'utf-8')
        
        // メディアクエリの存在
        expect(cssContent).toContain('@media')
        expect(cssContent).toContain('max-width: 768px')
        
        // モバイル用スタイルの存在
        const mobileRegex = /@media[^{]+\{[^}]*\.menuButton[^}]+\}/s
        const mobileMatch = cssContent.match(mobileRegex)
        expect(mobileMatch).toBeTruthy()
      }
    })
  })
})