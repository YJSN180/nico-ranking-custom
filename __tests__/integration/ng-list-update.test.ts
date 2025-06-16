import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { filterWithNGList } from '@/lib/filter-with-ng-list'
import type { RankingItem } from '@/types/ranking'
import type { NGList } from '@/types/ng-list'

// Mock KV operations
const mockKVGet = vi.fn()
const mockKVSet = vi.fn()

// Mock the simple-kv module
vi.mock('@/lib/simple-kv', () => ({
  kv: {
    get: mockKVGet,
    set: mockKVSet
  }
}))

describe('NG List Update Integration', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  const createMockItem = (overrides: Partial<RankingItem>): RankingItem => ({
    rank: 1,
    id: 'sm12345',
    title: 'Test Video',
    thumbURL: 'https://example.com/thumb.jpg',
    views: 1000,
    comments: 100,
    mylists: 50,
    likes: 30,
    authorId: 'user123',
    authorName: 'Test Author',
    ...overrides
  })

  it('should update derived NG list when new items match NG criteria', async () => {
    // Arrange
    const ngList: NGList = {
      videoIds: [],
      videoTitles: {
        exact: ['Blocked Title'],
        partial: []
      },
      authorIds: [],
      authorNames: {
        exact: [],
        partial: []
      }
    }

    const items = [
      createMockItem({ id: 'sm1', title: 'Blocked Title' }),
      createMockItem({ id: 'sm2', title: 'Normal Title' }),
      createMockItem({ id: 'sm3', title: 'Blocked Title' })
    ]

    // Act
    const result = filterWithNGList(items, ngList)

    // Assert
    expect(result.filteredItems).toHaveLength(1)
    expect(result.filteredItems[0].id).toBe('sm2')
    expect(result.newDerivedIds).toEqual(['sm1', 'sm3'])
  })

  it('should handle complex filtering scenario', async () => {
    // Arrange
    const ngList: NGList = {
      videoIds: ['sm999'],
      videoTitles: {
        exact: ['Exact Blocked Title'],
        partial: ['spam']
      },
      authorIds: ['blocked123'],
      authorNames: {
        exact: ['Blocked Author'],
        partial: ['Spammer']
      }
    }

    const items = [
      createMockItem({ id: 'sm1', title: 'Normal Video', authorId: 'user1' }),
      createMockItem({ id: 'sm2', title: 'This contains spam', authorId: 'user2' }),
      createMockItem({ id: 'sm3', title: 'Exact Blocked Title', authorId: 'user3' }),
      createMockItem({ id: 'sm4', title: 'Video 4', authorId: 'blocked123' }),
      createMockItem({ id: 'sm5', title: 'Video 5', authorName: 'Blocked Author' }),
      createMockItem({ id: 'sm6', title: 'Video 6', authorName: 'Spammer User' }),
      createMockItem({ id: 'sm999', title: 'Already Blocked' })
    ]

    // Act
    const result = filterWithNGList(items, ngList)

    // Assert
    expect(result.filteredItems).toHaveLength(1)
    expect(result.filteredItems[0].id).toBe('sm1')
    expect(result.newDerivedIds.sort()).toEqual(['sm2', 'sm3', 'sm4', 'sm5', 'sm6'])
  })

  it('should simulate GitHub Actions script behavior', async () => {
    // Mock existing derived list
    mockKVGet.mockImplementation((key: string) => {
      if (key === 'ng-list-manual') {
        return Promise.resolve({
          videoIds: [],
          videoTitles: {
            exact: ['Advertisement'],
            partial: ['promo']
          },
          authorIds: [],
          authorNames: {
            exact: [],
            partial: []
          }
        })
      }
      if (key === 'ng-list-derived') {
        return Promise.resolve(['sm100', 'sm200'])
      }
      return Promise.resolve(null)
    })

    // Simulate fetching ranking with NG items
    const fetchedItems = [
      createMockItem({ id: 'sm1', title: 'Great Video' }),
      createMockItem({ id: 'sm2', title: 'Advertisement' }), // Will be filtered
      createMockItem({ id: 'sm3', title: 'Check out this promo' }), // Will be filtered
      createMockItem({ id: 'sm4', title: 'Tutorial Video' }),
      createMockItem({ id: 'sm100', title: 'Already Blocked' }) // Already in derived
    ]

    // Get NG list (simulating the script)
    const [manual, derived] = await Promise.all([
      mockKVGet('ng-list-manual'),
      mockKVGet('ng-list-derived')
    ])

    const ngList: NGList = {
      videoIds: [...(derived || [])],
      videoTitles: manual?.videoTitles || { exact: [], partial: [] },
      authorIds: manual?.authorIds || [],
      authorNames: manual?.authorNames || { exact: [], partial: [] }
    }

    // Filter items
    const { filteredItems, newDerivedIds } = filterWithNGList(fetchedItems, ngList)

    // Assert filtering results
    expect(filteredItems).toHaveLength(2)
    expect(filteredItems.map(item => item.id)).toEqual(['sm1', 'sm4'])
    expect(newDerivedIds).toEqual(['sm2', 'sm3'])

    // Simulate updating derived list
    if (newDerivedIds.length > 0) {
      const existingDerived = derived || []
      const updatedDerived = Array.from(new Set([...existingDerived, ...newDerivedIds]))
      
      // This would be the actual KV update
      mockKVSet.mockResolvedValue(undefined)
      await mockKVSet('ng-list-derived', updatedDerived)

      // Verify the update
      expect(mockKVSet).toHaveBeenCalledWith('ng-list-derived', ['sm100', 'sm200', 'sm2', 'sm3'])
    }
  })
})