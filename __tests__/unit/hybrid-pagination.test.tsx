import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { useRouter, useSearchParams } from 'next/navigation'
import ClientPage from '@/app/client-page'

// Next.js Imageコンポーネントをモック
vi.mock('next/image', () => ({
  default: vi.fn(({ src, alt }: any) => <img src={src} alt={alt} />)
}))

// モックの設定
vi.mock('next/navigation', () => ({
  useRouter: vi.fn(),
  useSearchParams: vi.fn()
}))

vi.mock('@/hooks/use-user-preferences', () => ({
  useUserPreferences: () => ({
    updatePreferences: vi.fn()
  })
}))

vi.mock('@/hooks/use-user-ng-list', () => ({
  useUserNGList: () => ({
    filterItems: (items: any[]) => items
  })
}))

vi.mock('@/hooks/use-realtime-stats', () => ({
  useRealtimeStats: (data: any[]) => ({
    items: data,
    isLoading: false,
    lastUpdated: null
  })
}))

vi.mock('@/hooks/use-mobile-detect', () => ({
  useMobileDetect: () => false
}))

vi.mock('@/lib/popular-tags', () => ({
  getPopularTags: vi.fn().mockResolvedValue([])
}))

describe('ハイブリッドページネーション', () => {
  const mockPush = vi.fn()
  const mockReplaceState = vi.fn()
  
  const createMockData = (count: number, start = 1) => {
    return Array.from({ length: count }, (_, i) => ({
      rank: start + i,
      id: `sm${start + i}`,
      title: `Test Video ${start + i}`,
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
    
    // window.history.replaceStateのモック
    Object.defineProperty(window, 'history', {
      value: {
        replaceState: mockReplaceState,
        pushState: vi.fn()
      },
      writable: true
    })
    
    // useRouterのモック
    ;(useRouter as any).mockReturnValue({
      push: mockPush,
      replace: vi.fn(),
      prefetch: vi.fn()
    })
    
    // Clear storage
    localStorage.clear()
    sessionStorage.clear()
  })

  it('URLに表示件数が保存される', async () => {
    const searchParams = {
      get: (key: string) => null,
      toString: () => ''
    }
    ;(useSearchParams as any).mockReturnValue(searchParams)
    
    const { rerender } = render(
      <ClientPage 
        initialData={createMockData(300)}
        initialGenre="game"
        initialPeriod="24h"
      />
    )

    // 初期表示は100件
    expect(screen.getAllByTestId('ranking-item')).toHaveLength(100)

    // もっと見るボタンをクリック
    fireEvent.click(screen.getByText('もっと見る'))

    await waitFor(() => {
      expect(screen.getAllByTestId('ranking-item')).toHaveLength(200)
    })

    // URLが更新されることを確認
    expect(mockReplaceState).toHaveBeenCalledWith(
      {},
      '',
      expect.stringContaining('show=200')
    )
  })

  it('URLのshowパラメータから初期表示件数が設定される', async () => {
    const searchParams = {
      get: (key: string) => key === 'show' ? '200' : null,
      toString: () => 'show=200'
    }
    ;(useSearchParams as any).mockReturnValue(searchParams)
    
    render(
      <ClientPage 
        initialData={createMockData(300)}
        initialGenre="game"
        initialPeriod="24h"
      />
    )

    // 初期データが300件あるので、すぐに200件表示される
    await waitFor(() => {
      expect(screen.getAllByTestId('ranking-item')).toHaveLength(200)
    })
  })

  it('ブラウザバック時に自動復元される', async () => {
    const searchParams = {
      get: (key: string) => key === 'show' ? '200' : null,
      toString: () => 'show=200'
    }
    ;(useSearchParams as any).mockReturnValue(searchParams)
    
    // APIレスポンスのモック
    ;(global.fetch as any).mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        items: createMockData(100, 101),
        hasMore: true
      })
    })
    
    render(
      <ClientPage 
        initialData={createMockData(100)}
        initialGenre="game"
        initialPeriod="24h"
      />
    )

    // 復元中のプログレスバーが表示される
    await waitFor(() => {
      expect(screen.getByText('前回の表示位置を復元中...')).toBeInTheDocument()
    })

    // 復元後は200件表示される
    await waitFor(() => {
      expect(screen.getAllByTestId('ranking-item')).toHaveLength(200)
    }, { timeout: 3000 })
  })

  it('popstateイベントで復元が実行される', async () => {
    const searchParams = {
      get: (key: string) => null,
      toString: () => ''
    }
    ;(useSearchParams as any).mockReturnValue(searchParams)
    
    render(
      <ClientPage 
        initialData={createMockData(100)}
        initialGenre="game"
        initialPeriod="24h"
      />
    )

    // URLを変更してpopstateイベントを発火
    Object.defineProperty(window, 'location', {
      value: { search: '?show=200' },
      writable: true
    })

    // APIレスポンスのモック
    ;(global.fetch as any).mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        items: createMockData(100, 101),
        hasMore: true
      })
    })

    // popstateイベントを発火
    window.dispatchEvent(new PopStateEvent('popstate'))

    // 復元が実行されることを確認
    await waitFor(() => {
      expect(screen.getByText('前回の表示位置を復元中...')).toBeInTheDocument()
    })
  })

  it('最大500件まで表示される', async () => {
    const searchParams = {
      get: (key: string) => null,
      toString: () => ''
    }
    ;(useSearchParams as any).mockReturnValue(searchParams)
    
    render(
      <ClientPage 
        initialData={createMockData(500)}
        initialGenre="game"
        initialPeriod="24h"
      />
    )

    // 500件まで表示
    for (let i = 0; i < 4; i++) {
      fireEvent.click(screen.getByText('もっと見る'))
      await waitFor(() => {
        expect(screen.getAllByTestId('ranking-item')).toHaveLength((i + 2) * 100)
      })
    }

    // 500件表示時はもっと見るボタンが消える
    expect(screen.queryByText('もっと見る')).not.toBeInTheDocument()
    
    // URLに500が保存される
    expect(mockReplaceState).toHaveBeenLastCalledWith(
      {},
      '',
      expect.stringContaining('show=500')
    )
  })
})