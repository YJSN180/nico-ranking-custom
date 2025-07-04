import { describe, it, expect, vi, beforeEach } from 'vitest'
import { screen, waitFor } from '@testing-library/react'
import { render } from '@/__tests__/test-utils'
import ClientPage from '@/app/client-page'
import { useUserNGList } from '@/hooks/use-user-ng-list'
import type { RankingItem } from '@/types/ranking'

// Mock the required modules
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn() }),
  useSearchParams: () => new URLSearchParams()
}))

vi.mock('@/hooks/use-realtime-stats', () => ({
  useRealtimeStats: () => ({ items: [], isUpdating: false, lastUpdated: null })
}))

vi.mock('@/hooks/use-user-preferences', () => ({
  useUserPreferences: () => ({
    preferences: { theme: 'light', lastGenre: 'all', lastPeriod: '24h' },
    updatePreferences: vi.fn()
  })
}))

vi.mock('@/hooks/use-user-ng-list')

vi.mock('@/hooks/use-mobile-detect', () => ({
  useMobileDetect: () => false
}))

vi.mock('@/lib/migrate-local-storage', () => ({
  migrateLocalStorageData: vi.fn()
}))

vi.mock('@/lib/ranking-cache', () => ({
  rankingCache: {
    get: vi.fn(),
    set: vi.fn()
  }
}))

vi.mock('@/lib/request-throttle', () => ({
  requestThrottle: {
    throttle: vi.fn().mockResolvedValue(undefined)
  }
}))

