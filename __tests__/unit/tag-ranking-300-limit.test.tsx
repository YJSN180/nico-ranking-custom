import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '../test-utils'
import ClientPage from '@/app/client-page'

// モックの設定（他のテストファイルと同じ）
// Navigation mock is provided by global setup in vitest.setup.ts

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

  it('タグ別ランキングは最初の100件が表示される（ページネーション）', () => {
    const mockItems = createMockData(300)
    const mockData = { items: mockItems }
    
    render(
      <ClientPage 
        initialData={mockData}
        allRankingData={mockItems}
        initialGenre="all"
        initialPeriod="24h"
        initialTag="MMD"
        popularTags={[]}
      />
    )
    
    // 最初の100件が表示されることを確認
    const items = screen.getAllByText(/Test Video \d+/)
    expect(items).toHaveLength(100)
    
    // ページネーションが表示されることを確認
    const paginations = screen.queryAllByRole('navigation', { name: 'ページネーション' })
    expect(paginations.length).toBeGreaterThan(0)
    
    // ページサマリーからページ数を確認（モバイル用の表示）
    const pageSummaries = screen.queryAllByTestId('page-summary')
    expect(pageSummaries.length).toBeGreaterThan(0)
    expect(pageSummaries[0]).toHaveTextContent('1 / 3')
  })

  it('タグ別ランキングが100件を超える場合はページネーションが表示される', () => {
    const mockItems = createMockData(150)
    const mockData = { items: mockItems }
    
    render(
      <ClientPage 
        initialData={mockData}
        allRankingData={mockItems}
        initialGenre="all"
        initialPeriod="24h"
        initialTag="ゲーム実況"
        popularTags={[]}
      />
    )
    
    // 最初の100件が表示されることを確認
    const items = screen.getAllByText(/Test Video \d+/)
    expect(items).toHaveLength(100)
    
    // ページネーションが表示されることを確認
    const paginations = screen.queryAllByRole('navigation', { name: 'ページネーション' })
    expect(paginations.length).toBeGreaterThan(0)
    
    // ページサマリーからページ数を確認（モバイル用の表示）
    const pageSummaries = screen.queryAllByTestId('page-summary')
    expect(pageSummaries.length).toBeGreaterThan(0)
    expect(pageSummaries[0]).toHaveTextContent('1 / 2')
  })
})