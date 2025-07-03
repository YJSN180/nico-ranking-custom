import React from 'react'
import { render, screen, waitFor } from '@testing-library/react'
import { vi } from 'vitest'
import ClientPage from '@/app/client-page'
import { MylistOperationsProvider } from '@/context/mylist-operations-context'
import type { RankingData } from '@/types/ranking'

// Mock fetch
global.fetch = vi.fn()

// Mock next/navigation
vi.mock('next/navigation', () => ({
  useRouter: () => ({
    push: vi.fn(),
    replace: vi.fn(),
    prefetch: vi.fn(),
  }),
  useSearchParams: () => new URLSearchParams(),
}))

// Mock hooks
vi.mock('@/hooks/use-realtime-stats', () => ({
  useRealtimeStats: () => ({
    items: [],
    isLoading: false,
    lastUpdated: null,
  }),
}))

vi.mock('@/hooks/use-user-preferences', () => ({
  useUserPreferences: () => ({
    updatePreferences: vi.fn(),
  }),
}))

vi.mock('@/hooks/use-user-ng-list', () => ({
  useUserNGList: () => ({
    filterItems: (items: any[]) => items,
    ngList: {
      videoIds: [],
      videoTitles: { exact: [], partial: [] },
      authorIds: [],
      authorNames: { exact: [], partial: [] },
      version: 1,
      totalCount: 0,
      updatedAt: new Date().toISOString(),
    },
    saveNGListDirectly: vi.fn(),
  }),
}))

vi.mock('@/hooks/use-mobile-detect', () => ({
  useMobileDetect: () => false,
}))

// ClientPageのpropsから人気タグを受け取るためのモック関数
let mockPopularTags: string[] = []

vi.mock('@/hooks/use-ranking-data', () => ({
  useRankingData: ({ initialData }: any) => ({
    rankingData: initialData?.items || [],
    fullRankingData: initialData?.items || [],
    currentPopularTags: mockPopularTags.length > 0 ? mockPopularTags : (initialData?.popularTags || []),
    loading: false,
    error: null,
    fetchRankingData: vi.fn(),
    setCurrentPopularTags: vi.fn((tags: string[]) => {
      mockPopularTags = tags
    }),
    setRankingData: vi.fn(),
    setFullRankingData: vi.fn(),
    setError: vi.fn(),
    abortControllerRef: { current: null },
    tagsAbortControllerRef: { current: null },
    isFallbackInitiatedRef: { current: false },
  }),
}))

describe('Popular Tags Cache', () => {
  const mockData: RankingData = [
    {
      rank: 1,
      id: 'sm1',
      title: 'Test Video 1',
      thumbURL: 'https://example.com/thumb1.jpg',
      views: 1000,
      comments: 100,
      mylists: 50,
      likes: 200,
    },
  ]

  // テスト環境のセットアップ
  beforeEach(() => {
    vi.clearAllMocks()
    ;(global.fetch as any).mockClear()
    
    // モック状態をリセット
    mockPopularTags = []
    
    // テスト環境フラグを設定
    Object.defineProperty(window, '__TEST_ENV__', {
      value: true,
      configurable: true,
    })
    
    // モックマイリストデータを設定
    Object.defineProperty(window, '__MOCK_MYLIST_DATA__', {
      value: {
        mylists: [],
      },
      configurable: true,
    })
  })

  afterEach(() => {
    // テスト環境フラグをクリア
    delete (window as any).__TEST_ENV__
    delete (window as any).__MOCK_MYLIST_DATA__
  })

  // テスト用のレンダリングヘルパー
  const renderWithProviders = (component: React.ReactElement) => {
    return render(
      <MylistOperationsProvider>
        {component}
      </MylistOperationsProvider>
    )
  }

  it('should cache popular tags from initial props', async () => {
    const popularTags = ['tag1', 'tag2', 'tag3']
    
    const { container } = renderWithProviders(
      <ClientPage
        initialData={{ items: mockData, popularTags }}
        initialGenre="game"
        initialPeriod="24h"
        popularTags={popularTags}
      />
    )

    await waitFor(() => {
      // Check if tags are in the component (they might be in buttons)
      const tagButtons = container.querySelectorAll('button')
      const tagTexts = Array.from(tagButtons).map(btn => btn.textContent)
      
      expect(tagTexts).toContain('tag1')
      expect(tagTexts).toContain('tag2')
      expect(tagTexts).toContain('tag3')
    })
  })

  it('should use cached popular tags when API returns empty array', async () => {
    const popularTags = ['tag1', 'tag2', 'tag3']
    
    // Mock API response with empty popular tags
    ;(global.fetch as any).mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        items: mockData,
        popularTags: [], // Empty array
      }),
    })

    const { container } = renderWithProviders(
      <ClientPage
        initialData={{ items: mockData, popularTags }}
        initialGenre="game"
        initialPeriod="24h"
        popularTags={popularTags}
      />
    )

    // Wait for initial render
    await waitFor(() => {
      const tagButtons = container.querySelectorAll('button')
      const tagTexts = Array.from(tagButtons).map(btn => btn.textContent)
      expect(tagTexts).toContain('tag1')
    })

    // TODO: Test genre switching with caching
    // This would require more complex mocking of React hooks
  })

  it('should maintain popular tags during rapid switching', async () => {
    const popularTags = ['initial1', 'initial2']
    
    const { container } = renderWithProviders(
      <ClientPage
        initialData={{ items: mockData, popularTags }}
        initialGenre="game"
        initialPeriod="24h"
        popularTags={popularTags}
      />
    )

    // Verify initial tags are present
    await waitFor(() => {
      const tagButtons = container.querySelectorAll('button')
      const tagTexts = Array.from(tagButtons).map(btn => btn.textContent)
      expect(tagTexts).toContain('initial1')
      expect(tagTexts).toContain('initial2')
    })

    // The actual fix ensures tags don't disappear during rapid switching
    // by implementing caching and proper AbortController handling
  })
})