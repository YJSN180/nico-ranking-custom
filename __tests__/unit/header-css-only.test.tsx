import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { HeaderWithSettings } from '@/components/header-with-settings'

describe('ヘッダーCSS-onlyレスポンシブ対応', () => {
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

    it('デスクトップサイズのスタイルが適用される', () => {
      render(<HeaderWithSettings />)
      
      const header = screen.getByRole('banner')
      const headerStyles = window.getComputedStyle(header)
      
      // CSSクラスの存在を確認（CSSモジュールは変換される）
      expect(header.className).toContain('headerResponsive')
      
      // font-sizeとpaddingはCSSから適用されるべき
      // 実際の値はブラウザ環境でないと取得できないため、クラスの存在を確認
      const titleLink = screen.getByRole('link', { name: /ニコラン/ })
      expect(titleLink.className).toContain('headerTitle')
    })

    it('useMobileDetectに依存しない', () => {
      // コンポーネントのコードからuseMobileDetectが削除されていることを確認
      const { container } = render(<HeaderWithSettings />)
      
      // レスポンシブスタイルがCSSクラスで適用されている
      const header = container.querySelector('.header-container')
      expect(header?.className).toContain('headerResponsive')
      
      // インラインスタイルにモバイル判定の結果が含まれていない
      const headerStyle = header?.getAttribute('style') || ''
      expect(headerStyle).not.toContain('22px') // モバイルのfont-size
      expect(headerStyle).not.toContain('5px') // モバイルのpadding
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
        matches: query === '(max-width: 640px)',
        media: query,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
      }))
    })

    it('モバイルサイズのスタイルが適用される', () => {
      render(<HeaderWithSettings />)
      
      const header = screen.getByRole('banner')
      
      // CSSクラスの存在を確認（CSSモジュールは変換される）
      expect(header.className).toContain('headerResponsive')
      
      // メディアクエリによってモバイルスタイルが適用される
      const titleLink = screen.getByRole('link', { name: /ニコラン/ })
      expect(titleLink.className).toContain('headerTitle')
    })
  })

  describe('レイアウトシフト防止', () => {
    it('初回レンダリング時にレイアウトシフトが発生しない', () => {
      const { rerender } = render(<HeaderWithSettings />)
      const header = screen.getByRole('banner')
      const initialClassName = header.className
      
      // 再レンダリング
      rerender(<HeaderWithSettings />)
      
      // クラス名が変わらない（レイアウトシフトなし）
      expect(header.className).toBe(initialClassName)
    })

    it('インラインスタイルではなくCSSクラスでスタイリングされる', () => {
      render(<HeaderWithSettings />)
      
      const headerLink = screen.getByRole('link', { name: /ニコラン/ })
      
      // インラインスタイルがないか最小限であることを確認
      const style = headerLink.getAttribute('style')
      if (style) {
        // font-sizeやpaddingがインラインスタイルに含まれていないことを確認
        expect(style).not.toContain('font-size')
        expect(style).not.toContain('padding')
      }
    })
  })

  describe('ヘッダースタイルの正確性', () => {
    it('ニコランにtitleMainクラスが適用されてNicomoji Plus v2フォントが設定される', () => {
      render(<HeaderWithSettings />)
      
      const titleMain = screen.getByText('ニコラン')
      expect(titleMain.className).toContain('titleMain')
      
      // CSSファイルでtitleMainにNicomoji Plus v2が設定されているかをテスト
      // 現在は逆になっているため、このテストは失敗するはず
      const fs = require('fs')
      const path = require('path')
      const cssContent = fs.readFileSync(path.join(process.cwd(), 'components/header.module.css'), 'utf-8')
      
      // titleMainクラスの定義を探す
      const titleMainRegex = /\.titleMain\s*{[^}]+font-family:[^}]+}/s
      const titleMainMatch = cssContent.match(titleMainRegex)
      expect(titleMainMatch).toBeTruthy()
      expect(titleMainMatch[0]).toContain('Nicomoji Plus v2')
    })

    it('(Re:turn)にtitleSubクラスが適用されてComic Sans MS Boldフォントが設定される', () => {
      render(<HeaderWithSettings />)
      
      const titleSub = screen.getByText('(Re:turn)')
      expect(titleSub.className).toContain('titleSub')
      
      // CSSファイルでtitleSubにComic Sans MS Boldが設定されているかをテスト
      const fs = require('fs')
      const path = require('path')
      const cssContent = fs.readFileSync(path.join(process.cwd(), 'components/header.module.css'), 'utf-8')
      
      // titleSubクラスの定義を探す
      const titleSubRegex = /\.titleSub\s*{[^}]+font-family:[^}]+}/s
      const titleSubMatch = cssContent.match(titleSubRegex)
      expect(titleSubMatch).toBeTruthy()
      expect(titleSubMatch[0]).toContain('Comic Sans MS Bold')
    })

    it('ヘッダーテキストの色が白色である', () => {
      render(<HeaderWithSettings />)
      
      const titleMain = screen.getByText('ニコラン')
      const titleSub = screen.getByText('(Re:turn)')
      
      // CSSファイルで白色が設定されているかをテスト
      const fs = require('fs')
      const path = require('path')
      const cssContent = fs.readFileSync(path.join(process.cwd(), 'components/header.module.css'), 'utf-8')
      
      // titleMainとtitleSubのcolor設定を確認
      const titleMainRegex = /\.titleMain\s*{[^}]+}/s
      const titleMainMatch = cssContent.match(titleMainRegex)
      expect(titleMainMatch).toBeTruthy()
      expect(titleMainMatch[0]).toContain('color: white') // または color: #ffffff
    })

    it('モバイルでh1要素にフォントサイズが設定される', () => {
      // モバイルサイズに設定
      Object.defineProperty(window, 'innerWidth', {
        writable: true,
        configurable: true,
        value: 375
      })
      
      render(<HeaderWithSettings />)
      
      // h1要素がheaderTitleクラスを持つことを確認
      const h1Element = screen.getByRole('heading', { level: 1 })
      const linkElement = screen.getByRole('link', { name: /ニコラン/ })
      
      // CSSファイルで.headerTitleに対してフォントサイズが設定されているかを確認
      const fs = require('fs')
      const path = require('path')
      const cssContent = fs.readFileSync(path.join(process.cwd(), 'components/header.module.css'), 'utf-8')
      
      // h1要素にフォントサイズが適用されるように、h1セレクタも必要
      const h1FontSizeRegex = /\.headerTitle\s+h1.*{[^}]*font-size:[^}]+}/s
      const h1Match = cssContent.match(h1FontSizeRegex)
      
      // 現在の実装では、.headerTitleがlinkに適用されているため、h1に直接フォントサイズが設定されていない
      expect(h1Match).toBeTruthy()
    })
  })
})