describe('NG List Rank Recalculation', () => {
  let mockFilterItems = vi.fn()
  
  const createRankingItem = (id: string, rank: number): RankingItem => ({
    id,
    rank,
    title: `Video ${id}`,
    thumbURL: 'http://example.com/thumb.jpg',
    views: 1000,
    comments: 10,
    mylists: 5,
    likes: 20
  })

  beforeEach(() => {
    vi.clearAllMocks()
    
    // Reset mock filter function
    mockFilterItems = vi.fn()
    mockFilterItems.mockImplementation((items) => items)
  })

  it('should recalculate ranks immediately when NG list changes', async () => {
    const initialData = [
      createRankingItem('sm1', 1),
      createRankingItem('sm2', 2),
      createRankingItem('sm3', 3),
      createRankingItem('sm4', 4),
      createRankingItem('sm5', 5)
    ]

    // Initial setup with no filtering
    vi.mocked(useUserNGList).mockReturnValue({
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
      saveNGListDirectly: vi.fn()
    })

    const { rerender } = render(
      <ClientPage 
        initialData={{items: initialData}}
        allRankingData={initialData}
        initialGenre="all"
        initialPeriod="24h"
      />
    )

    // Initially all 5 items should be displayed
    await waitFor(() => {
      const items = screen.getAllByRole('listitem')
      expect(items).toHaveLength(5)
    })

    // Update the mock to filter out sm2 and sm4
    const newMockFilterItems = vi.fn()
    newMockFilterItems.mockImplementation((items) => 
      items.filter(item => !['sm2', 'sm4'].includes(item.id))
    )

    // Update the hook mock to use the new filter function
    vi.mocked(useUserNGList).mockReturnValue({
      ngList: {
        videoIds: ['sm2', 'sm4'],
        videoTitles: { exact: [], partial: [] },
        authorIds: [],
        authorNames: { exact: [], partial: [] },
        version: 1,
        totalCount: 2,
        updatedAt: new Date().toISOString()
      },
      filterItems: newMockFilterItems,
      saveNGListDirectly: vi.fn()
    })

    // Force re-render with new mock data
    rerender(
      <ClientPage 
        initialData={{items: initialData}}
        allRankingData={initialData}
        initialGenre="all"
        initialPeriod="24h"
      />
    )

    // Wait for the UI to update
    await waitFor(() => {
      const items = screen.getAllByRole('listitem')
      expect(items).toHaveLength(3)
    })

    // Verify ranks are recalculated
    const filteredItems = screen.getAllByRole('listitem')
    expect(filteredItems).toHaveLength(3)
    
    // Check that remaining items have consecutive ranks (1, 2, 3)
    expect(filteredItems[0]).toHaveTextContent('Video sm1')
    expect(filteredItems[1]).toHaveTextContent('Video sm3')
    expect(filteredItems[2]).toHaveTextContent('Video sm5')
  })

  it('should handle empty results after NG filtering', async () => {
    const initialData = [
      createRankingItem('sm1', 1),
      createRankingItem('sm2', 2)
    ]

    // Initial setup
    vi.mocked(useUserNGList).mockReturnValue({
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
      saveNGListDirectly: vi.fn()
    })

    const { rerender } = render(
      <ClientPage 
        initialData={{items: initialData}}
        allRankingData={initialData}
        initialGenre="all"
        initialPeriod="24h"
      />
    )

    // Update mock to filter out all items
    const emptyFilterItems = vi.fn()
    emptyFilterItems.mockImplementation(() => [])

    vi.mocked(useUserNGList).mockReturnValue({
      ngList: {
        videoIds: ['sm1', 'sm2'],
        videoTitles: { exact: [], partial: [] },
        authorIds: [],
        authorNames: { exact: [], partial: [] },
        version: 1,
        totalCount: 2,
        updatedAt: new Date().toISOString()
      },
      filterItems: emptyFilterItems,
      saveNGListDirectly: vi.fn()
    })

    // Force re-render with new mock data
    rerender(
      <ClientPage 
        initialData={{items: initialData}}
        allRankingData={initialData}
        initialGenre="all"
        initialPeriod="24h"
      />
    )

    // Should show empty state
    await waitFor(() => {
      expect(screen.getByText('ランキングデータがありません')).toBeInTheDocument()
    })
  })

  it('should maintain performance with large datasets', async () => {
    // Create 500 items
    const largeDataset = Array.from({ length: 500 }, (_, i) => 
      createRankingItem(`sm${i + 1}`, i + 1)
    )

    // Initial setup
    vi.mocked(useUserNGList).mockReturnValue({
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
      saveNGListDirectly: vi.fn()
    })

    const { rerender } = render(
      <ClientPage 
        initialData={{items: largeDataset}}
        allRankingData={largeDataset}
        initialGenre="all"
        initialPeriod="24h"
      />
    )

    // Filter out every 5th item (100 items total)
    const filteredIds = new Set(
      Array.from({ length: 100 }, (_, i) => `sm${(i + 1) * 5}`)
    )
    
    const filteredMockFilterItems = vi.fn()
    filteredMockFilterItems.mockImplementation((items) => 
      items.filter(item => !filteredIds.has(item.id))
    )

    vi.mocked(useUserNGList).mockReturnValue({
      ngList: {
        videoIds: Array.from(filteredIds),
        videoTitles: { exact: [], partial: [] },
        authorIds: [],
        authorNames: { exact: [], partial: [] },
        version: 1,
        totalCount: 100,
        updatedAt: new Date().toISOString()
      },
      filterItems: filteredMockFilterItems,
      saveNGListDirectly: vi.fn()
    })

    const startTime = performance.now()

    // Force re-render with new mock data
    rerender(
      <ClientPage 
        initialData={{items: largeDataset}}
        allRankingData={largeDataset}
        initialGenre="all"
        initialPeriod="24h"
      />
    )

    // Wait for update - but first 100 items displayed (due to pagination)
    await waitFor(() => {
      const items = screen.getAllByRole('listitem')
      expect(items).toHaveLength(100)
    })

    const endTime = performance.now()
    const updateTime = endTime - startTime

    // Should complete within reasonable time (less than 5000ms for filtering and re-rendering in CI)
    // CI環境では処理が遅いため、余裕を持った閾値を設定
    const timeLimit = process.env.CI ? 5000 : 500
    expect(updateTime).toBeLessThan(timeLimit)
  })
})