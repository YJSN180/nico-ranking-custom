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
    ngList: [],
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

  it('ジャンル別ランキングは500件まで表示される', () => {
    const mockData = createMockData(1000)
    
    render(
      <ClientPage 
        initialData={mockData}
        initialGenre="game"
        initialPeriod="24h"
        popularTags={['アクション', 'RPG', 'シミュレーション']}
      />
    )
    
    // 500件が表示されることを確認
    const items = screen.getAllByText(/Test Video \d+/)
    expect(items).toHaveLength(500)
    
    // 「もっと見る」ボタンが表示されないことを確認
    expect(screen.queryByText('もっと見る')).not.toBeInTheDocument()
    
    // 表示件数情報を確認
    expect(screen.getByText(/500件表示中/)).toBeInTheDocument()
    expect(screen.getByText(/ジャンル別ランキング: 500件表示/)).toBeInTheDocument()
  })

  it('ジャンル別ランキングが500件未満の場合も正しく表示される', () => {
    const mockData = createMockData(250)
    
    render(
      <ClientPage 
        initialData={mockData}
        initialGenre="entertainment"
        initialPeriod="hour"
        popularTags={['音楽', 'ダンス', 'お笑い']}
      />
    )
    
    // 250件すべてが表示されることを確認
    const items = screen.getAllByText(/Test Video \d+/)
    expect(items).toHaveLength(250)
    
    // 「もっと見る」ボタンが表示されないことを確認
    expect(screen.queryByText('もっと見る')).not.toBeInTheDocument()
    
    // 表示件数情報を確認
    expect(screen.getByText(/250件表示中/)).toBeInTheDocument()
  })
})