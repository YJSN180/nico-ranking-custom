import { describe, it, expect, vi } from 'vitest'
import { filterRankingData } from '@/lib/ng-filter'

// This is a simpler test to verify NG filtering is working
describe('NG Filter Simple Test', () => {
  it('should filter ranking data based on NG list', async () => {
    // Mock localStorage
    const mockNGList = {
      videoIds: ['sm456'],
      authorIds: ['author2'],
      videoTitles: [],
      authorNames: [],
      derivedVideoIds: ['sm789']
    }
    
    global.localStorage = {
      getItem: vi.fn().mockReturnValue(JSON.stringify(mockNGList)),
      setItem: vi.fn(),
      removeItem: vi.fn(),
      clear: vi.fn(),
      length: 0,
      key: vi.fn()
    } as any

    const items = [
      { rank: 1, id: 'sm123', title: 'Good Video', thumbURL: '', views: 1000 },
      { rank: 2, id: 'sm456', title: 'NG Video', thumbURL: '', views: 2000 }, // Will be filtered by videoIds
      { rank: 3, id: 'sm789', title: 'Derived NG', thumbURL: '', views: 3000 }, // Will be filtered by derivedVideoIds
      { rank: 4, id: 'sm999', title: 'Author NG', thumbURL: '', views: 4000, authorId: 'author2' } // Will be filtered by authorIds
    ]

    const result = await filterRankingData({ items })

    expect(result.items).toHaveLength(1)
    expect(result.items[0].id).toBe('sm123')
  })

  it('should not filter when NG list is empty', async () => {
    global.localStorage = {
      getItem: vi.fn().mockReturnValue(null),
      setItem: vi.fn(),
      removeItem: vi.fn(),
      clear: vi.fn(),
      length: 0,
      key: vi.fn()
    } as any

    const items = [
      { rank: 1, id: 'sm123', title: 'Video 1', thumbURL: '', views: 1000 },
      { rank: 2, id: 'sm456', title: 'Video 2', thumbURL: '', views: 2000 }
    ]

    const result = await filterRankingData({ items })

    expect(result.items).toHaveLength(2)
  })
})