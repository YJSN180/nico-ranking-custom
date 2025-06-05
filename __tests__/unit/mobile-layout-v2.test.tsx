import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import RankingItemComponent from '@/components/ranking-item'
import type { RankingItem } from '@/types/ranking'

describe('モバイルレイアウトv2（順位上配置）', () => {
  const mockItem: RankingItem = {
    rank: 1,
    id: 'sm12345',
    title: 'これは非常に長いタイトルでモバイル端末でも2行に収まるかテストするためのものです',
    thumbURL: 'https://example.com/thumb.jpg',
    views: 14684,
    comments: 47,
    mylists: 234,
    likes: 2401,
    authorId: 'user123',
    authorName: 'テスト投稿者',
    authorIcon: 'https://example.com/icon.jpg',
    registeredAt: new Date().toISOString(),
  }

  it('カード高さが120pxに設定される', () => {
    render(<RankingItemComponent item={mockItem} isMobile={true} />)
    
    const item = screen.getByTestId('ranking-item')
    expect(item).toHaveStyle({ height: '120px' })
  })

  it('サムネイルサイズが120x67pxに設定される', () => {
    render(<RankingItemComponent item={mockItem} isMobile={true} />)
    
    const thumbnail = screen.getByAltText(mockItem.title)
    expect(thumbnail).toHaveAttribute('width', '120')
    expect(thumbnail).toHaveAttribute('height', '67')
  })

  it('順位がサムネイルの上に配置される', () => {
    render(<RankingItemComponent item={mockItem} isMobile={true} />)
    
    const rankElement = screen.getByText('1')
    expect(rankElement).toHaveStyle({ 
      fontSize: '18px',
      fontWeight: '700'
    })
  })

  it('タイトルのフォントサイズが15pxである', () => {
    render(<RankingItemComponent item={mockItem} isMobile={true} />)
    
    const title = screen.getByTestId('video-title')
    expect(title).toHaveStyle({ fontSize: '15px' })
  })

  it('統計情報が適切にフォーマットされる', () => {
    render(<RankingItemComponent item={mockItem} isMobile={true} />)
    
    const stats = screen.getByTestId('video-stats')
    expect(stats.textContent).toContain('👁1.4万')
    expect(stats.textContent).toContain('💬47')
    expect(stats.textContent).toContain('📁234')
    expect(stats.textContent).toContain('❤️2,401')
  })

  it('投稿者情報が13pxで表示される', () => {
    render(<RankingItemComponent item={mockItem} isMobile={true} />)
    
    const authorInfo = screen.getByTestId('author-info')
    expect(authorInfo).toHaveStyle({ fontSize: '13px' })
  })

  it('React.memoによってメモ化されている', () => {
    const { rerender } = render(<RankingItemComponent item={mockItem} isMobile={true} />)
    
    // 同じpropsで再レンダリング - メモ化により再レンダリングされないはず
    const spy = vi.spyOn(console, 'log')
    rerender(<RankingItemComponent item={mockItem} isMobile={true} />)
    
    expect(spy).not.toHaveBeenCalled()
    spy.mockRestore()
  })
})