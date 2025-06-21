import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor, act } from '@testing-library/react'
import ClientPage from '@/app/client-page'
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

describe('NG List Immediate Update', () => {
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
    localStorage.clear()
  })

  it('should update display immediately when ngListUpdated event is fired', async () => {
    const initialData = [
      createRankingItem('sm1', 1),
      createRankingItem('sm2', 2),
      createRankingItem('sm3', 3),
      createRankingItem('sm4', 4),
      createRankingItem('sm5', 5)
    ]

    render(
      <ClientPage 
        initialData={initialData}
        initialGenre="all"
        initialPeriod="24h"
      />
    )

    // Initially all 5 items should be displayed
    await waitFor(() => {
      expect(screen.getByText('5件表示')).toBeInTheDocument()
    })

    // Simulate NG list update by dispatching the event
    act(() => {
      // Update localStorage with new NG list
      const newNGList = {
        videoIds: ['sm2', 'sm4'],
        videoTitles: { exact: [], partial: [] },
        authorIds: [],
        authorNames: { exact: [], partial: [] },
        version: 1,
        totalCount: 2,
        updatedAt: new Date().toISOString()
      }
      localStorage.setItem('user-ng-list', JSON.stringify(newNGList))
      
      // Dispatch the event
      window.dispatchEvent(new CustomEvent('ngListUpdated', { 
        detail: { ngList: newNGList } 
      }))
    })

    // Should immediately update to show only 3 items
    await waitFor(() => {
      expect(screen.getByText('3件表示')).toBeInTheDocument()
    }, { timeout: 1000 })

    // Verify the filtered items are displayed
    const items = screen.getAllByRole('listitem')
    expect(items).toHaveLength(3)
    expect(items[0]).toHaveTextContent('Video sm1')
    expect(items[1]).toHaveTextContent('Video sm3')
    expect(items[2]).toHaveTextContent('Video sm5')
  })

  it('should update without needing to switch tags or wait', async () => {
    const initialData = [
      createRankingItem('sm1', 1),
      createRankingItem('sm2', 2),
      createRankingItem('sm3', 3)
    ]

    render(
      <ClientPage 
        initialData={initialData}
        initialGenre="all"
        initialPeriod="24h"
      />
    )

    // Initially 3 items
    await waitFor(() => {
      expect(screen.getByText('3件表示')).toBeInTheDocument()
    })

    // Add one item to NG list
    act(() => {
      const ngList1 = {
        videoIds: ['sm1'],
        videoTitles: { exact: [], partial: [] },
        authorIds: [],
        authorNames: { exact: [], partial: [] },
        version: 1,
        totalCount: 1,
        updatedAt: new Date().toISOString()
      }
      localStorage.setItem('user-ng-list', JSON.stringify(ngList1))
      window.dispatchEvent(new CustomEvent('ngListUpdated', { detail: { ngList: ngList1 } }))
    })

    // Should immediately show 2 items
    await waitFor(() => {
      expect(screen.getByText('2件表示')).toBeInTheDocument()
    }, { timeout: 500 })

    // Add another item to NG list
    act(() => {
      const ngList2 = {
        videoIds: ['sm1', 'sm3'],
        videoTitles: { exact: [], partial: [] },
        authorIds: [],
        authorNames: { exact: [], partial: [] },
        version: 1,
        totalCount: 2,
        updatedAt: new Date().toISOString()
      }
      localStorage.setItem('user-ng-list', JSON.stringify(ngList2))
      window.dispatchEvent(new CustomEvent('ngListUpdated', { detail: { ngList: ngList2 } }))
    })

    // Should immediately show 1 item
    await waitFor(() => {
      expect(screen.getByText('1件表示')).toBeInTheDocument()
    }, { timeout: 500 })

    // Verify only sm2 is displayed
    const items = screen.getAllByRole('listitem')
    expect(items).toHaveLength(1)
    expect(items[0]).toHaveTextContent('Video sm2')
  })
})