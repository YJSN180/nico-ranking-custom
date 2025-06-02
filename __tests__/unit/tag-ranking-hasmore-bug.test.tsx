import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
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

describe('タグ別ランキングのhasMoreバグ', () => {
  beforeEach(() => {
    // sessionStorageをクリア
    sessionStorage.clear()
  })

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

  it('初回レンダリング時に47件のタグ別ランキングでボタンが一瞬表示される問題', async () => {
    const mockData = createMockData(47)
    
    const { rerender } = render(
      <ClientPage 
        initialData={mockData}
        initialGenre="game"
        initialPeriod="24h"
        initialTag="レアタグ"
      />
    )

    // 初期状態でhasMore=trueなので、一瞬ボタンが表示される可能性
    // これが問題の原因
    
    // しばらく待ってから確認
    await waitFor(() => {
      expect(screen.queryByText('もっと見る')).not.toBeInTheDocument()
    })
  })

  it('sessionStorage復元時のhasMore設定の問題', () => {
    // sessionStorageに不完全なデータを設定
    const storageKey = 'ranking-state-game-24h-テストタグ'
    sessionStorage.setItem(storageKey, JSON.stringify({
      items: createMockData(47),
      displayCount: 47,
      currentPage: 1,
      // hasMoreが未定義の場合
    }))

    render(
      <ClientPage 
        initialData={createMockData(47)}
        initialGenre="game"
        initialPeriod="24h"
        initialTag="テストタグ"
      />
    )

    // hasMoreがundefinedの場合、state.hasMore !== false は true になる
    // これによりボタンが表示されてしまう
    expect(screen.queryByText('もっと見る')).not.toBeInTheDocument()
  })
})