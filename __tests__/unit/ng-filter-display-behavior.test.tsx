import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
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

let mockFilterItems = (items: any[]) => items

vi.mock('@/hooks/use-user-ng-list', () => ({
  useUserNGList: () => ({
    ngList: {
      videoIds: [],
      videoTitles: { exact: [], partial: [] },
      authorIds: [],
      authorNames: { exact: [], partial: [] },
      version: 1,
      totalCount: 0,
      updatedAt: new Date().toISOString()
    },
    filterItems: mockFilterItems,
    addVideoId: vi.fn(),
    removeVideoId: vi.fn(),
    addVideoTitle: vi.fn(),
    removeVideoTitle: vi.fn(),
    addAuthorId: vi.fn(),
    removeAuthorId: vi.fn(),
    addAuthorName: vi.fn(),
    removeAuthorName: vi.fn(),
    resetNGList: vi.fn()
  })
}))

vi.mock('@/hooks/use-realtime-stats', () => ({
  useRealtimeStats: (data: any[]) => ({
    items: data,
    isLoading: false,
    lastUpdated: null
  })
}))

describe('NG設定反映後の表示挙動', () => {
  const createMockData = (count: number) => {
    return Array.from({ length: count }, (_, i) => {
      const index = i + 1
      return {
        rank: index,
        id: `sm${index}`,
        title: index % 3 === 1 ? `【実況】テスト動画 ${index}` : `テスト動画 ${index}`,
        thumbURL: 'https://example.com/thumb.jpg',
        views: 1000 - i,
        comments: 10,
        mylists: 5,
        likes: 20
      }
    })
  }

  beforeEach(() => {
    // デフォルトのフィルタ（何もフィルタしない）
    mockFilterItems = (items: any[]) => items
  })

  it('通常時: 200件すべて表示される', () => {
    const mockData = createMockData(200)
    
    render(
      <ClientPage 
        initialData={mockData}
        initialGenre="all"
        initialPeriod="24h"
      />
    )

    // 200件すべて表示される（500件未満なので全件表示）
    const items = screen.getAllByText(/テスト動画/)
    expect(items).toHaveLength(200)
  })

  it('NG設定後: 表示件数が減り、順位が繰り上がる', () => {
    // 「実況」をNGワードに設定
    mockFilterItems = (items: any[]) => {
      return items.filter(item => !item.title.includes('実況'))
    }
    
    const mockData = createMockData(200)
    
    render(
      <ClientPage 
        initialData={mockData}
        initialGenre="all"
        initialPeriod="24h"
      />
    )

    // NGフィルタリング後、残った項目が表示される
    const items = screen.getAllByText(/テスト動画/)
    // 200件中、3件に1件が「実況」を含むので、約133件が残る
    expect(items.length).toBeGreaterThan(100)
    expect(items.length).toBeLessThan(200)
    
    // 順位は繰り上がる（1位の実況動画がNGなら、2位が1位として表示）
    // テスト動画 2 が最初に表示されるはず
    expect(items[0]).toHaveTextContent('テスト動画 2')
  })

  it('NG設定後: 順位番号が正しく振り直される', () => {
    // 特定の動画IDをNGに設定
    mockFilterItems = (items: any[]) => {
      return items.filter(item => !['sm1', 'sm3', 'sm5'].includes(item.id))
    }
    
    const mockData = createMockData(10)
    
    const { container } = render(
      <ClientPage 
        initialData={mockData}
        initialGenre="all"
        initialPeriod="24h"
      />
    )

    // ランキングアイテムを取得
    const rankingItems = container.querySelectorAll('[data-testid="ranking-item"]')
    
    // 7件表示される（10件中3件がNG）
    expect(rankingItems).toHaveLength(7)
    
    // 順位が1から連続していることを確認
    // sm2（元2位）が1位として表示
    // sm4（元4位）が2位として表示
    // sm6（元6位）が3位として表示
    const firstItem = rankingItems[0]
    expect(firstItem).toBeDefined()
    expect(firstItem?.textContent).toContain('1') // 順位
    expect(firstItem?.textContent).toContain('テスト動画 2') // タイトル
    
    const secondItem = rankingItems[1]
    expect(secondItem).toBeDefined()
    expect(secondItem?.textContent).toContain('2') // 順位
    expect(secondItem?.textContent).toContain('テスト動画 4') // タイトル
  })

  it('もっと見るボタンは表示されない（ページネーション廃止）', () => {
    // 「実況」をNGワードに設定
    mockFilterItems = (items: any[]) => {
      return items.filter(item => !item.title.includes('実況'))
    }
    
    const mockData = createMockData(200)
    
    render(
      <ClientPage 
        initialData={mockData}
        initialGenre="all"
        initialPeriod="24h"
      />
    )

    // もっと見るボタンは存在しない（ページネーション廃止）
    expect(screen.queryByText(/もっと見る/)).not.toBeInTheDocument()
  })
})