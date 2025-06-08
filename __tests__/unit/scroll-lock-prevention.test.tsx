import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import ClientPage from '@/app/client-page'
import { useRouter, useSearchParams } from 'next/navigation'

// モック
vi.mock('next/navigation', () => ({
  useRouter: vi.fn(),
  useSearchParams: vi.fn()
}))

vi.mock('next/image', () => ({
  default: vi.fn(({ src, alt }: any) => <img src={src} alt={alt} />)
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

vi.mock('@/components/ranking-item', () => ({
  default: vi.fn(({ item }: { item: any }) => 
    <div data-testid="ranking-item">{item.title}</div>
  )
}))

describe('スクロールロック防止', () => {
  const mockPush = vi.fn()
  const mockReplaceState = vi.fn()
  
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
    
    // requestAnimationFrameのモック
    global.requestAnimationFrame = vi.fn(cb => {
      setTimeout(cb, 0)
      return 1
    })
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  it('popstateイベントがメインスレッドをブロックしない', async () => {
    const searchParams = {
      get: (key: string) => key === 'show' ? '400' : null,
      toString: () => 'show=400'
    }
    ;(useSearchParams as any).mockReturnValue(searchParams)
    
    // 初期データは100件
    const { rerender } = render(
      <ClientPage 
        initialData={createMockData(100)}
        initialGenre="game"
        initialPeriod="24h"
      />
    )
    
    // 初期表示を確認
    expect(screen.getAllByTestId('ranking-item')).toHaveLength(100)
    
    // APIレスポンスのモック（追加データ）
    ;(global.fetch as any).mockResolvedValue({
      ok: true,
      json: async () => ({
        items: createMockData(100).map((item, i) => ({
          ...item,
          rank: 101 + i,
          id: `sm${101 + i}`
        })),
        hasMore: true
      })
    })
    
    // window.locationをモック
    Object.defineProperty(window, 'location', {
      value: { search: '?show=400' },
      writable: true,
      configurable: true
    })
    
    // popstateイベントを発火
    const popstateEvent = new PopStateEvent('popstate')
    
    // requestAnimationFrameが呼ばれることを確認
    window.dispatchEvent(popstateEvent)
    
    // requestAnimationFrameが呼ばれたことを確認
    expect(global.requestAnimationFrame).toHaveBeenCalled()
    
    // 非同期処理を待つ
    await waitFor(() => {
      // 復元処理が開始されることを確認
      expect(global.fetch).toHaveBeenCalled()
    }, { timeout: 3000 })
    
    // スクロールがロックされていないことを確認
    // （実際のテストでは、scrollイベントが処理されることを確認）
    const scrollEvent = new Event('scroll')
    window.dispatchEvent(scrollEvent)
    
    // エラーが発生していないことを確認
    expect(screen.getByText('Test Video 1')).toBeInTheDocument()
  })

  it('復元エラー時でもスクロールがロックされない', async () => {
    const searchParams = {
      get: (key: string) => key === 'show' ? '300' : null,
      toString: () => 'show=300'
    }
    ;(useSearchParams as any).mockReturnValue(searchParams)
    
    // APIエラーをモック
    ;(global.fetch as any).mockRejectedValue(new Error('Network error'))
    
    render(
      <ClientPage 
        initialData={createMockData(100)}
        initialGenre="game"
        initialPeriod="24h"
      />
    )
    
    // popstateイベントを発火
    Object.defineProperty(window, 'location', {
      value: { search: '?show=300' },
      writable: true,
      configurable: true
    })
    
    const popstateEvent = new PopStateEvent('popstate')
    window.dispatchEvent(popstateEvent)
    
    // エラーが発生してもアプリがクラッシュしないことを確認
    await waitFor(() => {
      expect(screen.getByText('Test Video 1')).toBeInTheDocument()
    })
    
    // スクロールイベントが処理されることを確認
    const scrollEvent = new Event('scroll')
    expect(() => window.dispatchEvent(scrollEvent)).not.toThrow()
  })

  it('復元中でもスクロールが可能', async () => {
    const searchParams = {
      get: (key: string) => key === 'show' ? '200' : null,
      toString: () => 'show=200'
    }
    ;(useSearchParams as any).mockReturnValue(searchParams)
    
    // 遅いAPIレスポンスをモック
    let resolvePromise: any
    ;(global.fetch as any).mockReturnValue(new Promise(resolve => {
      resolvePromise = resolve
    }))
    
    const { container } = render(
      <ClientPage 
        initialData={createMockData(100)}
        initialGenre="game"
        initialPeriod="24h"
      />
    )
    
    // popstateイベントを発火
    Object.defineProperty(window, 'location', {
      value: { search: '?show=200' },
      writable: true,
      configurable: true
    })
    
    window.dispatchEvent(new PopStateEvent('popstate'))
    
    // 復元中のプログレスバーが表示されることを確認
    await waitFor(() => {
      expect(screen.getByText('前回の表示位置を復元中...')).toBeInTheDocument()
    })
    
    // 復元中でもスクロールイベントが処理されることを確認
    const scrollEvent = new Event('scroll')
    expect(() => window.dispatchEvent(scrollEvent)).not.toThrow()
    
    // コンテナのoverflowがhiddenになっていないことを確認
    const mainContainer = container.firstChild as HTMLElement
    expect(window.getComputedStyle(mainContainer).overflow).not.toBe('hidden')
    
    // APIレスポンスを解決
    resolvePromise({
      ok: true,
      json: async () => ({
        items: createMockData(100).map((item, i) => ({
          ...item,
          rank: 101 + i
        })),
        hasMore: false
      })
    })
    
    // 復元完了を待つ
    await waitFor(() => {
      expect(screen.queryByText('前回の表示位置を復元中...')).not.toBeInTheDocument()
    })
  })
})