import { describe, it, expect, beforeEach, vi } from 'vitest'
import type { RankingItem } from '@/types/ranking'
import type { NGList } from '@/types/ng-list'
import { filterWithNGList } from '@/lib/filter-with-ng-list'
import { migrateLegacyNGList, isLegacyFormat } from '@/lib/ng-list-migration'
import { getDerivativeNGListFromKV } from '@/lib/ng-list-derivative'

// Mock KV functions
vi.mock('@/lib/cloudflare-kv', () => ({
  getRankingFromKV: vi.fn()
}))

describe('Derivative NG List Integration', () => {
  const mockRankingItems: RankingItem[] = [
    {
      rank: 1,
      id: 'sm12345',
      title: 'Test Video 1',
      thumbURL: 'https://example.com/thumb1.jpg',
      views: 1000,
      authorId: 'user123',
      authorName: 'TestUser1'
    },
    {
      rank: 2,
      id: 'sm67890',
      title: 'Blocked Video Title',
      thumbURL: 'https://example.com/thumb2.jpg',
      views: 2000,
      authorId: 'user456',
      authorName: 'TestUser2'
    },
    {
      rank: 3,
      id: 'sm11111',
      title: 'Another Video',
      thumbURL: 'https://example.com/thumb3.jpg',
      views: 3000,
      authorId: 'blockedUser',
      authorName: 'BlockedAuthor'
    }
  ]

  const mockNGList: NGList = {
    videoIds: [],
    videoTitles: {
      exact: ['Blocked Video Title'],
      partial: []
    },
    authorIds: ['blockedUser'],
    authorNames: {
      exact: [],
      partial: []
    },
    derivedVideoIds: []
  }

  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('should identify new derived IDs when filtering with NG list', () => {
    const result = filterWithNGList(mockRankingItems, mockNGList)

    expect(result.filteredItems).toHaveLength(1)
    expect(result.filteredItems[0].id).toBe('sm12345')
    expect(result.newDerivedIds).toHaveLength(2)
    expect(result.newDerivedIds).toContain('sm67890') // Blocked by title
    expect(result.newDerivedIds).toContain('sm11111') // Blocked by author ID
  })

  it('should not identify items already in derived list', () => {
    const ngListWithDerived: NGList = {
      ...mockNGList,
      derivedVideoIds: ['sm67890'] // Already blocked
    }

    const result = filterWithNGList(mockRankingItems, ngListWithDerived)

    expect(result.filteredItems).toHaveLength(1)
    expect(result.newDerivedIds).toHaveLength(1)
    expect(result.newDerivedIds).toContain('sm11111') // Only new one
    expect(result.newDerivedIds).not.toContain('sm67890') // Already derived
  })

  it('should handle partial matches for titles and authors', () => {
    const ngListWithPartials: NGList = {
      videoIds: [],
      videoTitles: {
        exact: [],
        partial: ['Blocked']
      },
      authorIds: [],
      authorNames: {
        exact: [],
        partial: ['Blocked']
      },
      derivedVideoIds: []
    }

    const result = filterWithNGList(mockRankingItems, ngListWithPartials)

    expect(result.newDerivedIds).toHaveLength(2)
    expect(result.newDerivedIds).toContain('sm67890') // Matches title partial
    expect(result.newDerivedIds).toContain('sm11111') // Matches author partial
  })

  it('should migrate legacy NG list format correctly', () => {
    const legacyData = {
      videoIds: ['sm123'],
      videoTitles: ['Old Title'],
      authorIds: ['oldUser'],
      authorNames: ['Old Author'],
      derivedVideoIds: ['sm456']
    }

    expect(isLegacyFormat(legacyData)).toBe(true)

    const migrated = migrateLegacyNGList(legacyData)

    expect(migrated.videoIds).toEqual(['sm123'])
    expect(migrated.videoTitles.exact).toEqual(['Old Title'])
    expect(migrated.videoTitles.partial).toEqual([])
    expect(migrated.authorIds).toEqual(['oldUser'])
    expect(migrated.authorNames.exact).toEqual(['Old Author'])
    expect(migrated.authorNames.partial).toEqual([])
    expect(migrated.derivedVideoIds).toEqual(['sm456'])
  })

  it('should handle new format without migration', () => {
    const newFormatData: NGList = {
      videoIds: ['sm123'],
      videoTitles: {
        exact: ['New Title'],
        partial: ['Partial']
      },
      authorIds: ['newUser'],
      authorNames: {
        exact: ['New Author'],
        partial: ['Partial Author']
      },
      derivedVideoIds: ['sm456']
    }

    expect(isLegacyFormat(newFormatData)).toBe(false)

    const result = migrateLegacyNGList(newFormatData)
    expect(result).toEqual(newFormatData)
  })

  it('should return empty lists for null/undefined data', () => {
    const result1 = migrateLegacyNGList(null)
    const result2 = migrateLegacyNGList(undefined)

    expect(result1.videoIds).toEqual([])
    expect(result1.videoTitles.exact).toEqual([])
    expect(result1.derivedVideoIds).toEqual([])

    expect(result2.videoIds).toEqual([])
    expect(result2.videoTitles.exact).toEqual([])
    expect(result2.derivedVideoIds).toEqual([])
  })

  it('should handle cron script workflow simulation', async () => {
    // Simulate the cron script workflow
    const originalNGList = { ...mockNGList }
    const originalDerivedCount = originalNGList.derivedVideoIds.length

    // Step 1: Filter items and get new derived IDs
    const { filteredItems, newDerivedIds } = filterWithNGList(mockRankingItems, originalNGList)

    // Step 2: Add new derived IDs to NG list (simulating cron script behavior)
    originalNGList.derivedVideoIds.push(...newDerivedIds)

    // Step 3: Verify the results
    expect(filteredItems).toHaveLength(1)
    expect(newDerivedIds).toHaveLength(2)
    expect(originalNGList.derivedVideoIds.length).toBe(originalDerivedCount + 2)

    // Step 4: Simulate derivative NG data structure
    const derivativeNGData = {
      blockedVideoIds: [...originalNGList.derivedVideoIds],
      blockedAuthorIds: [],
      statsSnapshot: {
        totalVideosProcessed: mockRankingItems.length,
        totalBlocked: originalNGList.derivedVideoIds.length,
        lastUpdated: new Date().toISOString()
      }
    }

    expect(derivativeNGData.blockedVideoIds).toContain('sm67890')
    expect(derivativeNGData.blockedVideoIds).toContain('sm11111')
    expect(derivativeNGData.statsSnapshot.totalBlocked).toBe(2)
  })
})

