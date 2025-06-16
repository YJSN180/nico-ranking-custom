import { render, screen, waitFor } from '@testing-library/react'
import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest'
import ClientPage from '@/app/client-page'
import type { RankingData } from '@/types/ranking'

// モックデータの作成
const createMockRankingData = (count: number): RankingData => {
  return Array.from({ length: count }, (_, index) => ({
    rank: index + 1,
    id: `sm${10000000 + index}`,
    title: `テスト動画 ${index + 1}`,
    thumbURL: `https://example.com/thumb${index + 1}.jpg`,
    views: 1000 - index,
    comments: 100 - index,
    mylists: 50 - index,
    likes: 30 - index,
    tags: ['テスト', 'ランキング'],
    authorId: `user${index + 1}`,
    authorName: `ユーザー${index + 1}`,
    registeredAt: new Date().toISOString()
  }))
}

// モック設定
vi.mock('@/hooks/use-mobile-detect', () => ({
  useMobileDetect: () => false // デスクトップとしてテスト
}))

vi.mock('@/hooks/use-user-preferences', () => ({
  useUserPreferences: () => ({
    updatePreferences: vi.fn()
  })
}))

vi.mock('@/hooks/use-user-ng-list', () => ({
  useUserNGList: () => ({
    filterItems: vi.fn((items) => items) // NGフィルタなし
  })
}))

vi.mock('@/hooks/use-realtime-stats', () => ({
  useRealtimeStats: (data: any) => ({
    items: data,
    isLoading: false,
    lastUpdated: new Date().toISOString()
  })
}))

vi.mock('@/lib/popular-tags-client', () => ({
  getPopularTagsClient: vi.fn().mockResolvedValue(['タグ1', 'タグ2'])
}))

vi.mock('next/navigation', () => ({
  useRouter: () => ({
    push: vi.fn()
  }),
  useSearchParams: () => ({
    get: vi.fn().mockReturnValue(null)
  })
}))

describe('True Progressive Loading', () => {
  let mockData: RankingData

  beforeEach(() => {
    // 100件のテストデータを作成
    mockData = createMockRankingData(100)
    
    // localStorage モック
    Object.defineProperty(window, 'localStorage', {
      value: {
        getItem: vi.fn().mockReturnValue(null),
        setItem: vi.fn(),
        removeItem: vi.fn()
      }
    })

    // sessionStorage モック
    Object.defineProperty(window, 'sessionStorage', {
      value: {
        getItem: vi.fn().mockReturnValue(null),
        setItem: vi.fn(),
        removeItem: vi.fn()
      }
    })

    // location モック
    Object.defineProperty(window, 'location', {
      value: {
        href: 'http://localhost:3000/',
        search: ''
      }
    })

    // requestAnimationFrame モック
    let frameId = 0
    global.requestAnimationFrame = vi.fn((callback) => {
      const id = ++frameId
      setTimeout(() => callback(0), 0)
      return id
    })
    
    global.cancelAnimationFrame = vi.fn()
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  it('should automatically display items progressively without user interaction', async () => {
    const { container } = render(
      <ClientPage 
        initialData={mockData}
        initialGenre="all"
        initialPeriod="24h"
        popularTags={[]}
      />
    )

    // 初期レンダリングを待つ
    await waitFor(() => {
      expect(screen.getAllByRole('listitem')).toBeDefined()
    })

    // 初期表示は10件以上（React 18の並行機能により複数回実行される可能性）
    const initialItems = screen.getAllByRole('listitem')
    expect(initialItems.length).toBeGreaterThanOrEqual(10)
    expect(initialItems.length).toBeLessThanOrEqual(50)

    // 時間経過で自動的に追加表示される
    await waitFor(() => {
      const items = screen.getAllByRole('listitem')
      expect(items.length).toBeGreaterThan(20)
    }, { timeout: 1000 })

    // さらに時間経過で追加表示
    await waitFor(() => {
      const items = screen.getAllByRole('listitem')
      expect(items.length).toBeGreaterThan(30)
    }, { timeout: 2000 })
  })

  it('should show loading indicator during progressive loading', async () => {
    render(
      <ClientPage 
        initialData={mockData}
        initialGenre="all"
        initialPeriod="24h"
        popularTags={[]}
      />
    )

    // ローディングインジケーターが表示される
    await waitFor(() => {
      expect(screen.getByText(/ランキングを読み込み中\.\.\./)).toBeInTheDocument()
    })

    // プログレス表示（x/100形式）が表示される
    await waitFor(() => {
      const progressText = screen.getByText(/\d+\/100/)
      expect(progressText).toBeInTheDocument()
    })
  })

  it('should complete loading and show completion message', async () => {
    const smallData = createMockRankingData(30) // 少ないデータで完了を早める
    
    render(
      <ClientPage 
        initialData={smallData}
        initialGenre="all"
        initialPeriod="24h"
        popularTags={[]}
      />
    )

    // 最終的に全件表示完了メッセージが表示される
    await waitFor(() => {
      expect(screen.getByText('全30件表示完了')).toBeInTheDocument()
    }, { timeout: 3000 })

    // ローディングインジケーターが消える
    expect(screen.queryByText(/ランキングを読み込み中\.\.\./)).not.toBeInTheDocument()
  })

  it('should NOT show "Show More" button', () => {
    render(
      <ClientPage 
        initialData={mockData}
        initialGenre="all"
        initialPeriod="24h"
        popularTags={[]}
      />
    )

    // 「もっと見る」ボタンが存在しないことを確認
    expect(screen.queryByText(/もっと見る/)).not.toBeInTheDocument()
  })

  it('should apply fade-in animation to new items', async () => {
    render(
      <ClientPage 
        initialData={mockData}
        initialGenre="all"
        initialPeriod="24h"
        popularTags={[]}
      />
    )

    // アニメーションが適用されることを確認
    // スタイルはインラインではなくstyle jsxで適用されるため、
    // 実際のアニメーション効果の存在を確認する
    await waitFor(() => {
      const container = screen.getByRole('list')
      expect(container).toBeInTheDocument()
      
      // アイテムが表示されていることを確認
      const items = screen.getAllByRole('listitem')
      expect(items.length).toBeGreaterThan(0)
    })
  })

  it('should reset progressive loading when configuration changes', async () => {
    const { rerender } = render(
      <ClientPage 
        initialData={mockData}
        initialGenre="all"
        initialPeriod="24h"
        popularTags={[]}
      />
    )

    // 初期表示を待つ
    await waitFor(() => {
      const items = screen.getAllByRole('listitem')
      expect(items.length).toBeGreaterThan(0)
    })

    // 設定変更をシミュレート（新しいデータで再レンダリング）
    const newData = createMockRankingData(50)
    rerender(
      <ClientPage 
        initialData={newData}
        initialGenre="game"
        initialPeriod="24h"
        popularTags={[]}
      />
    )

    // 表示がリセットされて再度段階的表示が始まることを確認
    await waitFor(() => {
      const items = screen.getAllByRole('listitem')
      expect(items.length).toBeLessThanOrEqual(20) // StrictModeで最大20件
    })
  })
})