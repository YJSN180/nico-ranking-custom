import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import RankingItemComponent from '@/components/ranking-item'
import type { RankingItem } from '@/types/ranking'

// window.matchMediaのモック
Object.defineProperty(window, 'matchMedia', {
  writable: true,
  value: vi.fn().mockImplementation(query => ({
    matches: query === '(max-width: 640px)',
    media: query,
    onchange: null,
    addListener: vi.fn(),
    removeListener: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  })),
})

describe('モバイル版リンク挙動の統一', () => {
  const mockItem: RankingItem = {
    rank: 1,
    id: 'sm12345',
    title: 'テスト動画タイトル',
    thumbURL: 'https://example.com/thumb.jpg',
    views: 1000,
    comments: 50,
    mylists: 10,
    likes: 100,
  }

  it('モバイル版でも動画タイトルが新しいタブで開く', () => {
    render(<RankingItemComponent item={mockItem} isMobile={true} />)
    
    const titleLink = screen.getByTestId('video-title')
    expect(titleLink).toHaveAttribute('target', '_blank')
    expect(titleLink).toHaveAttribute('rel', 'noopener noreferrer')
    expect(titleLink).toHaveAttribute('href', 'https://www.nicovideo.jp/watch/sm12345')
  })

  it('モバイル版でもサムネイルが新しいタブで開く', () => {
    render(<RankingItemComponent item={mockItem} isMobile={true} />)
    
    // サムネイルのリンクを取得（親要素のaタグ）
    const thumbnailLinks = screen.getAllByRole('link')
    const thumbnailLink = thumbnailLinks.find(link => 
      link.querySelector('img[alt="テスト動画タイトル"]')
    )
    
    expect(thumbnailLink).toHaveAttribute('target', '_blank')
    expect(thumbnailLink).toHaveAttribute('rel', 'noopener noreferrer')
    expect(thumbnailLink).toHaveAttribute('href', 'https://www.nicovideo.jp/watch/sm12345')
  })

  it('デスクトップ版でも動画タイトルが新しいタブで開く', () => {
    render(<RankingItemComponent item={mockItem} isMobile={false} />)
    
    // タイトルのリンクを特定（画像ではないリンク）
    const allLinks = screen.getAllByRole('link')
    const titleLink = allLinks.find(link => 
      link.textContent === 'テスト動画タイトル'
    )
    
    expect(titleLink).toHaveAttribute('target', '_blank')
    expect(titleLink).toHaveAttribute('rel', 'noopener noreferrer')
    expect(titleLink).toHaveAttribute('href', 'https://www.nicovideo.jp/watch/sm12345')
  })

  it('デスクトップ版でもサムネイルが新しいタブで開く', () => {
    render(<RankingItemComponent item={mockItem} isMobile={false} />)
    
    const thumbnailLinks = screen.getAllByRole('link')
    const thumbnailLink = thumbnailLinks.find(link => 
      link.querySelector('img[alt="テスト動画タイトル"]')
    )
    
    expect(thumbnailLink).toHaveAttribute('target', '_blank')
    expect(thumbnailLink).toHaveAttribute('rel', 'noopener noreferrer')
    expect(thumbnailLink).toHaveAttribute('href', 'https://www.nicovideo.jp/watch/sm12345')
  })
})