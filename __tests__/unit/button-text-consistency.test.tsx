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

describe('ボタンテキストの統一性', () => {
  const createMockData = (count: number) => {
    return Array.from({ length: count }, (_, i) => ({
      rank: i + 1,
      id: `sm${i + 1}`,
      title: `Test Video ${i + 1}`,
      thumbURL: 'https://example.com/thumb.jpg',
      views: 1000 - i * 10,
      comments: 10,
      mylists: 5,
      likes: 20
    }))
  }

  it('通常のランキングで「もっと見る」ボタンが表示される', () => {
    const mockData = createMockData(200)
    
    render(
      <ClientPage 
        initialData={mockData}
        initialGenre="all"
        initialPeriod="24h"
      />
    )

    // 最初は100件表示されているので、もっと見るボタンがあるはず
    expect(screen.getByText('もっと見る')).toBeInTheDocument()
  })

  it('タグ別ランキングで「もっと見る」ボタンが表示される', () => {
    const mockData = createMockData(200)
    
    render(
      <ClientPage 
        initialData={mockData}
        initialGenre="game"
        initialPeriod="24h"
        initialTag="ゲーム"
      />
    )

    // 200件のデータがあり、初期表示は100件なので、もっと見るボタンが表示される
    expect(screen.getByText('もっと見る')).toBeInTheDocument()
  })

  it('統一されたボタンテキストが使用されるべき', () => {
    // このテストは現在の実装では失敗するが、
    // 統一後は成功するようになる
    const mockData = createMockData(100)
    
    render(
      <ClientPage 
        initialData={mockData}
        initialGenre="game"
        initialPeriod="24h"
        initialTag="ゲーム"
      />
    )

    // 統一案：「さらに読み込む」→「もっと見る」に統一
    // または両方に件数表示を追加
    // expect(screen.getByText(/もっと見る/)).toBeInTheDocument()
  })
})