import { describe, it, expect, vi, beforeEach } from 'vitest'
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

let mockNGList: {
  videoIds: string[]
  videoTitles: { exact: string[], partial: string[] }
  authorIds: string[]
  authorNames: { exact: string[], partial: string[] }
} = {
  videoIds: [],
  videoTitles: { exact: [], partial: [] },
  authorIds: [],
  authorNames: { exact: [], partial: [] }
}

vi.mock('@/hooks/use-user-ng-list', () => ({
  useUserNGList: () => ({
    ngList: mockNGList,
    filterItems: (items: any[]) => {
      // NGリストに基づいてフィルタリング
      return items.filter(item => {
        if (mockNGList.videoIds.includes(item.id)) return false
        if (mockNGList.videoTitles.partial.some((ng: string) => item.title.includes(ng))) return false
        return true
      })
    },
    addVideoId: vi.fn(),
    removeVideoId: vi.fn(),
  })
}))

vi.mock('@/hooks/use-realtime-stats', () => ({
  useRealtimeStats: (data: any[]) => ({
    items: data,
    isLoading: false,
    lastUpdated: null
  })
}))

describe('NG設定反映後の表示挙動', () => {
  const createMockData = (count: number) => {
    return Array.from({ length: count }, (_, i) => ({
      rank: i + 1,
      id: `sm${i + 1}`,
      title: i % 3 === 0 ? `【実況】テスト動画 ${i + 1}` : `テスト動画 ${i + 1}`,
      thumbURL: 'https://example.com/thumb.jpg',
      views: 1000 - i,
      comments: 10,
      mylists: 5,
      likes: 20
    }))
  }

  beforeEach(() => {
    mockNGList = {
      videoIds: [],
      videoTitles: { exact: [], partial: [] },
      authorIds: [],
      authorNames: { exact: [], partial: [] }
    }
  })

  it('通常時: 100件表示される', () => {
    const mockData = createMockData(200)
    
    render(
      <ClientPage 
        initialData={mockData}
        initialGenre="all"
        initialPeriod="24h"
      />
    )

    // 100件表示されるはず
    const items = screen.getAllByText(/テスト動画/)
    expect(items).toHaveLength(100)
  })

  it('NG設定後: 表示件数が減る（順位は詰められない）', () => {
    // 「実況」をNGワードに設定
    mockNGList.videoTitles.partial = ['実況']
    
    const mockData = createMockData(200)
    
    render(
      <ClientPage 
        initialData={mockData}
        initialGenre="all"
        initialPeriod="24h"
      />
    )

    // 100件中、3の倍数（実況動画）が除外される
    // 100件中約33件が除外されるので、約67件表示される
    const items = screen.getAllByText(/テスト動画/)
    expect(items.length).toBeLessThan(100)
    expect(items.length).toBeGreaterThan(60)
    
    // 順位は元のまま（1位の実況動画がNGなら、2位が最初に表示）
    // rank: 2 の動画が最初に表示されるはず
    expect(items[0]).toHaveTextContent('テスト動画 2')
  })

  it('もっと見るボタンの表示条件', () => {
    mockNGList.videoTitles.partial = ['実況']
    
    const mockData = createMockData(200)
    
    render(
      <ClientPage 
        initialData={mockData}
        initialGenre="all"
        initialPeriod="24h"
      />
    )

    // フィルタ後のデータがまだあるので、もっと見るボタンが表示される
    expect(screen.getByText(/もっと見る/)).toBeInTheDocument()
  })
})