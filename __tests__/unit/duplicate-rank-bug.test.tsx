import { describe, it, expect } from 'vitest'
import { render } from '@testing-library/react'
import ClientPage from '@/app/client-page'
import type { RankingItem } from '@/types/ranking'

// Mock Next.js navigation
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
}))

// Mock hooks
vi.mock('@/hooks/use-realtime-stats', () => ({
  useRealtimeStats: (items: RankingItem[]) => ({ 
    items, 
    isLoading: false, 
    lastUpdated: null 
  }),
}))

vi.mock('@/hooks/use-user-preferences', () => ({
  useUserPreferences: () => ({ updatePreferences: vi.fn() }),
}))

vi.mock('@/hooks/use-user-ng-list', () => ({
  useUserNGList: () => ({ 
    filterItems: (items: RankingItem[]) => items // No NG filtering 
  }),
}))

vi.mock('@/hooks/use-mobile-detect', () => ({
  useMobileDetect: () => false,
}))

describe('Duplicate Rank Bug', () => {
  it('should not create duplicate ranks when loading more items', () => {
    // Initial data: ranks 1-100 with some gaps (simulating NG filtering on server)
    const initialData: RankingItem[] = []
    for (let i = 1; i <= 100; i++) {
      // Skip some ranks to simulate NG filtering
      if (i === 45 || i === 67 || i === 89) continue
      
      initialData.push({
        rank: i,
        id: `sm${i}`,
        title: `Video ${i}`,
        thumbURL: 'https://example.com/thumb.jpg',
        views: 1000 - i,
      })
    }
    
    // Render component
    const { container } = render(
      <ClientPage initialData={initialData} />
    )
    
    // Check that ranks are re-numbered correctly (1, 2, 3... without gaps)
    const rankingItems = container.querySelectorAll('[data-testid="ranking-item"]')
    
    // Extract ranks from the rendered items
    const ranks: number[] = []
    rankingItems.forEach(item => {
      // Find the rank number in the item's text content
      const rankMatch = item.textContent?.match(/^\d+/)
      if (rankMatch) {
        ranks.push(parseInt(rankMatch[0]))
      }
    })
    
    // Should have sequential ranks starting from 1
    expect(ranks).toHaveLength(97) // 100 - 3 skipped
    for (let i = 0; i < ranks.length; i++) {
      expect(ranks[i]).toBe(i + 1)
    }
    
    // Verify no duplicates
    const uniqueRanks = new Set(ranks)
    expect(uniqueRanks.size).toBe(ranks.length)
  })
  
  it('should handle mixed rank numbers from different pages correctly', () => {
    // Simulate data from multiple pages being combined
    const mixedData: RankingItem[] = [
      // Page 1 data (already re-ranked by server)
      ...Array.from({ length: 89 }, (_, i) => ({
        rank: i + 1,
        id: `sm${i + 1}`,
        title: `Page 1 Video ${i + 1}`,
        thumbURL: 'https://example.com/thumb.jpg',
        views: 10000 - i,
      })),
      // Page 2 data (comes with original ranks 101-200)
      ...Array.from({ length: 11 }, (_, i) => ({
        rank: 101 + i, // Original ranks from Nico Nico
        id: `sm${101 + i}`,
        title: `Page 2 Video ${101 + i}`,
        thumbURL: 'https://example.com/thumb.jpg',
        views: 5000 - i,
      })),
    ]
    
    const { container } = render(
      <ClientPage initialData={mixedData} />
    )
    
    const rankingItems = container.querySelectorAll('[data-testid="ranking-item"]')
    
    // Extract ranks from the rendered items
    const ranks: number[] = []
    rankingItems.forEach(item => {
      // Find the rank number in the item's text content
      const rankMatch = item.textContent?.match(/^\d+/)
      if (rankMatch) {
        ranks.push(parseInt(rankMatch[0]))
      }
    })
    
    // Should renumber all items sequentially
    expect(ranks).toHaveLength(100)
    for (let i = 0; i < ranks.length; i++) {
      expect(ranks[i]).toBe(i + 1)
    }
    
    // Specifically check around rank 89
    expect(ranks[88]).toBe(89) // 89th item should have rank 89
    expect(ranks[89]).toBe(90) // 90th item should have rank 90, not another 89
  })
})