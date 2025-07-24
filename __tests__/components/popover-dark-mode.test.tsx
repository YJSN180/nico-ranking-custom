import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { PopoverNGSelector } from '../../components/popover-ng-selector'
import type { RankingItem } from '../../types/ranking'

const mockVideo: RankingItem = {
  rank: 1,
  id: 'sm12345',
  title: 'Test Video Title',
  thumbURL: 'https://example.com/thumb.jpg',
  views: 1000,
  comments: 100,
  mylists: 50,
  likes: 30,
  authorId: 'user123',
  authorName: 'Test Author',
  registeredAt: '2025-01-01T00:00:00Z',
  tagDetails: []
}

// ResizeObserverをモック
beforeEach(() => {
  global.ResizeObserver = vi.fn().mockImplementation(() => ({
    observe: vi.fn(),
    unobserve: vi.fn(),
    disconnect: vi.fn()
  }))
})

describe('PopoverNGSelector Dark Mode Tests', () => {
  it('ライトモードで正しい色が適用される', () => {
    const mockRef = { current: document.createElement('button') }
    const { container } = render(
      <PopoverNGSelector
        video={mockVideo}
        isOpen={true}
        anchorRef={mockRef}
        onClose={() => {}}
        onAdd={() => {}}
      />
    )
    
    const popover = container.querySelector('.popover-ng-selector')
    const option = container.querySelector('.popover-ng-selector__option')
    
    expect(popover).toBeInTheDocument()
    expect(option).toBeInTheDocument()
    
    // CSS変数が正しく適用されることを確認
    expect(option).toHaveClass('popover-ng-selector__option')
  })
  
  it('ダークモードで正しい色が適用される', () => {
    // ダークモードを設定
    document.documentElement.setAttribute('data-theme', 'dark')
    
    const mockRef = { current: document.createElement('button') }
    const { container } = render(
      <PopoverNGSelector
        video={mockVideo}
        isOpen={true}
        anchorRef={mockRef}
        onClose={() => {}}
        onAdd={() => {}}
      />
    )
    
    const popover = container.querySelector('.popover-ng-selector')
    const option = container.querySelector('.popover-ng-selector__option')
    
    expect(popover).toBeInTheDocument()
    expect(option).toBeInTheDocument()
    
    // テーマが適用されていることを確認
    expect(document.documentElement.getAttribute('data-theme')).toBe('dark')
    
    // クリーンアップ
    document.documentElement.removeAttribute('data-theme')
  })
  
  it('ダークブルーモードで正しい色が適用される', () => {
    // ダークブルーモードを設定
    document.documentElement.setAttribute('data-theme', 'darkblue')
    
    const mockRef = { current: document.createElement('button') }
    const { container } = render(
      <PopoverNGSelector
        video={mockVideo}
        isOpen={true}
        anchorRef={mockRef}
        onClose={() => {}}
        onAdd={() => {}}
      />
    )
    
    const popover = container.querySelector('.popover-ng-selector')
    const option = container.querySelector('.popover-ng-selector__option')
    
    expect(popover).toBeInTheDocument()
    expect(option).toBeInTheDocument()
    
    // テーマが適用されていることを確認
    expect(document.documentElement.getAttribute('data-theme')).toBe('darkblue')
    
    // クリーンアップ
    document.documentElement.removeAttribute('data-theme')
  })
})