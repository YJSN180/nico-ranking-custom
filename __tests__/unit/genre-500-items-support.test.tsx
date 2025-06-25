import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import ClientPage from '@/app/client-page'

// モックの設定
vi.mock('next/navigation', () => ({
  useRouter: () => ({
    push: vi.fn(),
    replace: vi.fn(),
    prefetch: vi.fn(),
  }),
  useSearchParams: vi.fn(() => new URLSearchParams())
}))

vi.mock('@/hooks/use-user-preferences', () => ({
  useUserPreferences: () => ({
    preferences: null,
    updatePreferences: vi.fn(),
    isLoading: false
  })
}))

vi.mock('@/hooks/use-user-ng-list', () => ({
  useUserNGList: () => ({
    ngList: {
      videoIds: [],
      videoTitles: {
        exact: [],
        partial: []
      },
      authorIds: [],
      authorNames: {
        exact: [],
        partial: []
      },
      version: 1,
      totalCount: 0,
      updatedAt: new Date().toISOString()
    },
    addToNGList: vi.fn(),
    removeFromNGList: vi.fn(),
    filterItems: (items: any[]) => items,
    isLoading: false
  })
}))

vi.mock('@/hooks/use-realtime-stats', () => ({
  useRealtimeStats: (data: any[]) => ({
    items: data,
    isLoading: false,
    lastUpdated: null
  })
}))

describe('ジャンル別ランキング500件表示', () => {
  const createMockData = (count: number) => {
    return Array.from({ length: count }, (_, i) => ({
      rank: i + 1,
      id: `sm${i + 1}`,
      title: `Test Video ${i + 1}`,
      thumbURL: 'https://example.com/thumb.jpg',
      views: 10000 - i * 10,
      comments: 100 - i,
      mylists: 50 - Math.floor(i / 10),
      likes: 10,
      tags: ['tag1', 'tag2'],
      authorId: `user${i % 100}`,
      authorName: `Test User ${i % 100}`,
      authorIcon: 'https://example.com/icon.jpg'
    }))
  }

  it('ジャンル別ランキングは1ページ100件表示される', () => {
    const mockData = createMockData(1000)
    
    render(
      <ClientPage 
        initialData={mockData}
        initialGenre="game"
        initialPeriod="24h"
        popularTags={['アクション', 'RPG', 'シミュレーション']}
      />
    )
    
    // 1ページ目では100件が表示されることを確認
    const items = screen.getAllByText(/Test Video \d+/)
    expect(items).toHaveLength(100)
    
    // ページネーションが表示されることを確認（2ページ以上ある場合）
    expect(screen.queryByText('次へ') || screen.queryByText('2')).toBeTruthy()
    
    // 表示件数情報を確認（500件制限の100件表示）
    expect(screen.getByText(/100件表示/)).toBeInTheDocument()
  })

  it('ジャンル別ランキングが100件未満の場合も正しく表示される', () => {
    const mockData = createMockData(50)
    
    render(
      <ClientPage 
        initialData={mockData}
        initialGenre="entertainment"
        initialPeriod="hour"
        popularTags={['音楽', 'ダンス', 'お笑い']}
      />
    )
    
    // 50件すべてが表示されることを確認
    const items = screen.getAllByText(/Test Video \d+/)
    expect(items).toHaveLength(50)
    
    // ページネーションが表示されないことを確認
    expect(screen.queryByText('次へ')).not.toBeInTheDocument()
    
    // 表示件数情報を確認
    expect(screen.getByText(/50件表示/)).toBeInTheDocument()
  })
})