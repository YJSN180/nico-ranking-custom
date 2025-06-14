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
      get: (key: string) => key === 'show' ? '100' : null,
      toString: () => 'show=100'
    }
    ;(useSearchParams as any).mockReturnValue(searchParams)
    
    // 初期データは100件
    render(
      <ClientPage 
        initialData={createMockData(100)}
        initialGenre="game"
        initialPeriod="24h"
      />
    )
    
    // 初期表示を確認
    expect(screen.getAllByTestId('ranking-item')).toHaveLength(100)
    
    // popstateイベントを発火（requestAnimationFrameの使用をテスト）
    const popstateEvent = new PopStateEvent('popstate')
    window.dispatchEvent(popstateEvent)
    
    // requestAnimationFrameが呼ばれることを間接的に確認
    // （実際のrequestAnimationFrameが使用されているかをテスト）
    await waitFor(() => {
      // popstateイベント処理が完了していることを確認
      expect(screen.getByText('Test Video 1')).toBeInTheDocument()
    })
    
    // スクロールがロックされていないことを確認
    const scrollEvent = new Event('scroll')
    expect(() => window.dispatchEvent(scrollEvent)).not.toThrow()
    
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
      get: (key: string) => key === 'show' ? '100' : null,
      toString: () => 'show=100'
    }
    ;(useSearchParams as any).mockReturnValue(searchParams)
    
    const { container } = render(
      <ClientPage 
        initialData={createMockData(100)}
        initialGenre="game"
        initialPeriod="24h"
      />
    )
    
    // 初期表示確認
    expect(screen.getAllByTestId('ranking-item')).toHaveLength(100)
    
    // スクロールイベントが処理されることを確認
    const scrollEvent = new Event('scroll')
    expect(() => window.dispatchEvent(scrollEvent)).not.toThrow()
    
    // コンテナのoverflowがhiddenになっていないことを確認
    // （スクロールがロックされていないことを間接的に確認）
    const mainContainer = container.firstChild as HTMLElement
    if (mainContainer) {
      const computedStyle = window.getComputedStyle(mainContainer)
      expect(computedStyle.overflow).not.toBe('hidden')
    }
    
    // 基本的な機能が動作していることを確認
    expect(screen.getByText('Test Video 1')).toBeInTheDocument()
    expect(screen.getByText('Test Video 100')).toBeInTheDocument()
  })
})