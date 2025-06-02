import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import ClientPage from '@/app/client-page'
import { act } from 'react'

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

// RankingItemComponentをモック
vi.mock('@/components/ranking-item', () => ({
  default: vi.fn(({ item }: { item: any }) => 
    <div data-testid="ranking-item">{item.title}</div>
  )
}))

describe('ブラウザバック時のスクロール位置復元', () => {
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

  let originalScrollTo: typeof window.scrollTo
  let originalScrollY: number
  
  beforeEach(() => {
    // sessionStorageをクリア
    sessionStorage.clear()
    
    // scrollToとscrollYをモック
    originalScrollTo = window.scrollTo
    originalScrollY = window.scrollY
    
    window.scrollTo = vi.fn((x, y) => {
      Object.defineProperty(window, 'scrollY', {
        value: y,
        writable: true,
        configurable: true
      })
    })
    
    // requestAnimationFrameをモック
    global.requestAnimationFrame = vi.fn(cb => {
      setTimeout(cb, 0)
      return 1
    })
  })

  afterEach(() => {
    window.scrollTo = originalScrollTo
    Object.defineProperty(window, 'scrollY', {
      value: originalScrollY,
      writable: true,
      configurable: true
    })
    vi.clearAllMocks()
  })

  it('150位まで表示した後、ブラウザバックで同じ位置に戻る', async () => {
    const mockData = createMockData(300)
    
    // 初回レンダリング
    const { rerender } = render(
      <ClientPage 
        initialData={mockData}
        initialGenre="all"
        initialPeriod="24h"
      />
    )

    // 最初は100件表示されている
    expect(screen.getAllByTestId('ranking-item')).toHaveLength(100)

    // もっと見るボタンをクリック（150件表示）
    const loadMoreButton = screen.getByText('もっと見る')
    fireEvent.click(loadMoreButton)
    
    await waitFor(() => {
      expect(screen.getAllByTestId('ranking-item')).toHaveLength(200)
    })

    // スクロール位置を設定（150位あたり）
    act(() => {
      window.scrollTo(0, 5000)
    })

    // beforeunloadイベントを発火して状態を保存
    act(() => {
      window.dispatchEvent(new Event('beforeunload'))
    })

    // sessionStorageに保存されているか確認
    const storageKey = 'ranking-state-all-24h-none'
    const savedState = sessionStorage.getItem(storageKey)
    expect(savedState).toBeTruthy()
    
    const state = JSON.parse(savedState!)
    expect(state.displayCount).toBe(200)
    expect(state.scrollPosition).toBe(5000)

    // ページを再レンダリング（ブラウザバックを模擬）
    rerender(
      <ClientPage 
        initialData={mockData}
        initialGenre="all"
        initialPeriod="24h"
      />
    )

    // displayCountが復元されて200件表示される
    await waitFor(() => {
      expect(screen.getAllByTestId('ranking-item')).toHaveLength(200)
    })

    // スクロール位置が復元される
    await waitFor(() => {
      expect(window.scrollTo).toHaveBeenCalledWith(0, 5000)
    }, { timeout: 1000 })
  })

  it('タグ別ランキングでも位置が正しく復元される', async () => {
    const mockData = createMockData(100)
    
    // タグ別ランキングの追加データをモック
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => createMockData(100).map((item, i) => ({
        ...item,
        rank: 101 + i
      }))
    })
    
    const { rerender } = render(
      <ClientPage 
        initialData={mockData}
        initialGenre="game"
        initialPeriod="24h"
        initialTag="ゲーム"
      />
    )

    // もっと見るボタンをクリック（追加データを読み込み）
    const loadMoreButton = screen.getByText('もっと見る')
    fireEvent.click(loadMoreButton)
    
    await waitFor(() => {
      expect(screen.getAllByTestId('ranking-item')).toHaveLength(200)
    })

    // スクロール位置を設定
    act(() => {
      window.scrollTo(0, 4000)
    })

    // 状態を保存
    act(() => {
      window.dispatchEvent(new Event('beforeunload'))
    })

    // ページを再レンダリング
    rerender(
      <ClientPage 
        initialData={mockData}
        initialGenre="game"
        initialPeriod="24h"
        initialTag="ゲーム"
      />
    )

    // データとスクロール位置が復元される
    await waitFor(() => {
      expect(screen.getAllByTestId('ranking-item')).toHaveLength(200)
      expect(window.scrollTo).toHaveBeenCalledWith(0, 4000)
    })
  })
})