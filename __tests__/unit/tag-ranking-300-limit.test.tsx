import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import ClientPage from '@/app/client-page'

// モックの設定（他のテストファイルと同じ）
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

describe('タグ別ランキング300件制限', () => {
  const createMockData = (count: number) => {
    return Array.from({ length: count }, (_, i) => ({
      rank: i + 1,
      id: `sm${i + 1}`,
      title: `Test Video ${i + 1}`,
      thumbURL: 'https://example.com/thumb.jpg',
      views: 1000 - i,
      comments: 10,
      mylists: 5,
      likes: 2,
      tags: ['tag1', 'tag2'],
      authorId: 'user123',
      authorName: 'Test User',
      authorIcon: 'https://example.com/icon.jpg'
    }))
  }

  it('タグ別ランキングは300件すべて表示される', () => {
    const mockData = createMockData(300)
    
    render(
      <ClientPage 
        initialData={mockData}
        initialGenre="all"
        initialPeriod="24h"
        initialTag="MMD"
        popularTags={[]}
      />
    )
    
    // 300件すべてが表示されることを確認
    const items = screen.getAllByText(/Test Video \d+/)
    expect(items).toHaveLength(300)
    
    // 「もっと見る」ボタンが表示されないことを確認
    expect(screen.queryByText('もっと見る')).not.toBeInTheDocument()
    
    // 表示件数情報を確認
    expect(screen.getByText(/300件表示中/)).toBeInTheDocument()
    expect(screen.getByText(/タグ別ランキング: 最大300件/)).toBeInTheDocument()
  })

  it('タグ別ランキングが300件未満の場合も正しく表示される', () => {
    const mockData = createMockData(150)
    
    render(
      <ClientPage 
        initialData={mockData}
        initialGenre="all"
        initialPeriod="24h"
        initialTag="ゲーム実況"
        popularTags={[]}
      />
    )
    
    // 150件すべてが表示されることを確認
    const items = screen.getAllByText(/Test Video \d+/)
    expect(items).toHaveLength(150)
    
    // 「もっと見る」ボタンが表示されないことを確認
    expect(screen.queryByText('もっと見る')).not.toBeInTheDocument()
    
    // 表示件数情報を確認
    expect(screen.getByText(/150件表示中/)).toBeInTheDocument()
  })
})