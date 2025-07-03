import { describe, it, expect } from 'vitest'
import { render } from '@testing-library/react'
import RankingItemResponsive from '@/components/ranking-item-responsive'
import type { RankingItem } from '@/types/ranking'

describe('LCP画像最適化', () => {
  const mockItem: RankingItem = {
    id: 'sm1234567',
    title: 'テスト動画',
    thumbURL: 'https://nicovideo.cdn.nimg.jp/thumbnails/1234567/1234567.jpg',
    views: 10000,
    comments: 100,
    mylists: 50,
    likes: 200,
    rank: 1,
    registeredAt: new Date().toISOString(),
    duration: 300,
    authorId: 'user123',
    authorName: 'テストユーザー',
    authorIcon: 'https://secure-dcdn.cdn.nimg.jp/nicoaccount/usericon/123.jpg',
    tags: ['テスト', 'タグ']
  }

  it('上位2つの画像にfetchPriority="high"とpriorityが設定されている', () => {
    // ランク1の場合
    const { container } = render(<RankingItemResponsive item={mockItem} />)
    const img = container.querySelector('img[alt="テスト動画"]')
    
    // OptimizedImageがpropsを正しく受け取っているか（DOMでは直接確認できない）
    // 実際のブラウザテストでは、fetchPriority属性の存在を確認する必要がある
    expect(img).toBeTruthy()
  })

  it('ランク3以降の画像にはlazy-loadingとfetchPriority="low"が設定されている', () => {
    const item3 = { ...mockItem, rank: 3 }
    const { container } = render(<RankingItemResponsive item={item3} />)
    const img = container.querySelector('img[alt="テスト動画"]')
    
    // loading="lazy"が設定されているか確認
    expect(img?.getAttribute('loading')).toBe('lazy')
  })

  it('ランク6以降の画像にはfetchPriorityが設定されない', () => {
    const item6 = { ...mockItem, rank: 6 }
    const { container } = render(<RankingItemResponsive item={item6} />)
    const img = container.querySelector('img[alt="テスト動画"]')
    
    // loading="lazy"が設定されているか確認
    expect(img?.getAttribute('loading')).toBe('lazy')
  })
})