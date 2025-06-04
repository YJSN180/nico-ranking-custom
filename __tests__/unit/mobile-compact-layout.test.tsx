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

describe('モバイルコンパクトレイアウト', () => {
  const mockItem: RankingItem = {
    rank: 1,
    id: 'sm12345',
    title: '【初音ミク】みんなみくみくにしてあげる♪【してやんよ】これは長いタイトルの例です',
    thumbURL: 'https://example.com/thumb.jpg',
    views: 14684,
    comments: 47,
    mylists: 234,
    likes: 2401,
    authorId: 'user123',
    authorName: 'テスト投稿者',
    authorIcon: 'https://example.com/author-icon.jpg',
    registeredAt: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(), // 2時間前
  }

  it('モバイルで動画カードがコンパクトに表示される', () => {
    render(<RankingItemComponent item={mockItem} isMobile={true} />)
    
    const card = screen.getByTestId('ranking-item')
    expect(card).toBeInTheDocument()
    
    // コンパクトなクラスが適用されている
    expect(card.className).toContain('mobile-compact')
  })

  it('タイトルが最大2行で省略される', () => {
    render(<RankingItemComponent item={mockItem} isMobile={true} />)
    
    const title = screen.getByTestId('video-title')
    
    // インラインスタイルを直接確認
    expect(title.style.overflow).toBe('hidden')
    expect(title.style.display).toBe('-webkit-box')
    // React は WebkitLineClamp を kebab-case に変換する
    expect(title.style.getPropertyValue('-webkit-line-clamp')).toBe('2')
  })

  it('再生数が1万以上の場合「万」表記になる', () => {
    render(<RankingItemComponent item={mockItem} isMobile={true} />)
    
    const stats = screen.getByTestId('video-stats')
    expect(stats.textContent).toContain('👁1.4万')
  })

  it('再生数が1万未満の場合カンマ区切り表記になる', () => {
    const itemUnder10k = { ...mockItem, views: 2401, likes: 500 } // likesも違う値に
    render(<RankingItemComponent item={itemUnder10k} isMobile={true} />)
    
    // 統計情報内で確認
    const stats = screen.getByTestId('video-stats')
    expect(stats.textContent).toContain('👁2,401')
  })

  it('統計情報が1行にコンパクトに表示される', () => {
    render(<RankingItemComponent item={mockItem} isMobile={true} />)
    
    // 形式: 👁1.4万 💬47 📁234 ❤️2,401
    const stats = screen.getByTestId('video-stats')
    expect(stats.textContent).toMatch(/👁1\.4万.*💬47.*📁234.*❤️2,401/)
  })

  it('投稿者名が表示される', () => {
    render(<RankingItemComponent item={mockItem} isMobile={true} />)
    
    expect(screen.getByText('テスト投稿者')).toBeInTheDocument()
  })

  it('サムネイルサイズが110x62pxに設定される', () => {
    render(<RankingItemComponent item={mockItem} isMobile={true} />)
    
    const thumbnail = screen.getByAltText(mockItem.title)
    expect(thumbnail).toHaveAttribute('width', '110')
    expect(thumbnail).toHaveAttribute('height', '62')
  })

  it('投稿者アイコンが表示される', () => {
    render(<RankingItemComponent item={mockItem} isMobile={true} />)
    
    const authorIcon = screen.getByAltText(mockItem.authorName || '')
    expect(authorIcon).toBeInTheDocument()
    expect(authorIcon).toHaveAttribute('width', '14')
    expect(authorIcon).toHaveAttribute('height', '14')
    expect(authorIcon).toHaveStyle({ borderRadius: '50%' })
  })

  it('投稿日時が投稿者名の横に表示される', () => {
    render(<RankingItemComponent item={mockItem} isMobile={true} />)
    
    expect(screen.getByText('2時間前')).toBeInTheDocument()
  })
})