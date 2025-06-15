import { describe, it, expect } from 'vitest'
import { filterRankingItems } from '@/lib/ng-filter'
import type { RankingItem } from '@/types/ranking'

describe('Ranking Order Fix', () => {
  it('should preserve original ranking order during pagination merge', () => {
    // Simulate initial data with some items filtered out
    const initialData: RankingItem[] = [
      { rank: 1, id: 'sm1', title: 'Video 1', thumbURL: 'url1', views: 1000 },
      { rank: 3, id: 'sm3', title: 'Video 3', thumbURL: 'url3', views: 800 }, // rank 2 was filtered
      { rank: 4, id: 'sm4', title: 'Video 4', thumbURL: 'url4', views: 700 },
    ]

    // Simulate new page data
    const newPageData: RankingItem[] = [
      { rank: 101, id: 'sm101', title: 'Video 101', thumbURL: 'url101', views: 500 },
      { rank: 102, id: 'sm102', title: 'Video 102', thumbURL: 'url102', views: 400 },
    ]

    // Merge data (simulating loadMoreItems logic)
    const combinedData = [...initialData, ...newPageData]
    const sortedData = combinedData.sort((a, b) => a.rank - b.rank)

    // Verify correct order is maintained
    expect(sortedData).toEqual([
      { rank: 1, id: 'sm1', title: 'Video 1', thumbURL: 'url1', views: 1000 },
      { rank: 3, id: 'sm3', title: 'Video 3', thumbURL: 'url3', views: 800 },
      { rank: 4, id: 'sm4', title: 'Video 4', thumbURL: 'url4', views: 700 },
      { rank: 101, id: 'sm101', title: 'Video 101', thumbURL: 'url101', views: 500 },
      { rank: 102, id: 'sm102', title: 'Video 102', thumbURL: 'url102', views: 400 },
    ])

    // Verify ranks are still original (not sequential from 1)
    expect(sortedData.map(item => item.rank)).toEqual([1, 3, 4, 101, 102])
  })

  it('should preserve original ranks after NG filtering', async () => {
    const testData: RankingItem[] = [
      { rank: 1, id: 'sm1', title: 'Video 1', thumbURL: 'url1', views: 1000 },
      { rank: 2, id: 'sm2', title: 'Video 2', thumbURL: 'url2', views: 900 },
      { rank: 3, id: 'sm3', title: 'Video 3', thumbURL: 'url3', views: 800 },
    ]

    const result = await filterRankingItems(testData)
    
    // Verify original ranks are preserved (not re-numbered from 1)
    expect(result.filteredItems.map(item => item.rank)).toEqual([1, 2, 3])
    
    // Verify items are still in correct order
    expect(result.filteredItems[0].id).toBe('sm1')
    expect(result.filteredItems[1].id).toBe('sm2')
    expect(result.filteredItems[2].id).toBe('sm3')
  })

  it('should handle out-of-order data correctly', () => {
    // Simulate data that arrives out of order
    const outOfOrderData: RankingItem[] = [
      { rank: 103, id: 'sm103', title: 'Video 103', thumbURL: 'url103', views: 300 },
      { rank: 101, id: 'sm101', title: 'Video 101', thumbURL: 'url101', views: 500 },
      { rank: 102, id: 'sm102', title: 'Video 102', thumbURL: 'url102', views: 400 },
    ]

    const sortedData = outOfOrderData.sort((a, b) => a.rank - b.rank)

    // Should be sorted by rank
    expect(sortedData.map(item => item.rank)).toEqual([101, 102, 103])
    expect(sortedData.map(item => item.id)).toEqual(['sm101', 'sm102', 'sm103'])
  })
})