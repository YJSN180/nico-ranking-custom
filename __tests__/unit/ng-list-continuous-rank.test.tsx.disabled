import React from 'react'
import { render, screen, waitFor } from '@testing-library/react'
import '@testing-library/jest-dom'
import ClientPage from '@/app/client-page'
import { vi } from 'vitest'

// Mock next/navigation
// Navigation mock is provided by global setup in vitest.setup.ts

// Mock hooks
vi.mock('@/hooks/use-user-preferences', () => ({
  useUserPreferences: () => ({
    preferences: {
      theme: 'light',
      lastGenre: 'all',
      lastPeriod: '24h',
      lastTag: undefined
    },
    updatePreferences: vi.fn()
  })
}))

vi.mock('@/hooks/use-user-ng-list', () => ({
  useUserNGList: () => ({
    ngList: {
      videoIds: ['sm2', 'sm5', 'sm8'], // Block every 3rd item
      derivedVideoIds: [],
      videoTitles: { exact: [], partial: [] },
      authorIds: [],
      authorNames: { exact: [], partial: [] },
      updatedAt: Date.now()
    }
  })
}))

vi.mock('@/hooks/use-genre-order-v2', () => ({
  useGenreOrderV2: () => ({
    visibleGenres: ['all', 'game', 'anime', 'vocaloid', 'entertainment', 'music'],
    items: [],
    hiddenGenres: [],
    hasChanges: false,
    moveItem: vi.fn(),
    toggleVisibility: vi.fn(),
    resetToDefault: vi.fn(),
    hideAll: vi.fn(),
    showAll: vi.fn(),
    applyChanges: vi.fn(),
    cancelChanges: vi.fn()
  })
}))

vi.mock('@/hooks/use-ranking-data', () => ({
  useRankingData: ({ initialData }: any) => ({
    rankingData: initialData?.items || [],
    fullRankingData: initialData?.items || [],
    currentPopularTags: initialData?.popularTags || [],
    loading: false,
    error: null,
    fetchRankingData: vi.fn(),
    setCurrentPopularTags: vi.fn(),
    setRankingData: vi.fn(),
    setFullRankingData: vi.fn(),
    setError: vi.fn(),
    abortControllerRef: { current: null },
    tagsAbortControllerRef: { current: null },
    isFallbackInitiatedRef: { current: false }
  })
}))

vi.mock('@/hooks/use-navigation-state', () => ({
  useNavigationState: () => {}
}))

// Mock filterWithNGList to properly filter items
vi.mock('@/lib/filter-with-ng-list', () => ({
  filterWithNGList: (items: any[], ngList: any) => {
    // Filter out items with IDs in ngList.videoIds
    const blockedIds = new Set(ngList.videoIds || [])
    const filteredItems = items.filter((item: any) => !blockedIds.has(item.id))
    // Re-rank the filtered items
    const rerankedItems = filteredItems.map((item: any, index: number) => ({
      ...item,
      rank: index + 1
    }))
    return {
      filteredItems: rerankedItems,
      newDerivedIds: []
    }
  }
}))

// Mock lazy loaded components
vi.mock('@/components/pagination', () => ({
  __esModule: true,
  default: ({ currentPage, onPageChange, totalPages }: any) => (
    <div data-testid="pagination">
      Page {currentPage} of {totalPages}
      <button onClick={() => onPageChange(2)}>Go to page 2</button>
    </div>
  )
}))

vi.mock('@/components/tag-selector', () => ({
  TagSelector: () => <div>Tag Selector</div>
}))

vi.mock('@/components/ranking-selector', () => ({
  RankingSelector: () => <div>Ranking Selector</div>
}))

vi.mock('@/components/mylist-button', () => ({
  MylistButton: () => <button>Add to Mylist</button>
}))

vi.mock('@/components/optimized-image', () => ({
  OptimizedImage: ({ alt }: any) => <img alt={alt} />
}))

// Mock utils
vi.mock('@/lib/popular-tags-client', () => ({
  getPopularTagsClient: vi.fn(() => Promise.resolve(['tag1', 'tag2']))
}))

vi.mock('@/lib/migrate-local-storage', () => ({
  migrateLocalStorageData: vi.fn()
}))

vi.mock('@/lib/date-utils', () => ({
  formatRegisteredDate: () => '2025-06-30',
  isWithin24Hours: () => false
}))

vi.mock('@/lib/format-utils', () => ({
  formatNumberMobile: (n: number) => n.toString(),
  formatTimeAgo: () => '1日前',
  formatTimeCompact: () => '1日前',
  formatDuration: () => '3:45'
}))

// Create mock items
const createMockItems = (count: number) => {
  return Array.from({ length: count }, (_, i) => ({
    id: `sm${i + 1}`,
    title: `Video ${i + 1}`,
    rank: i + 1,
    views: 1000 + i,
    comments: 100 + i,
    mylists: 50 + i,
    likes: 200 + i,
    thumbURL: `https://example.com/thumb${i + 1}.jpg`,
    registeredAt: '2025-06-30T00:00:00Z',
    duration: 225,
    authorId: `user${i + 1}`,
    authorName: `Author ${i + 1}`,
    authorIcon: `https://example.com/icon${i + 1}.jpg`
  }))
}

