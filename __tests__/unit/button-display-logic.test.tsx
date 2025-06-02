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

describe('もっと見るボタンの表示ロジック', () => {
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

  it('47件しかないタグ別ランキングではボタンが表示されない', () => {
    const mockData = createMockData(47)
    
    render(
      <ClientPage 
        initialData={mockData}
        initialGenre="game"
        initialPeriod="24h"
        initialTag="レアタグ"
      />
    )

    // 47件すべて表示されており、hasMore=falseなのでボタンは表示されない
    expect(screen.queryByText('もっと見る')).not.toBeInTheDocument()
  })

  it('100件ちょうどのタグ別ランキングではボタンが表示される', () => {
    const mockData = createMockData(100)
    
    render(
      <ClientPage 
        initialData={mockData}
        initialGenre="game"
        initialPeriod="24h"
        initialTag="人気タグ"
      />
    )

    // 100件ちょうどなので、まだデータがある可能性
    expect(screen.getByText('もっと見る')).toBeInTheDocument()
  })

  it('通常ランキングで150件ある場合', () => {
    const mockData = createMockData(150)
    
    render(
      <ClientPage 
        initialData={mockData}
        initialGenre="all"
        initialPeriod="24h"
      />
    )

    // 100件表示、残り50件あるのでボタン表示
    expect(screen.getByText('もっと見る')).toBeInTheDocument()
  })

  it('通常ランキングで80件しかない場合', () => {
    const mockData = createMockData(80)
    
    render(
      <ClientPage 
        initialData={mockData}
        initialGenre="all"
        initialPeriod="24h"
      />
    )

    // 80件すべて表示されているのでボタンなし
    expect(screen.queryByText('もっと見る')).not.toBeInTheDocument()
  })
})