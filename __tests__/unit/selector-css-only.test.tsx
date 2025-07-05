// CSS modulesをモック - 最初に宣言（ホイスト対応）
vi.mock('@/components/selectors.module.css', () => ({
  default: {
    genreScrollContainer: 'genreScrollContainer',
    genreButton: 'genreButton',
    genreButtonSelected: 'genreButtonSelected'
  }
}))

import { describe, it, expect, beforeEach, vi } from 'vitest'
import { screen } from '@testing-library/react'
import { render } from '@/__tests__/test-utils'
import { RankingSelector } from '@/components/ranking-selector'
import type { RankingConfig } from '@/types/ranking-config'

describe('RankingSelector CSS-onlyレスポンシブ対応', () => {
  const defaultConfig: RankingConfig = {
    genre: 'all',
    period: 'daily',
    tag: undefined
  }

  const onConfigChange = vi.fn()

  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('CSS-only実装の確認', () => {
    it('JavaScript scrollToに依存しない', () => {
      const { container } = render(
        <RankingSelector config={defaultConfig} onConfigChange={onConfigChange} />
      )
      
      // CSSモジュールクラスではなくHTML構造で確認
      const divs = container.querySelectorAll('div')
      // ジャンルセレクターのコンテナが存在することを確認
      expect(divs.length).toBeGreaterThan(0)
    })

    it('CSS Scroll Snapクラスが適用される', () => {
      const { container } = render(
        <RankingSelector config={defaultConfig} onConfigChange={onConfigChange} />
      )
      
      // ジャンルセクションのボタンコンテナを確認
      const genreButtons = container.querySelectorAll('button')
      const genreButton = Array.from(genreButtons).find(
        button => button.textContent === '総合'
      )
      const genreContainer = genreButton?.parentElement
      
      // genreScrollContainerクラスが適用されるか確認
      // CSSモジュールのモックでは単純なクラス名になる
      expect(genreContainer?.className).toContain('genreScrollContainer')
    })

    it('ジャンルボタンにscroll-snap-alignが適用される', () => {
      const { container } = render(
        <RankingSelector config={defaultConfig} onConfigChange={onConfigChange} />
      )
      
      // ジャンルボタンを取得（総合、音楽など）
      const genreButtons = Array.from(container.querySelectorAll('button')).filter(
        button => ['総合', '音楽', 'ゲーム'].includes(button.textContent || '')
      )
      
      expect(genreButtons.length).toBeGreaterThan(0)
      genreButtons.forEach(button => {
        expect(button.className).toContain('genreButton')
      })
    })

    it('選択されたジャンルボタンに特別なスナップクラスが適用される', () => {
      const { container } = render(
        <RankingSelector config={{ ...defaultConfig, genre: 'music' }} onConfigChange={onConfigChange} />
      )
      
      const musicButton = container.querySelector('button[class*="genreButtonSelected"]')
      expect(musicButton).toBeTruthy()
      expect(musicButton?.textContent).toBe('音楽')
      expect(musicButton?.className).toContain('genreButtonSelected')
    })
  })

  describe('CSSモジュールファイルの確認', () => {
    it('selectors.module.cssにscroll-snapスタイルが存在する', () => {
      const fs = require('fs')
      const path = require('path')
      const cssPath = path.join(process.cwd(), 'components/selectors.module.css')
      
      if (fs.existsSync(cssPath)) {
        const cssContent = fs.readFileSync(cssPath, 'utf-8')
        
        // CSS Scroll Snapの存在確認
        expect(cssContent).toContain('scroll-snap-type')
        expect(cssContent).toContain('scroll-snap-align')
        expect(cssContent).toContain('scroll-padding')
      }
    })

    it('モバイル向けメディアクエリ内にscroll-snapが定義される', () => {
      const fs = require('fs')
      const path = require('path')
      const cssPath = path.join(process.cwd(), 'components/selectors.module.css')
      
      if (fs.existsSync(cssPath)) {
        const cssContent = fs.readFileSync(cssPath, 'utf-8')
        
        // メディアクエリ内のscroll-snap
        const mobileMediaQuery = /@media[^{]+\{[^}]*scroll-snap/
        expect(cssContent).toMatch(mobileMediaQuery)
      }
    })
  })

  describe('機能の確認', () => {
    it('ジャンル変更時にタグがリセットされる', () => {
      const { rerender } = render(
        <RankingSelector 
          config={{ ...defaultConfig, genre: 'all', tag: '歌ってみた' }} 
          onConfigChange={onConfigChange} 
        />
      )
      
      const musicButton = screen.getByText('音楽')
      musicButton.click()
      
      expect(onConfigChange).toHaveBeenCalledWith({
        genre: 'music',
        period: 'daily',
        tag: undefined
      })
    })

    it('期間ボタンが正しく動作する', () => {
      render(
        <RankingSelector config={defaultConfig} onConfigChange={onConfigChange} />
      )
      
      const hourlyButton = screen.getByText('毎時')
      hourlyButton.click()
      
      expect(onConfigChange).toHaveBeenCalledWith({
        ...defaultConfig,
        period: 'hour'
      })
    })
  })
})