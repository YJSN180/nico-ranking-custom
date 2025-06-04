import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import ClientPage from '@/app/client-page'
import type { RankingData } from '@/types/ranking'

// モック
vi.mock('next/navigation', () => ({
  useRouter: () => ({
    push: vi.fn(),
    replace: vi.fn(),
    prefetch: vi.fn(),
  }),
  useSearchParams: () => ({
    get: (key: string) => null,
  }),
}))

vi.mock('@/hooks/use-realtime-stats', () => ({
  useRealtimeStats: (initialData: RankingData) => ({
    items: initialData,
    isLoading: false,
    lastUpdated: null
  })
}))

vi.mock('@/hooks/use-user-preferences', () => ({
  useUserPreferences: () => ({
    updatePreferences: vi.fn()
  })
}))

vi.mock('@/hooks/use-user-ng-list', () => ({
  useUserNGList: () => ({
    filterItems: (items: any) => items
  })
}))

// モックデータ生成
const generateMockData = (start: number, count: number): RankingData => {
  return Array.from({ length: count }, (_, i) => ({
    rank: start + i,
    id: `sm${1000 + start + i}`,
    title: `テスト動画 ${start + i}`,
    thumbURL: `https://example.com/thumb${start + i}.jpg`,
    views: 1000 * (start + i),
  }))
}

describe('External site return restoration', () => {
  beforeEach(() => {
    // localStorage/sessionStorageをクリア
    localStorage.clear()
    sessionStorage.clear()
    vi.clearAllMocks()
    
    // fetch のモック
    global.fetch = vi.fn()
  })

  it('should restore 200 items and scroll position when returning from external site', async () => {
    const user = userEvent.setup()
    
    // 1. 事前に200件のデータと表示状態を保存
    const savedState = {
      items: generateMockData(1, 200),
      displayCount: 200,
      currentPage: 2,
      hasMore: true,
      scrollPosition: 3000, // 150位あたりのスクロール位置
      timestamp: Date.now()
    }
    
    const storageKey = 'ranking-state-all-24h-none'
    localStorage.setItem(storageKey, JSON.stringify(savedState))
    
    // 2. 外部サイトから戻った想定で、初期データは100件のみ
    const initialData = generateMockData(1, 100)
    
    render(
      <ClientPage 
        initialData={initialData}
        initialGenre="all"
        initialPeriod="24h"
        initialTag={undefined}
        popularTags={[]}
      />
    )
    
    // 3. 200件が表示されることを確認
    await waitFor(() => {
      const items = screen.getAllByTestId('ranking-item')
      expect(items).toHaveLength(200)
    })
    
    // 4. 150位の動画が表示されていることを確認
    const item150 = screen.getByText('テスト動画 150')
    expect(item150).toBeInTheDocument()
    
    // 5. もっと見るボタンが適切に表示されることを確認
    const loadMoreButton = screen.getByRole('button', { name: 'もっと見る' })
    expect(loadMoreButton).toBeInTheDocument()
  })

  it('should not restore if data is older than 1 hour', async () => {
    // 2時間前のデータ
    const oldState = {
      items: generateMockData(1, 200),
      displayCount: 200,
      currentPage: 2,
      hasMore: true,
      scrollPosition: 3000,
      timestamp: Date.now() - 2 * 60 * 60 * 1000 // 2時間前
    }
    
    const storageKey = 'ranking-state-all-24h-none'
    localStorage.setItem(storageKey, JSON.stringify(oldState))
    
    const initialData = generateMockData(1, 100)
    
    render(
      <ClientPage 
        initialData={initialData}
        initialGenre="all"
        initialPeriod="24h"
        initialTag={undefined}
        popularTags={[]}
      />
    )
    
    // 初期データの100件のみ表示される
    await waitFor(() => {
      const items = screen.getAllByTestId('ranking-item')
      expect(items).toHaveLength(100)
    })
    
    // 古いデータは削除されている
    expect(localStorage.getItem(storageKey)).toBeNull()
  })

  it('should handle different configurations independently', async () => {
    // 異なる設定で複数の状態を保存
    const states = [
      { key: 'ranking-state-all-24h-none', displayCount: 200 },
      { key: 'ranking-state-game-24h-none', displayCount: 150 },
      { key: 'ranking-state-other-24h-タグA', displayCount: 300 }
    ]
    
    states.forEach(({ key, displayCount }) => {
      const state = {
        items: generateMockData(1, displayCount),
        displayCount,
        currentPage: Math.floor(displayCount / 100),
        hasMore: true,
        scrollPosition: 1000,
        timestamp: Date.now()
      }
      localStorage.setItem(key, JSON.stringify(state))
    })
    
    // 特定の設定でレンダリング
    const { rerender } = render(
      <ClientPage 
        initialData={generateMockData(1, 100)}
        initialGenre="game"
        initialPeriod="24h"
        initialTag={undefined}
        popularTags={[]}
      />
    )
    
    // game-24hの150件が復元される
    await waitFor(() => {
      const items = screen.getAllByTestId('ranking-item')
      expect(items).toHaveLength(150)
    })
    
    // 他の設定のデータは影響を受けない
    expect(localStorage.getItem('ranking-state-all-24h-none')).toBeTruthy()
    expect(localStorage.getItem('ranking-state-other-24h-タグA')).toBeTruthy()
  })
})