describe('Derivative NG List API Integration', () => {
  it('should retrieve derivative NG list from KV ranking data', async () => {
    const { getRankingFromKV } = await import('@/lib/cloudflare-kv')
    const mockGetRankingFromKV = getRankingFromKV as any

    // Mock ranking data with derivative NG data
    mockGetRankingFromKV.mockResolvedValue({
      genres: {},
      metadata: {},
      derivativeNGData: {
        blockedVideoIds: ['sm12345', 'sm67890'],
        blockedAuthorIds: [],
        statsSnapshot: {
          totalVideosProcessed: 1000,
          totalBlocked: 2,
          lastUpdated: '2025-06-19T10:00:00.000Z'
        }
      }
    })

    const result = await getDerivativeNGListFromKV()

    expect(result).not.toBeNull()
    expect(result?.blockedVideoIds).toHaveLength(2)
    expect(result?.statsSnapshot.totalBlocked).toBe(2)
  })

  it('should return null when no derivative data exists', async () => {
    const { getRankingFromKV } = await import('@/lib/cloudflare-kv')
    const mockGetRankingFromKV = getRankingFromKV as any

    mockGetRankingFromKV.mockResolvedValue({
      genres: {},
      metadata: {}
      // No derivativeNGData
    })

    const result = await getDerivativeNGListFromKV()
    expect(result).toBeNull()
  })

  it('should handle KV errors gracefully', async () => {
    const { getRankingFromKV } = await import('@/lib/cloudflare-kv')
    const mockGetRankingFromKV = getRankingFromKV as any

    mockGetRankingFromKV.mockRejectedValue(new Error('KV error'))

    const result = await getDerivativeNGListFromKV()
    expect(result).toBeNull()
  })
})