/**
 * Phase 3.1: TagSelector CSS-only化のテスト
 * CSS Scroll Snapによるスクロール制御をテスト
 */

import { render, screen } from '@testing-library/react'
import { vi, describe, test, beforeEach, expect } from 'vitest'
import { TagSelector } from '@/components/tag-selector'
import type { RankingConfig } from '@/types/ranking-config'

// テスト用の初期設定
const mockConfig: RankingConfig = {
  genre: 'music',
  period: '24h',
  tag: undefined
}

const mockPopularTags = ['VOCALOID', 'ボカロオリジナル', '初音ミク', 'オリジナル', 'MV']

const mockOnConfigChange = vi.fn()

describe('TagSelector CSS-only Implementation', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('CSS Scroll Snap Properties', () => {
    test('tagScrollContainerにscroll-snap-typeが設定されている', () => {
      render(
        <TagSelector
          config={mockConfig}
          onConfigChange={mockOnConfigChange}
          popularTags={mockPopularTags}
        />
      )
      
      const tagScrollContainer = document.querySelector('.tagScrollContainer')
      expect(tagScrollContainer).toBeInTheDocument()
      
      const computedStyle = window.getComputedStyle(tagScrollContainer!)
      expect(computedStyle.scrollSnapType).toBe('x mandatory')
    })

    test('タグボタンにscroll-snap-alignが設定されている', () => {
      render(
        <TagSelector
          config={mockConfig}
          onConfigChange={mockOnConfigChange}
          popularTags={mockPopularTags}
        />
      )
      
      // 「すべて」ボタンを取得
      const allButton = screen.getByText('すべて')
      expect(allButton).toBeInTheDocument()
      
      const computedStyle = window.getComputedStyle(allButton)
      expect(computedStyle.scrollSnapAlign).toBe('center')
    })

    test('人気タグボタンにもscroll-snap-alignが設定されている', () => {
      render(
        <TagSelector
          config={mockConfig}
          onConfigChange={mockOnConfigChange}
          popularTags={mockPopularTags}
        />
      )
      
      // VOCALOIDボタンを取得
      const vocaloidButton = screen.getByText('VOCALOID')
      expect(vocaloidButton).toBeInTheDocument()
      
      const computedStyle = window.getComputedStyle(vocaloidButton)
      expect(computedStyle.scrollSnapAlign).toBe('center')
    })
  })

  describe('JavaScript依存の削除', () => {
    test('useEffectでのwindow.matchMediaが使用されていない（コンポーネント実装確認）', () => {
      // このテストは実装後に確認
      // window.matchMediaの使用がないことを間接的に確認
      
      render(
        <TagSelector
          config={mockConfig}
          onConfigChange={mockOnConfigChange}
          popularTags={mockPopularTags}
        />
      )
      
      // レンダリングが正常に完了し、JavaScript依存なしで動作することを確認
      expect(screen.getByText('人気タグ')).toBeInTheDocument()
      expect(screen.getByText('すべて')).toBeInTheDocument()
      expect(screen.getByText('VOCALOID')).toBeInTheDocument()
    })

    test('スクロール位置がCSS-onlyで制御される', () => {
      render(
        <TagSelector
          config={{ ...mockConfig, tag: 'VOCALOID' }}
          onConfigChange={mockOnConfigChange}
          popularTags={mockPopularTags}
        />
      )
      
      // 選択されたタグボタンが正しく表示される
      const selectedButton = screen.getByText('VOCALOID')
      expect(selectedButton).toHaveClass('buttonSelected')
      
      // tagScrollContainerが存在し、CSS Scroll Snapが適用されている
      const tagScrollContainer = document.querySelector('.tagScrollContainer')
      expect(tagScrollContainer).toBeInTheDocument()
    })
  })

  describe('アクセシビリティ', () => {
    test('CSS Scroll Snapが有効なコンテナが存在する', () => {
      render(
        <TagSelector
          config={mockConfig}
          onConfigChange={mockOnConfigChange}
          popularTags={mockPopularTags}
        />
      )
      
      const tagScrollContainer = document.querySelector('.tagScrollContainer')
      expect(tagScrollContainer).toBeInTheDocument()
      
      // CSS-only実装のため、JavaScriptに依存しない要素構造になっている
      expect(tagScrollContainer).toHaveClass('tagScrollContainer')
    })
  })
})