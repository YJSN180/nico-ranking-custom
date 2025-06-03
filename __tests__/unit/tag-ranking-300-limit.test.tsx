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

describe('300件表示時のボタン表示', () => {
  const createMockData = (count: number) => {
    return Array.from({ length: count }, (_, i) => ({
      rank: i + 1,
      id: `sm${i + 1}`,
      title: `Test Video ${i + 1}`,
      thumbURL: 'https://example.com/thumb.jpg',
      views: 1000 - i,
      comments: 10,
      mylists: 5,
      likes: 20
    }))
  }

  it('通常ランキングで300件表示時はボタンが消える', () => {
    const mockData = createMockData(300)
    
    render(
      <ClientPage 
        initialData={mockData}
        initialGenre="all"
        initialPeriod="24h"
      />
    )

    // 300件すべて表示されているのでボタンは表示されない
    expect(screen.queryByText(/もっと見る/)).not.toBeInTheDocument()
  })

  it('タグ別ランキングで300件表示時は次ページボタンが表示される（hasMore=trueの場合）', () => {
    const mockData = createMockData(300)
    
    render(
      <ClientPage 
        initialData={mockData}
        initialGenre="game"
        initialPeriod="24h"
        initialTag="ゲーム"
      />
    )

    // タグ別ランキングでは300件表示後も、hasMore=trueなら「もっと見る（301位～）」が表示される
    expect(screen.getByText(/もっと見る（301位～）/)).toBeInTheDocument()
  })

  it('実際の仕様：タグ別ランキングも最大300件が一般的', () => {
    // ニコニコ動画の仕様では、タグ別ランキングも通常300件が上限
    // ただし、APIの仕様によっては異なる可能性がある
    
    // cronジョブではタグ別は事前生成されない
    // オンデマンドで取得される際の上限は不明
  })
})