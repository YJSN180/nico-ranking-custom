import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, fireEvent, waitFor } from '@testing-library/react'
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

    // localStorageへの保存回数を確認
    const saveCount = localStorageSetItemSpy.mock.calls.filter(
      (call: any[]) => call[0].startsWith('ranking-state-')
    ).length

    // 頻繁な保存が行われていないことを確認（10回のスクロールで1-2回程度）
    expect(saveCount).toBeLessThanOrEqual(2)
  })

  it('Storage容量超過時にエラーハンドリングが行われる', async () => {
    // localStorageの容量を模擬的に超過させる
    localStorageSetItemSpy.mockImplementation(() => {
      throw new Error('QuotaExceededError')
    })

    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

    render(
      <ClientPage 
        initialData={createMockData(100)}
        initialGenre="all"
        initialPeriod="24h"
      />
    )

    // スクロールしてStorage保存をトリガー
    fireEvent.scroll(window, { target: { scrollY: 200 } })
    
    // デバウンス時間待機
    await new Promise(resolve => setTimeout(resolve, 1100))

    // エラーが適切にハンドリングされ、アプリがクラッシュしないことを確認
    expect(document.body).toBeInTheDocument()
    
    // エラーログが出力されていないことを確認（静かに失敗）
    expect(consoleSpy).not.toHaveBeenCalled()

    consoleSpy.mockRestore()
  })

  it('古いStorageデータが定期的にクリーンアップされる', async () => {
    // 2時間前のデータを設定
    const oldData = {
      displayCount: 200,
      timestamp: Date.now() - 2 * 60 * 60 * 1000 // 2時間前
    }
    localStorage.setItem('ranking-state-old-24h-none', JSON.stringify(oldData))
    
    // 30分前のデータを設定
    const recentData = {
      displayCount: 150,
      timestamp: Date.now() - 30 * 60 * 1000 // 30分前
    }
    localStorage.setItem('ranking-state-recent-24h-none', JSON.stringify(recentData))

    render(
      <ClientPage 
        initialData={createMockData(100)}
        initialGenre="new"
        initialPeriod="24h"
      />
    )

    // ジャンル変更をトリガー（クリーンアップが実行される）
    await waitFor(() => {
      // 古いデータが削除されていることを確認
      expect(localStorage.getItem('ranking-state-old-24h-none')).toBeNull()
      // 新しいデータは残っていることを確認
      expect(localStorage.getItem('ranking-state-recent-24h-none')).toBeTruthy()
    })
  })

  it('SessionStorageとLocalStorageの重複保存を避ける', async () => {
    const sessionStorageSetItemSpy = vi.spyOn(sessionStorage, 'setItem')

    render(
      <ClientPage 
        initialData={createMockData(100)}
        initialGenre="all"
        initialPeriod="24h"
      />
    )

    // スクロールして保存をトリガー
    fireEvent.scroll(window, { target: { scrollY: 200 } })
    await new Promise(resolve => setTimeout(resolve, 1100))

    // localStorageには保存される
    const localStorageCalls = localStorageSetItemSpy.mock.calls.filter(
      (call: any[]) => call[0].startsWith('ranking-state-')
    )
    expect(localStorageCalls.length).toBeGreaterThan(0)

    // sessionStorageには保存されない（復元時のみ使用）
    const sessionStorageCalls = sessionStorageSetItemSpy.mock.calls.filter(
      (call: any[]) => call[0].startsWith('ranking-state-')
    )
    expect(sessionStorageCalls.length).toBe(0)

    sessionStorageSetItemSpy.mockRestore()
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
      expect(savedData).toHaveProperty('displayCount')
      expect(savedData).toHaveProperty('currentPage')
      expect(savedData).toHaveProperty('hasMore')
      expect(savedData).toHaveProperty('scrollPosition')
      expect(savedData).toHaveProperty('timestamp')
      expect(savedData).toHaveProperty('dataVersion')
      
      // 重いデータ（items配列など）が含まれていないことを確認
      expect(savedData).not.toHaveProperty('items')
      expect(savedData).not.toHaveProperty('rankingData')
    }
  })
})