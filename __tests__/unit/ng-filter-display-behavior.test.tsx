import { describe, it, expect, vi, beforeEach } from 'vitest'
import { screen } from '@testing-library/react'
import { render } from '@/__tests__/test-utils'
import ClientPage from '@/app/client-page'

// 動的インポートのモック
vi.mock('@/components/pagination', () => ({
  default: ({ currentPage, totalPages, onPageChange }: any) => (
    <div data-testid="pagination">
      Page {currentPage} of {totalPages}
    </div>
  )
}))

vi.mock('@/components/tag-selector', () => ({
  TagSelector: ({ config, onConfigChange, popularTags = [] }: any) => {
    if (config.tag) return null
    const visibleTags = config.genre === 'all' ? [] : popularTags
    return (
      <div className="_selectorContainer_933bb3">
        <div>
          <h2 className="_selectorTitle_933bb3">人気タグ</h2>
          <div className="_buttonContainer_933bb3">
            <button className="_button_933bb3 _buttonSelected_933bb3">すべて</button>
            {visibleTags.map((tag: string) => (
              <button key={tag} className="_button_933bb3">{tag}</button>
            ))}
          </div>
        </div>
      </div>
    )
  }
}))

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

  it('通常時: 1ページ100件表示される', () => {
    const mockData = createMockData(200)
    
    render(
      <ClientPage 
        initialData={{ items: mockData }}
        allRankingData={mockData}
        initialGenre="all"
        initialPeriod="24h"
        popularTags={[]}
      />
    )

    // 1ページ目は100件表示される（ページネーション適用）
    const items = screen.getAllByText(/テスト動画/)
    expect(items).toHaveLength(100)
  })

  it('NG設定後: フィルタリング適用されて表示される', () => {
    // 「実況」をNGワードに設定
    mockFilterItems = (items: any[]) => {
      return items.filter(item => !item.title.includes('実況'))
    }
    
    const mockData = createMockData(150)
    const filteredData = mockFilterItems(mockData)
    
    render(
      <ClientPage 
        initialData={{ items: filteredData }}
        allRankingData={filteredData}
        initialGenre="all"
        initialPeriod="24h"
        popularTags={[]}
      />
    )

    // NGフィルタリング後、1ページ目の表示件数（最大100件）
    const items = screen.getAllByText(/テスト動画/)
    // フィルタリングされているので100件以下
    expect(items.length).toBeLessThanOrEqual(100)
    
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
    const filteredData = mockFilterItems(mockData)
    
    const { container } = render(
      <ClientPage 
        initialData={{ items: filteredData }}
        allRankingData={filteredData}
        initialGenre="all"
        initialPeriod="24h"
        popularTags={[]}
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
    const filteredData = mockFilterItems(mockData)
    
    render(
      <ClientPage 
        initialData={{ items: filteredData }}
        allRankingData={filteredData}
        initialGenre="all"
        initialPeriod="24h"
        popularTags={[]}
      />
    )

    // もっと見るボタンは存在しない（ページネーション廃止）
    expect(screen.queryByText(/もっと見る/)).not.toBeInTheDocument()
  })
})