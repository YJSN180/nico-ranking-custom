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

describe('ブラウザバック時のスクロール復元修正', () => {
  const mockPush = vi.fn()
  const mockReplaceState = vi.fn()
  const originalScrollRestoration = window.history.scrollRestoration
  
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
        pushState: vi.fn(),
        scrollRestoration: 'auto'
      },
      writable: true,
      configurable: true
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
    // Restore original scrollRestoration
    if ('scrollRestoration' in window.history) {
      window.history.scrollRestoration = originalScrollRestoration
    }
  })

  it('コンポーネントマウント時にscrollRestorationがmanualに設定される', () => {
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
    
    // scrollRestorationがmanualに設定されることを確認
    expect(window.history.scrollRestoration).toBe('manual')
  })

  it('動画ページから戻った際（showパラメータなし）に100件表示に戻る', async () => {
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
    
    // もっと見るボタンをクリックして200件表示にする
    const moreButton = screen.getByText('もっと見る')
    moreButton.click()
    
    await waitFor(() => {
      expect(screen.getAllByTestId('ranking-item')).toHaveLength(200)
    })
    
    // window.locationをモック（showパラメータなし）
    Object.defineProperty(window, 'location', {
      value: { search: '' },
      writable: true,
      configurable: true
    })
    
    // popstateイベントを発火（動画ページから戻る）
    const popstateEvent = new PopStateEvent('popstate')
    window.dispatchEvent(popstateEvent)
    
    // 100件表示に戻ることを確認
    await waitFor(() => {
      expect(screen.getAllByTestId('ranking-item')).toHaveLength(100)
    })
    
    // requestAnimationFrameが呼ばれていないことを確認（条件を満たさないため）
    expect(global.requestAnimationFrame).not.toHaveBeenCalled()
  })

  it('popstateイベントでrequestAnimationFrameが条件付きで実行される', async () => {
    const searchParams = {
      get: (key: string) => key === 'show' ? '200' : null,
      toString: () => 'show=200'
    }
    ;(useSearchParams as any).mockReturnValue(searchParams)
    
    render(
      <ClientPage 
        initialData={createMockData(100)}
        initialGenre="game"
        initialPeriod="24h"
      />
    )
    
    // window.locationをモック（showパラメータあり）
    Object.defineProperty(window, 'location', {
      value: { search: '?show=200' },
      writable: true,
      configurable: true
    })
    
    // popstateイベントを発火
    window.dispatchEvent(new PopStateEvent('popstate'))
    
    // showパラメータがあり、条件を満たすのでrequestAnimationFrameが呼ばれる
    expect(global.requestAnimationFrame).toHaveBeenCalled()
  })

  it('popstateイベントでshowパラメータがdisplayCountと同じ場合は処理されない', () => {
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
    
    // window.locationをモック（show=100、displayCountと同じ）
    Object.defineProperty(window, 'location', {
      value: { search: '?show=100' },
      writable: true,
      configurable: true
    })
    
    // popstateイベントを発火
    window.dispatchEvent(new PopStateEvent('popstate'))
    
    // 条件を満たさないのでrequestAnimationFrameは呼ばれない
    expect(global.requestAnimationFrame).not.toHaveBeenCalled()
  })

  it('コンポーネントアンマウント時にscrollRestorationがautoに戻る', () => {
    const searchParams = {
      get: (key: string) => null,
      toString: () => ''
    }
    ;(useSearchParams as any).mockReturnValue(searchParams)
    
    const { unmount } = render(
      <ClientPage 
        initialData={createMockData(100)}
        initialGenre="game"
        initialPeriod="24h"
      />
    )
    
    // マウント時はmanual
    expect(window.history.scrollRestoration).toBe('manual')
    
    // アンマウント
    unmount()
    
    // アンマウント後はautoに戻る
    expect(window.history.scrollRestoration).toBe('auto')
  })
})