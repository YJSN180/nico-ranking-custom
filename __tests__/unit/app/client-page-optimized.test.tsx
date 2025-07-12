import React from 'react'
import { screen, waitFor } from '@testing-library/react'
import { render } from '@/__tests__/test-utils'
import '@testing-library/jest-dom'
import { vi, describe, it, expect, beforeEach } from 'vitest'
import ClientPageOptimized from '@/app/client-page-optimized'
import type { RankingItem } from '@/types/ranking'

// Mock Next.js navigation must be done before imports
const mockRouter = {
  push: vi.fn(),
  replace: vi.fn(),
  prefetch: vi.fn(),
  back: vi.fn(),
  forward: vi.fn(),
  refresh: vi.fn(),
}

const mockSearchParams = {
  get: vi.fn(),
  toString: vi.fn(() => ''),
}

vi.mock('next/navigation', () => ({
  useRouter: () => mockRouter,
  useSearchParams: () => mockSearchParams,
  usePathname: () => '/',
  useParams: () => ({}),
}))

// Mock components with lazy loading
let mockOnConfigChange: any = null
vi.mock('@/components/ranking-selector', () => ({
  RankingSelector: ({ config, onConfigChange }: any) => {
    // Store the callback for testing
    mockOnConfigChange = onConfigChange
    return (
      <div data-testid="ranking-selector">
        {config.genre} - {config.period}
      </div>
    )
  },
}))

// Mock dynamic imports
vi.mock('@/components/ranking-item-responsive', () => {
  return {
    default: function RankingItemResponsive({ item }: any) {
      return (
        <li data-testid={`ranking-item-${item.id}`}>
          {item.rank}. {item.title}
        </li>
      )
    }
  }
})

vi.mock('@/components/pagination', () => {
  return {
    default: function Pagination({ currentPage, totalPages, onPageChange }: any) {
      return (
        <div data-testid="pagination">
          Page {currentPage} of {totalPages}
        </div>
      )
    }
  }
})

vi.mock('@/components/tag-selector', () => ({
  TagSelector: ({ config, popularTags }: any) => (
    <div data-testid="tag-selector">
      {popularTags?.join(', ')}
    </div>
  ),
}))

// Mock hooks with lazy loading
vi.mock('@/hooks/use-user-preferences', () => ({
  useUserPreferences: () => ({
    preferences: {},
    updatePreferences: vi.fn(),
  }),
}))

vi.mock('@/hooks/use-user-ng-list', () => ({
  useUserNGList: () => ({
    ngList: {},
  }),
}))

vi.mock('@/hooks/use-ranking-data', () => ({
  useRankingData: () => ({
    rankingData: [],
    fullRankingData: [],
    currentPopularTags: [],
    loading: false,
    error: null,
    fetchRankingData: vi.fn(),
    setCurrentPopularTags: vi.fn(),
    setRankingData: vi.fn(),
    setFullRankingData: vi.fn(),
    setError: vi.fn(),
    abortControllerRef: { current: null },
    tagsAbortControllerRef: { current: null },
    isFallbackInitiatedRef: { current: false },
  }),
}))

