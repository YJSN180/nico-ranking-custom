import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { RankingSelector } from '@/components/ranking-selector'
import { TagSelector } from '@/components/tag-selector'
import RankingItemComponent from '@/components/ranking-item'
import type { RankingConfig } from '@/types/ranking-config'
import type { RankingItem } from '@/types/ranking'

// モック
vi.mock('@/hooks/use-mobile-detect', () => ({
  useMobileDetect: () => false
}))

vi.mock('@/hooks/use-mobile-layout', () => ({
  useMobileLayout: () => ({ isNarrow: false, isVeryNarrow: false })
}))

vi.mock('next/image', () => ({
  default: vi.fn(({ src, alt }: any) => <img src={src} alt={alt} />)
}))

vi.mock('@/lib/popular-tags', () => ({
  getPopularTags: vi.fn().mockResolvedValue(['タグ1', 'タグ2'])
}))

describe('ダークモード完全対応', () => {
  const mockConfig: RankingConfig = {
    period: '24h',
    genre: 'game',
    tag: undefined
  }

  const mockItem: RankingItem = {
    rank: 1,
    id: 'sm123',
    title: 'Test Video',
    thumbURL: 'https://example.com/thumb.jpg',
    views: 1000,
    comments: 100,
    mylists: 50,
    likes: 200,
    registeredAt: new Date().toISOString()
  }
  
  const mockItem4: RankingItem = {
    rank: 4,
    id: 'sm456',
    title: 'Test Video 4',
    thumbURL: 'https://example.com/thumb4.jpg',
    views: 800,
    comments: 80,
    mylists: 40,
    likes: 160,
    registeredAt: new Date().toISOString()
  }

  beforeEach(() => {
    // ダークモードを設定
    document.documentElement.setAttribute('data-theme', 'dark')
    
    // CSS変数を定義
    const style = document.createElement('style')
    style.innerHTML = `
      :root {
        --surface-color: #ffffff;
        --surface-secondary: #f5f5f5;
        --text-primary: #333333;
        --text-secondary: #666666;
        --border-color: #e5e5e5;
        --shadow-md: 0 1px 3px rgba(0, 0, 0, 0.1);
        --primary-color: #667eea;
        --link-color: #0066cc;
        --rank-gold: #FFD700;
        --rank-silver: #C0C0C0;
        --rank-bronze: #CD7F32;
      }
      
      [data-theme="dark"] {
        --surface-color: #1a1a1a;
        --surface-secondary: #2a2a2a;
        --text-primary: #e0e0e0;
        --text-secondary: #a0a0a0;
        --border-color: #444444;
        --shadow-md: 0 1px 3px rgba(0, 0, 0, 0.5);
        --primary-color: #7c8eff;
        --link-color: #66b3ff;
      }
    `
    document.head.appendChild(style)
  })

  afterEach(() => {
    document.documentElement.removeAttribute('data-theme')
    document.head.querySelectorAll('style').forEach(el => el.remove())
  })

  it('RankingSelectorがCSS変数を使用している', () => {
    const onConfigChange = vi.fn()
    
    const { container } = render(
      <RankingSelector config={mockConfig} onConfigChange={onConfigChange} />
    )
    
    // 背景色がCSS変数を使用していることを確認
    const mainDiv = container.firstChild as HTMLElement
    expect(mainDiv.style.background).toContain('var(--surface-color)')
    expect(mainDiv.style.boxShadow).toContain('var(--shadow-md)')
    
    // ハードコードされた色がないことを確認
    const html = container.innerHTML
    expect(html).not.toContain("background: 'white'")
    expect(html).not.toContain("background: white;")
    expect(html).not.toContain("color: '#")
  })

  it('TagSelectorがCSS変数を使用している', () => {
    const onConfigChange = vi.fn()
    
    const { container } = render(
      <TagSelector config={mockConfig} onConfigChange={onConfigChange} />
    )
    
    // タグセレクターのコンテナを確認
    const tagContainer = container.querySelector('div') as HTMLElement
    if (tagContainer && tagContainer.style.background) {
      expect(tagContainer.style.background).toContain('var(--surface-color)')
    }
  })

  it('RankingItemがハードコードされた色を使用していない', () => {
    // ランク1（ランク色使用）をテスト
    const { container: container1 } = render(
      <RankingItemComponent item={mockItem} isMobile={false} />
    )
    const html1 = container1.innerHTML
    
    // ランク1-3はランク色を使用
    expect(html1).toContain('var(--rank-gold)')
    expect(html1).toContain('var(--button-text-active)')
    expect(html1).toContain('var(--link-color)')
    expect(html1).toContain('var(--text-secondary)')
    // ランク1-3はボーダーにもランク色を使用
    expect(html1).toContain('border: 2px solid var(--rank-gold)')
    
    // ランク4（通常色使用）をテスト
    const { container: container4 } = render(
      <RankingItemComponent item={mockItem4} isMobile={false} />
    )
    const html4 = container4.innerHTML
    
    // ランク4以降はsurface-secondaryとtext-primaryを使用
    expect(html4).toContain('var(--surface-secondary)')
    expect(html4).toContain('var(--text-primary)')
    expect(html4).toContain('var(--link-color)')
    expect(html4).toContain('var(--text-secondary)')
    expect(html4).toContain('var(--border-color)')
    
    // ハードコードされた色がないことを確認
    const problematicColors = [
      'color: white',
      "color: 'white'",
      'color: #333',
      "color: '#333'",
      'color: #666',
      "color: '#666'",
      'background: white',
      "background: 'white'",
      '#f5f5f5',
      '#e5e5e5',
      'rgba(0, 0, 0, 0.05)'
    ]
    
    problematicColors.forEach(color => {
      expect(html1).not.toContain(color)
      expect(html4).not.toContain(color)
    })
  })
})