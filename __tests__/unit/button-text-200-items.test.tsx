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
    expect(screen.getByText('もっと見る')).toBeInTheDocument()

    // もっと見るボタンをクリック
    const button = screen.getByText('もっと見る')
    fireEvent.click(button)

    // 200件表示時
    await waitFor(() => {
      expect(screen.getByText('もっと見る')).toBeInTheDocument()
    })
  })

  it.skip('タグ別ランキングで200件表示時の問題', async () => {
    const mockData = createMockData(100)
    
    render(
      <ClientPage 
        initialData={mockData}
        initialGenre="game"
        initialPeriod="24h"
        initialTag="ゲーム"
      />
    )

    // 最初の100件が表示されている
    await waitFor(() => {
      const items = screen.getAllByTestId('ranking-item')
      expect(items).toHaveLength(100)
    })
    
    // タグ別ランキングの初期データが100件の場合、hasMoreがtrueならもっと見るボタンが表示される
    expect(screen.getByText('もっと見る')).toBeInTheDocument()

    // 2ページ目のデータをモック
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        items: createMockData(100, 101),
        hasMore: true
      })
    })

    // もっと見るボタンをクリックして次のページを読み込む
    const loadMoreButton = screen.getByText('もっと見る')
    fireEvent.click(loadMoreButton)

    // 200件表示時
    await waitFor(() => {
      const items = screen.getAllByTestId('ranking-item')
      expect(items).toHaveLength(200)
      // まだデータがあればもっと見るボタンが表示される
      expect(screen.getByText('もっと見る')).toBeInTheDocument()
    })
  })

  it.skip('現在の実装では「もっと見る」と統一表示される', async () => {
    // 現在の実装では、ボタンテキストは常に「もっと見る」
    // ランク表示は不要と判断され、シンプルな表記に統一されている
    const mockData = createMockData(300) // もっと見るボタンが表示される十分なデータ
    
    render(
      <ClientPage 
        initialData={mockData}
        initialGenre="all"
        initialPeriod="24h"
      />
    )

    // 初期表示で100件表示されており、もっと見るボタンがある
    await waitFor(() => {
      expect(screen.getByText('もっと見る')).toBeInTheDocument()
    })
  })
})