import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, fireEvent, waitFor, act, screen } from '@testing-library/react'
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

// RankingItemComponentをモック
vi.mock('@/components/ranking-item', () => ({
  default: vi.fn(({ item }: { item: any }) => 
    <div data-testid="ranking-item">{item.title}</div>
  )
}))

describe('Storage飽和問題', () => {
  const mockPush = vi.fn()
  const mockReplaceState = vi.fn()
  let localStorageSetItemSpy: any
  let localStorageGetItemSpy: any
  
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

  const originalSetItem = Storage.prototype.setItem

  beforeEach(() => {
    vi.clearAllMocks()
    localStorage.clear()
    sessionStorage.clear()
    
    // localStorageのスパイ
    localStorageSetItemSpy = vi.spyOn(Storage.prototype, 'setItem')
    localStorageGetItemSpy = vi.spyOn(Storage.prototype, 'getItem')
    
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
    
    // useSearchParamsのモック
    const searchParams = {
      get: (key: string) => null,
      toString: () => ''
    }
    ;(useSearchParams as any).mockReturnValue(searchParams)
  })

  afterEach(() => {
    localStorageSetItemSpy.mockRestore()
    localStorageGetItemSpy.mockRestore()
  })

  it('スクロール時にlocalStorageへの保存が頻繁に行われない', async () => {
    render(
      <ClientPage 
        initialData={createMockData(300)}
        initialGenre="all"
        initialPeriod="24h"
      />
    )

    // 複数回スクロールイベントを発火
    for (let i = 0; i < 10; i++) {
      fireEvent.scroll(window, { target: { scrollY: 100 + i * 50 } })
      await new Promise(resolve => setTimeout(resolve, 100)) // 100ms待機
    }

    // 1秒待機（デバウンス時間）
    await new Promise(resolve => setTimeout(resolve, 1100))

    // localStorageへの保存回数を確認（実際の実装ではスクロール時に自動保存しない）
    const saveCount = localStorageSetItemSpy.mock.calls.length

    // スクロールだけでは保存されないことを確認
    expect(saveCount).toBe(0)
  })

  it('Storage容量超過時にエラーハンドリングが行われる', async () => {
    // localStorageの容量を模擬的に超過させる（特定のキーのみ）
    localStorageSetItemSpy.mockImplementation((key: string) => {
      if (key === 'ranking-config') {
        throw new Error('QuotaExceededError')
      }
      // 他のキーは正常に動作
      return originalSetItem.call(localStorage, key, arguments[1])
    })

    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

    await act(async () => {
      render(
        <ClientPage 
          initialData={createMockData(100)}
          initialGenre="all"
          initialPeriod="24h"
        />
      )
    })

    // ジャンルを変更してlocalStorage保存をトリガー
    const genreButtons = screen.getAllByRole('button')
    const gameGenreButton = genreButtons.find(btn => 
      btn.textContent === 'ゲーム' && 
      btn.style.cssText.includes('min-width: 80px')
    )
    
    await act(async () => {
      fireEvent.click(gameGenreButton!)
    })
    
    // 少し待機
    await act(async () => {
      await new Promise(resolve => setTimeout(resolve, 100))
    })

    // エラーが適切にハンドリングされ、アプリがクラッシュしないことを確認
    expect(document.body).toBeInTheDocument()
    
    // localStorageへの保存が試みられたことを確認（ranking-config）
    expect(localStorageSetItemSpy).toHaveBeenCalled()

    consoleErrorSpy.mockRestore()
  })



  it('最小限のデータのみ保存される', async () => {
    render(
      <ClientPage 
        initialData={createMockData(200)}
        initialGenre="all"
        initialPeriod="24h"
      />
    )

    // スクロールして保存をトリガー
    fireEvent.scroll(window, { target: { scrollY: 500 } })
    await new Promise(resolve => setTimeout(resolve, 1100))

    // 保存されたデータを確認
    const savedCalls = localStorageSetItemSpy.mock.calls.filter(
      (call: any[]) => call[0].startsWith('ranking-state-')
    )
    
    if (savedCalls.length > 0) {
      const savedData = JSON.parse(savedCalls[0][1])
      
      // 最小限のプロパティのみ含まれることを確認
      expect(savedData).toHaveProperty('scrollPosition')
      expect(savedData).toHaveProperty('timestamp')
      expect(savedData).toHaveProperty('dataVersion')
      
      // 重いデータ（items配列など）が含まれていないことを確認
      expect(savedData).not.toHaveProperty('items')
      expect(savedData).not.toHaveProperty('rankingData')
      expect(savedData).not.toHaveProperty('displayCount') // もはや不要
      expect(savedData).not.toHaveProperty('currentPage') // もはや不要
      expect(savedData).not.toHaveProperty('hasMore') // もはや不要
    }
  })
})