describe('NG List Continuous Rank Display', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('should display continuous rank numbers after NG filtering across pages', async () => {
    // Create 200 items, NG list will filter out sm2, sm5, sm8, etc.
    const mockItems = createMockItems(200)
    
    const { rerender } = render(
      <ClientPage 
        initialData={{ items: mockItems }}
        initialGenre="all"
        initialPeriod="24h"
      />
    )

    // Wait for initial render
    await waitFor(() => {
      const items = screen.getAllByTestId('ranking-item')
      expect(items.length).toBeGreaterThan(0)
    })

    // Check first page ranks
    const firstPageItems = screen.getAllByTestId('ranking-item')
    
    // First visible item should be rank 1 (sm1 is not blocked)
    const firstRankElement = firstPageItems[0].querySelector('.ranking-item-responsive__rank')
    expect(firstRankElement).toHaveTextContent('1')
    expect(firstPageItems[0]).toHaveTextContent('Video 1')
    
    // Second visible item should be rank 2 (sm3, since sm2 is blocked)
    const secondRankElement = firstPageItems[1].querySelector('.ranking-item-responsive__rank')
    expect(secondRankElement).toHaveTextContent('2')
    expect(firstPageItems[1]).toHaveTextContent('Video 3')
    
    // Third visible item should be rank 3 (sm4)
    const thirdRankElement = firstPageItems[2].querySelector('.ranking-item-responsive__rank')
    expect(thirdRankElement).toHaveTextContent('3')
    expect(firstPageItems[2]).toHaveTextContent('Video 4')
    
    // Navigate to page 2 (there are 2 pagination components)
    const goToPage2Buttons = screen.getAllByText('Go to page 2')
    goToPage2Buttons[0].click()

    // Re-render with page 2
    rerender(
      <ClientPage 
        initialData={{ items: mockItems }}
        initialGenre="all"
        initialPeriod="24h"
        initialPage={2}
      />
    )

    await waitFor(() => {
      const items = screen.getAllByTestId('ranking-item')
      expect(items.length).toBeGreaterThan(0)
    })

    // Check second page ranks - should continue from where page 1 left off
    const secondPageItems = screen.getAllByTestId('ranking-item')
    
    // First item on page 2 should NOT be rank 1 again
    // It should continue with the next available rank after filtering
    const firstRankOnPage2Element = secondPageItems[0].querySelector('.ranking-item-responsive__rank')
    const firstRankOnPage2 = firstRankOnPage2Element?.textContent
    expect(parseInt(firstRankOnPage2 || '0')).toBeGreaterThan(100)
    
    // Verify ranks are continuous within page 2
    for (let i = 1; i < Math.min(5, secondPageItems.length); i++) {
      const currentRankElement = secondPageItems[i].querySelector('.ranking-item-responsive__rank')
      const previousRankElement = secondPageItems[i - 1].querySelector('.ranking-item-responsive__rank')
      const currentRank = parseInt(currentRankElement?.textContent || '0')
      const previousRank = parseInt(previousRankElement?.textContent || '0')
      expect(currentRank).toBe(previousRank + 1)
    }
  })

  it.skip('should maintain continuous ranks when all items are displayed on single page', async () => {
    // Create 50 items for a more realistic test case
    const mockItems = createMockItems(50)
    
    render(
      <ClientPage 
        initialData={{ items: mockItems }}
        initialGenre="all"
        initialPeriod="24h"
      />
    )

    await waitFor(() => {
      const items = screen.getAllByTestId('ranking-item')
      expect(items.length).toBeGreaterThan(0)
    })

    // Get displayed items
    const items = screen.getAllByTestId('ranking-item')
    
    // With NG list blocking sm2, sm5, sm8, sm11, sm14, sm17, sm20, sm23, sm26, sm29, sm32, sm35, sm38, sm41, sm44, sm47, sm50
    // (every 3rd item starting from sm2)
    
    // Check that ranks are continuous
    for (let i = 1; i < Math.min(5, items.length); i++) {
      const currentRankElement = items[i].querySelector('.ranking-item-responsive__rank')
      const previousRankElement = items[i - 1].querySelector('.ranking-item-responsive__rank')
      const currentRank = parseInt(currentRankElement?.textContent || '0')
      const previousRank = parseInt(previousRankElement?.textContent || '0')
      expect(currentRank).toBe(previousRank + 1)
    }
    
    // Verify first few items are correctly filtered
    expect(items[0]).toHaveTextContent('Video 1') // sm1 not blocked
    expect(items[1]).toHaveTextContent('Video 3') // sm3 (sm2 is blocked)
    expect(items[2]).toHaveTextContent('Video 4') // sm4
    expect(items[3]).toHaveTextContent('Video 6') // sm6 (sm5 is blocked)
  })
})