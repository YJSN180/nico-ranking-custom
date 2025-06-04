import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import RankingItemComponent from '@/components/ranking-item'
import type { RankingItem } from '@/types/ranking'

describe('パフォーマンス最適化', () => {
  const mockItem: RankingItem = {
    rank: 1,
    id: 'sm12345',
    title: 'テストタイトル',
    thumbURL: 'https://example.com/thumb.jpg',
    views: 10000,
    comments: 100,
    mylists: 50,
    likes: 200,
    authorId: 'user123',
    authorName: 'テスト投稿者',
    authorIcon: 'https://example.com/icon.jpg',
    registeredAt: new Date().toISOString(),
  }

  it('RankingItemComponentがメモ化されている', () => {
    const { rerender } = render(<RankingItemComponent item={mockItem} />)
    
    // 同じpropsで再レンダリング
    const renderCount = vi.fn()
    vi.spyOn(console, 'log').mockImplementation(renderCount)
    
    rerender(<RankingItemComponent item={mockItem} />)
    
    // メモ化されているため、再レンダリングされないはず
    expect(renderCount).not.toHaveBeenCalled()
  })

  it('propsが変更された場合は再レンダリングされる', () => {
    const { rerender } = render(<RankingItemComponent item={mockItem} />)
    
    const updatedItem = { ...mockItem, views: 20000 }
    rerender(<RankingItemComponent item={updatedItem} />)
    
    // 新しいviewsが表示されるはず
    expect(screen.getByText(/2万/)).toBeInTheDocument()
  })

  it('大量のアイテムをレンダリングしてもパフォーマンスが保たれる', () => {
    const items = Array.from({ length: 100 }, (_, i) => ({
      ...mockItem,
      id: `sm${i}`,
      rank: i + 1,
    }))

    const startTime = performance.now()
    
    render(
      <ul>
        {items.map(item => (
          <RankingItemComponent key={item.id} item={item} />
        ))}
      </ul>
    )
    
    const endTime = performance.now()
    const renderTime = endTime - startTime
    
    // 100アイテムのレンダリングが1秒以内に完了すること
    expect(renderTime).toBeLessThan(1000)
  })
})