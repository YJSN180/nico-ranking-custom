import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
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

// fetch のモック
const mockFetch = vi.fn()
global.fetch = mockFetch

describe('200件表示時のボタンテキスト', () => {
  const createMockData = (count: number, startRank: number = 1) => {
    return Array.from({ length: count }, (_, i) => ({
      rank: startRank + i,
      id: `sm${startRank + i}`,
      title: `Test Video ${startRank + i}`,
      thumbURL: 'https://example.com/thumb.jpg',
      views: 1000 - i * 10,
      comments: 10,
      mylists: 5,
      likes: 20
    }))
  }

  beforeEach(() => {
    mockFetch.mockClear()
  })

  it('通常ランキングで200件表示時に正しいテキストが表示される', async () => {
    const mockData = createMockData(300)
    
    const { rerender } = render(
      <ClientPage 
        initialData={mockData}
        initialGenre="all"
        initialPeriod="24h"
      />
    )

    // 最初は100件表示
    expect(screen.getByText(/もっと見る（101位～）/)).toBeInTheDocument()

    // もっと見るボタンをクリック
    const button = screen.getByText(/もっと見る（101位～）/)
    fireEvent.click(button)

    // 200件表示時
    await waitFor(() => {
      expect(screen.getByText(/もっと見る（201位～）/)).toBeInTheDocument()
    })
  })

  it('タグ別ランキングで200件表示時の問題', async () => {
    const mockData = createMockData(100)
    
    // 2ページ目のデータをモック
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => createMockData(100, 101)
    })

    render(
      <ClientPage 
        initialData={mockData}
        initialGenre="game"
        initialPeriod="24h"
        initialTag="ゲーム"
      />
    )

    // 最初の100件が表示されている
    expect(screen.queryByText(/もっと見る/)).not.toBeInTheDocument()

    // 次のページを読み込む
    await waitFor(() => {
      expect(screen.getByText(/もっと見る（100件～）/)).toBeInTheDocument()
    })

    const loadMoreButton = screen.getByText(/もっと見る（100件～）/)
    fireEvent.click(loadMoreButton)

    // 200件表示時 - ここが問題！
    await waitFor(() => {
      // 現在の実装では「もっと見る（200件～）」と表示される
      // これは通常ランキングと整合性がない
      expect(screen.getByText(/もっと見る（200件～）/)).toBeInTheDocument()
    })
  })

  it('理想的な表示（修正案）', async () => {
    // タグ別ランキングでも、次のページがある場合は
    // 「もっと見る（201件目～）」のように表示すべき
    // または「次の100件を読み込む」のような別の表記にする
  })
})