describe('ClientPageOptimized', () => {
  const mockRouter = {
    push: vi.fn(),
    replace: vi.fn(),
    prefetch: vi.fn(),
  }

  const mockSearchParams = new URLSearchParams()

  const mockRankingItems: RankingItem[] = [
    {
      id: 'sm1',
      rank: 1,
      title: 'Test Video 1',
      viewCount: 1000,
      likeCount: 100,
      mylistCount: 50,
      uploadedAt: '2024-01-01T00:00:00Z',
      lengthInSeconds: 300,
      tags: ['tag1', 'tag2'],
      authorName: 'Author 1',
      authorIcon: 'https://example.com/icon1.jpg',
    },
    {
      id: 'sm2',
      rank: 2,
      title: 'Test Video 2',
      viewCount: 500,
      likeCount: 50,
      mylistCount: 25,
      uploadedAt: '2024-01-02T00:00:00Z',
      lengthInSeconds: 600,
      tags: ['tag2', 'tag3'],
      authorName: 'Author 2',
      authorIcon: 'https://example.com/icon2.jpg',
    },
  ]

  beforeEach(() => {
    vi.clearAllMocks()
    // Reset mock implementations
    mockRouter.push.mockClear()
    mockRouter.replace.mockClear()
    mockSearchParams.get.mockClear()
    mockSearchParams.toString.mockClear()
  })

  it('renders initial data immediately without hydration', () => {
    render(
      <ClientPageOptimized
        initialData={{ items: mockRankingItems }}
        initialGenre="all"
        initialPeriod="24h"
      />
    )

    expect(screen.getByTestId('ranking-selector')).toBeInTheDocument()
    
    // Should not render tag selector until hydrated
    expect(screen.queryByTestId('tag-selector')).not.toBeInTheDocument()
  })

  it('shows ranking items with progressive loading', async () => {
    render(
      <ClientPageOptimized
        initialData={{ items: mockRankingItems }}
        initialGenre="all"
        initialPeriod="24h"
      />
    )

    // Wait for lazy-loaded components
    await waitFor(() => {
      expect(screen.getByTestId('ranking-item-sm1')).toBeInTheDocument()
      expect(screen.getByTestId('ranking-item-sm2')).toBeInTheDocument()
    })
  })

  it('handles pagination efficiently', async () => {
    const manyItems = Array.from({ length: 150 }, (_, i) => ({
      ...mockRankingItems[0],
      id: `sm${i + 1}`,
      rank: i + 1,
      title: `Test Video ${i + 1}`,
    }))

    render(
      <ClientPageOptimized
        initialData={{ items: manyItems }}
        allRankingData={manyItems}
        initialGenre="all"
        initialPeriod="24h"
      />
    )

    // Should show only first 100 items
    await waitFor(() => {
      expect(screen.getByTestId('ranking-item-sm1')).toBeInTheDocument()
      expect(screen.getByTestId('ranking-item-sm100')).toBeInTheDocument()
      expect(screen.queryByTestId('ranking-item-sm101')).not.toBeInTheDocument()
    })
  })

  it('updates URL when config changes', async () => {
    render(
      <ClientPageOptimized
        initialData={{ items: mockRankingItems }}
        initialGenre="all"
        initialPeriod="24h"
      />
    )

    // Initial state
    expect(screen.getByTestId('ranking-selector')).toHaveTextContent('all - 24h')

    // Simulate config change through the stored callback
    expect(mockOnConfigChange).toBeTruthy()
    
    // Call the config change handler
    mockOnConfigChange({ genre: 'game', period: 'hour' })

    // Wait for URL update
    await waitFor(() => {
      expect(mockRouter.push).toHaveBeenCalledWith('?genre=game&period=hour', { scroll: false })
    })
  })

  it('handles empty data gracefully', () => {
    render(
      <ClientPageOptimized
        initialData={{ items: [] }}
        initialGenre="all"
        initialPeriod="24h"
      />
    )

    expect(screen.getByTestId('ranking-selector')).toBeInTheDocument()
    expect(screen.queryByTestId('pagination')).not.toBeInTheDocument()
  })

  it('renders tag selector after hydration', async () => {
    // This test verifies that tag selector is rendered after hydration
    render(
      <ClientPageOptimized
        initialData={{ items: mockRankingItems }}
        initialGenre="all"
        initialPeriod="24h"
        popularTags={['popular1', 'popular2']}
      />
    )

    // Wait for hydration and tag selector to appear
    await waitFor(() => {
      const tagSelector = screen.getByTestId('tag-selector')
      expect(tagSelector).toBeInTheDocument()
      expect(tagSelector).toHaveTextContent('popular1, popular2')
    })
  })

  it('prioritizes first 5 items for loading', async () => {
    const items = Array.from({ length: 10 }, (_, i) => ({
      ...mockRankingItems[0],
      id: `sm${i + 1}`,
      rank: i + 1,
    }))

    render(
      <ClientPageOptimized
        initialData={{ items }}
        initialGenre="all"
        initialPeriod="24h"
      />
    )

    await waitFor(() => {
      // First 5 items should load with priority
      for (let i = 1; i <= 5; i++) {
        expect(screen.getByTestId(`ranking-item-sm${i}`)).toBeInTheDocument()
      }
    })
  })
})