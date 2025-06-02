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

describe('ジャンル別ランキング500件表示対応', () => {
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

  beforeEach(() => {
    vi.clearAllMocks()
    global.fetch = vi.fn()
  })

  it('初期表示で100件、もっと見るで200件、300件と表示される', async () => {
    const mockData = createMockData(300)
    
    render(
      <ClientPage 
        initialData={mockData}
        initialGenre="game"
        initialPeriod="24h"
      />
    )

    // 最初は100件表示
    expect(screen.getAllByText(/Test Video/)).toHaveLength(100)
    expect(screen.getByText('Test Video 1')).toBeInTheDocument()
    expect(screen.getByText('Test Video 100')).toBeInTheDocument()
    expect(screen.queryByText('Test Video 101')).not.toBeInTheDocument()

    // もっと見るボタンをクリック（200件表示）
    const loadMoreButton = screen.getByText('もっと見る')
    fireEvent.click(loadMoreButton)
    
    await waitFor(() => {
      expect(screen.getAllByText(/Test Video/)).toHaveLength(200)
      expect(screen.getByText('Test Video 200')).toBeInTheDocument()
    })

    // もう一度クリック（300件表示）
    fireEvent.click(screen.getByText('もっと見る'))
    
    await waitFor(() => {
      expect(screen.getAllByText(/Test Video/)).toHaveLength(300)
      expect(screen.getByText('Test Video 300')).toBeInTheDocument()
    })
  })

  it('301位以降はAPIから動的に取得される', async () => {
    const mockData = createMockData(300)
    const mockApiResponse = createMockData(100).map((item, i) => ({
      ...item,
      rank: 301 + i,
      id: `sm${301 + i}`,
      title: `Test Video ${301 + i}`
    }))
    
    // fetchのモック
    ;(global.fetch as any).mockResolvedValueOnce({
      ok: true,
      json: async () => mockApiResponse
    })
    
    render(
      <ClientPage 
        initialData={mockData}
        initialGenre="game"
        initialPeriod="24h"
      />
    )

    // 300件まで表示
    fireEvent.click(screen.getByText('もっと見る'))
    await waitFor(() => screen.getByText('Test Video 200'))
    
    fireEvent.click(screen.getByText('もっと見る'))
    await waitFor(() => screen.getByText('Test Video 300'))

    // 301件目以降を取得
    fireEvent.click(screen.getByText('もっと見る'))
    
    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledWith(
        expect.stringContaining('page=4')
      )
      expect(screen.getByText('Test Video 301')).toBeInTheDocument()
    })
  })

  it('500件で上限に達し、もっと見るボタンが消える', async () => {
    const mockData = createMockData(300)
    
    // 301-400, 401-500のAPIレスポンスをモック
    ;(global.fetch as any)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => createMockData(100).map((_, i) => ({
          rank: 301 + i,
          id: `sm${301 + i}`,
          title: `Test Video ${301 + i}`,
          thumbURL: 'https://example.com/thumb.jpg',
          views: 1000,
          comments: 10,
          mylists: 5,
          likes: 20
        }))
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => createMockData(100).map((_, i) => ({
          rank: 401 + i,
          id: `sm${401 + i}`,
          title: `Test Video ${401 + i}`,
          thumbURL: 'https://example.com/thumb.jpg',
          views: 1000,
          comments: 10,
          mylists: 5,
          likes: 20
        }))
      })
    
    render(
      <ClientPage 
        initialData={mockData}
        initialGenre="game"
        initialPeriod="24h"
      />
    )

    // 300件まで表示
    fireEvent.click(screen.getByText('もっと見る'))
    await waitFor(() => screen.getByText('Test Video 200'))
    fireEvent.click(screen.getByText('もっと見る'))
    await waitFor(() => screen.getByText('Test Video 300'))

    // 400件まで表示
    fireEvent.click(screen.getByText('もっと見る'))
    await waitFor(() => screen.getByText('Test Video 400'))

    // 500件まで表示
    fireEvent.click(screen.getByText('もっと見る'))
    await waitFor(() => {
      expect(screen.getByText('Test Video 500')).toBeInTheDocument()
      // もっと見るボタンが消える
      expect(screen.queryByText('もっと見る')).not.toBeInTheDocument()
    })
  })
})