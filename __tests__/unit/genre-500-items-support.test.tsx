import { describe, it, expect, vi } from 'vitest'
import { screen } from '@testing-library/react'
import { render } from '@/__tests__/test-utils'
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
    lastUpdated: null,
    hasRealtimeData: false
  })
}))

vi.mock('@/hooks/use-video-tags', () => ({
  useVideoTags: (data: any[]) => ({
    items: data,
    isLoading: false
  })
}))

vi.mock('@/lib/request-throttle', () => ({
  requestThrottle: {
    throttle: vi.fn().mockResolvedValue(undefined)
  }
}))

vi.mock('@/lib/ranking-cache', () => ({
  rankingCache: {
    get: vi.fn().mockReturnValue(null),
    set: vi.fn()
  }
}))

// TagSelectorのモック（動的インポート対応）
vi.mock('@/components/tag-selector', () => ({
  TagSelector: () => null
}))

// Paginationのモック（動的インポート対応）
vi.mock('@/components/pagination', () => ({
  default: ({ currentPage, totalPages, onPageChange }: any) => (
    <div>
      {Array.from({ length: totalPages }, (_, i) => (
        <button key={i + 1} onClick={() => onPageChange(i + 1)}>
          {i + 1}
        </button>
      ))}
    </div>
  )
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

  it('ジャンル別ランキングは1ページ100件表示される', async () => {
    const mockData = createMockData(500)
    
    render(
      <ClientPage 
        initialData={{ items: mockData }}
        allRankingData={mockData}
        initialGenre="game"
        initialPeriod="24h"
        popularTags={['アクション', 'RPG', 'シミュレーション']}
      />
    )
    
    // 動画アイテムが表示されるまで待つ
    const firstVideo = await screen.findByText('Test Video 1')
    expect(firstVideo).toBeInTheDocument()
    
    // data-testid="ranking-item" で動画アイテムを取得
    const items = screen.getAllByTestId('ranking-item')
    expect(items).toHaveLength(100)
    
    // ページネーションが表示されることを確認（ボタンで絞り込み）
    const paginationButtons = screen.getAllByRole('button')
    const pageButtons = paginationButtons.filter(btn => {
      const text = btn.textContent
      return text === '2' || text === '3' || text === '4' || text === '5'
    })
    expect(pageButtons.length).toBeGreaterThan(0)
  })

  it('ジャンル別ランキングが100件未満の場合も正しく表示される', async () => {
    const mockData = createMockData(50)
    
    render(
      <ClientPage 
        initialData={{ items: mockData }}
        allRankingData={mockData}
        initialGenre="entertainment"
        initialPeriod="hour"
        popularTags={['音楽', 'ダンス', 'お笑い']}
      />
    )
    
    // 動画アイテムが表示されるまで待つ
    const firstVideo = await screen.findByText('Test Video 1')
    expect(firstVideo).toBeInTheDocument()
    
    // data-testid="ranking-item" で動画アイテムを取得
    const items = screen.getAllByTestId('ranking-item')
    expect(items).toHaveLength(50)
    
    // ページネーションが表示されないことを確認
    // ページネーションのモックでは50件以下の場合は1ページのみ
    const paginationDiv = screen.queryByRole('navigation') || 
                         screen.queryAllByRole('button').find(btn => btn.textContent === '1')?.parentElement
    
    if (paginationDiv) {
      // ページ番号2のボタンが存在しないことを確認
      const pageButton2 = screen.queryAllByRole('button').find(btn => 
        btn.textContent === '2' && btn.parentElement === paginationDiv
      )
      expect(pageButton2).toBeUndefined()
    }
  })
})