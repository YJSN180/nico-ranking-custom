import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import RankingItemResponsive from '@/components/ranking-item-responsive'
import type { RankingItem } from '@/types/ranking'

// Mock components
vi.mock('@/components/optimized-image', () => ({
  OptimizedImage: ({ src, alt }: { src: string; alt: string }) => <img src={src} alt={alt} />
}))

vi.mock('@/components/mylist-button', () => ({
  MylistButton: () => <button>マイリスト</button>
}))

describe('Tag Display Feature', () => {
  const mockItem: RankingItem = {
    rank: 1,
    id: 'sm12345678',
    title: 'テスト動画',
    thumbURL: 'https://example.com/thumb.jpg',
    views: 1000,
    comments: 100,
    mylists: 50,
    likes: 200,
    tags: ['ゲーム', '実況プレイ動画', 'VOICEROID実況プレイ'],
    authorId: 'user123',
    authorName: 'テストユーザー',
    registeredAt: new Date().toISOString()
  }

  it('should not display tags when showTags is false', () => {
    render(<RankingItemResponsive item={mockItem} showTags={false} />)
    
    // タグが表示されていないことを確認
    expect(screen.queryByText('ゲーム')).not.toBeInTheDocument()
    expect(screen.queryByText('実況プレイ動画')).not.toBeInTheDocument()
    expect(screen.queryByText('VOICEROID実況プレイ')).not.toBeInTheDocument()
  })

  it('should display tags when showTags is true', () => {
    render(<RankingItemResponsive item={mockItem} showTags={true} />)
    
    // タグが表示されていることを確認
    expect(screen.getByText('ゲーム')).toBeInTheDocument()
    expect(screen.getByText('実況プレイ動画')).toBeInTheDocument()
    expect(screen.getByText('VOICEROID実況プレイ')).toBeInTheDocument()
  })

  it('should not display tags section when item has no tags', () => {
    const itemWithoutTags = { ...mockItem, tags: undefined }
    render(<RankingItemResponsive item={itemWithoutTags} showTags={true} />)
    
    // タグセクションが存在しないことを確認
    const tagsContainer = screen.queryByText((_, element) => {
      return element?.className === 'ranking-item-responsive__tags'
    })
    expect(tagsContainer).not.toBeInTheDocument()
  })

  it('should not display tags section when item has empty tags array', () => {
    const itemWithEmptyTags = { ...mockItem, tags: [] }
    render(<RankingItemResponsive item={itemWithEmptyTags} showTags={true} />)
    
    // タグセクションが存在しないことを確認
    const tagsContainer = screen.queryByText((_, element) => {
      return element?.className === 'ranking-item-responsive__tags'
    })
    expect(tagsContainer).not.toBeInTheDocument()
  })
})