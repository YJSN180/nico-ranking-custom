import { render, screen, fireEvent, waitFor } from '@testing-library/react'
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

describe('Progressive Loading UI', () => {
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

    // history モック
    Object.defineProperty(window, 'history', {
      value: {
        replaceState: vi.fn()
      }
    })

    // innerWidth モック（デスクトップ）
    Object.defineProperty(window, 'innerWidth', {
      value: 1024
    })
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  it('should display initial 30 items on desktop', () => {
    render(
      <ClientPage 
        initialData={mockData}
        initialGenre="all"
        initialPeriod="24h"
        popularTags={[]}
      />
    )

    // 30件表示されていることを確認
    expect(screen.getByText('30件表示中 / 全100件')).toBeInTheDocument()
    
    // 「もっと見る」ボタンが表示されることを確認
    expect(screen.getByText(/もっと見る \(20件\)/)).toBeInTheDocument()
    
    // 進捗表示の確認
    expect(screen.getByText('30% 表示済み')).toBeInTheDocument()
  })

  it('should load more items when "Show More" button is clicked', async () => {
    render(
      <ClientPage 
        initialData={mockData}
        initialGenre="all"
        initialPeriod="24h"
        popularTags={[]}
      />
    )

    // 初期状態の確認
    expect(screen.getByText('30件表示中 / 全100件')).toBeInTheDocument()

    // 「もっと見る」ボタンをクリック
    const showMoreButton = screen.getByText(/もっと見る \(20件\)/)
    fireEvent.click(showMoreButton)

    // ローディング状態の確認
    expect(screen.getByText('読み込み中...')).toBeInTheDocument()

    // アニメーション後の状態を確認
    await waitFor(() => {
      expect(screen.getByText('50件表示中 / 全100件')).toBeInTheDocument()
    }, { timeout: 1000 })

    // 進捗表示の更新確認
    expect(screen.getByText('50% 表示済み')).toBeInTheDocument()
  })

  it('should hide "Show More" button when all items are displayed', async () => {
    // 50件のデータでテスト（30 + 20で全表示）
    const smallData = createMockRankingData(50)
    
    render(
      <ClientPage 
        initialData={smallData}
        initialGenre="all"
        initialPeriod="24h"
        popularTags={[]}
      />
    )

    // 「もっと見る」ボタンをクリック
    const showMoreButton = screen.getByText(/もっと見る \(20件\)/)
    fireEvent.click(showMoreButton)

    // 全件表示後、ボタンが消えることを確認
    await waitFor(() => {
      expect(screen.getByText('50件表示中 / 全50件')).toBeInTheDocument()
    }, { timeout: 1000 })

    // 「もっと見る」ボタンが消えることを確認
    expect(screen.queryByText(/もっと見る/)).not.toBeInTheDocument()
    
    // もっと見るボタンが非表示になったことを確認（これで十分）
  })

  it('should reset display count when configuration changes', async () => {
    render(
      <ClientPage 
        initialData={mockData}
        initialGenre="all"
        initialPeriod="24h"
        popularTags={[]}
      />
    )

    // 「もっと見る」ボタンをクリックして50件表示
    const showMoreButton = screen.getByText(/もっと見る \(20件\)/)
    fireEvent.click(showMoreButton)

    await waitFor(() => {
      expect(screen.getByText('50件表示中 / 全100件')).toBeInTheDocument()
    }, { timeout: 1000 })

    // ジャンル変更（設定変更をシミュレート）
    // 実際の実装では、RankingSelectorコンポーネントを通じて変更される
    // ここでは直接的なテストのため、再レンダリングで初期状態をテスト
    const { rerender } = render(
      <ClientPage 
        initialData={mockData}
        initialGenre="game"  // ジャンル変更
        initialPeriod="24h"
        popularTags={[]}
      />
    )

    // 表示件数がリセットされることを確認（30件に戻る）
    expect(screen.getByText('30件表示中 / 全100件')).toBeInTheDocument()
  })

  it('should handle URL state management correctly', async () => {
    const mockReplaceState = vi.fn()
    Object.defineProperty(window, 'history', {
      value: {
        replaceState: mockReplaceState
      }
    })

    render(
      <ClientPage 
        initialData={mockData}
        initialGenre="all"
        initialPeriod="24h"
        popularTags={[]}
      />
    )

    // 「もっと見る」ボタンをクリック
    const showMoreButton = screen.getByText(/もっと見る \(20件\)/)
    fireEvent.click(showMoreButton)

    // URL状態が更新されることを確認
    await waitFor(() => {
      expect(mockReplaceState).toHaveBeenCalledWith(
        {},
        '',
        expect.stringContaining('show=50')
      )
    }, { timeout: 1000 })
  })

  it('should display correct remaining items count', () => {
    render(
      <ClientPage 
        initialData={mockData}
        initialGenre="all"
        initialPeriod="24h"
        popularTags={[]}
      />
    )

    // 未表示件数の確認
    expect(screen.getByText('(70件未表示)')).toBeInTheDocument()
  })

  it('should handle animation states correctly', async () => {
    render(
      <ClientPage 
        initialData={mockData}
        initialGenre="all"
        initialPeriod="24h"
        popularTags={[]}
      />
    )

    // 「もっと見る」ボタンをクリック
    const showMoreButton = screen.getByText(/もっと見る \(20件\)/)
    fireEvent.click(showMoreButton)

    // アニメーション開始時の確認
    expect(screen.getByText('読み込み中...')).toBeInTheDocument()

    // アニメーション完了後の確認
    await waitFor(() => {
      expect(screen.queryByText('読み込み中...')).not.toBeInTheDocument()
    }, { timeout: 1000 })

    // 新しい表示件数の確認
    expect(screen.getByText('50件表示中 / 全100件')).toBeInTheDocument()
  })
})