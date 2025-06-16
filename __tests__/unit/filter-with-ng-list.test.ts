import { describe, it, expect } from 'vitest'
import type { RankingItem } from '@/types/ranking'
import type { NGList } from '@/types/ng-list'
import { filterWithNGList } from '@/lib/filter-with-ng-list'

describe('filterWithNGList', () => {
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

  const createEmptyNGList = (): NGList => ({
    videoIds: [],
    videoTitles: {
      exact: [],
      partial: []
    },
    authorIds: [],
    authorNames: {
      exact: [],
      partial: []
    }
  })

  it('should return all items when NG list is empty', () => {
    const items = [
      createMockItem({ id: 'sm1', title: 'Video 1' }),
      createMockItem({ id: 'sm2', title: 'Video 2' })
    ]
    const ngList = createEmptyNGList()

    const result = filterWithNGList(items, ngList)

    expect(result.filteredItems).toHaveLength(2)
    expect(result.newDerivedIds).toHaveLength(0)
  })

  it('should filter out videos by ID', () => {
    const items = [
      createMockItem({ id: 'sm1', title: 'Video 1' }),
      createMockItem({ id: 'sm2', title: 'Video 2' }),
      createMockItem({ id: 'sm3', title: 'Video 3' })
    ]
    const ngList = createEmptyNGList()
    ngList.videoIds = ['sm2']

    const result = filterWithNGList(items, ngList)

    expect(result.filteredItems).toHaveLength(2)
    expect(result.filteredItems.map(item => item.id)).toEqual(['sm1', 'sm3'])
    expect(result.newDerivedIds).toHaveLength(0)
  })

  it('should filter out videos by exact title match and add to derived IDs', () => {
    const items = [
      createMockItem({ id: 'sm1', title: 'Blocked Title' }),
      createMockItem({ id: 'sm2', title: 'Normal Title' }),
      createMockItem({ id: 'sm3', title: 'Blocked Title' })
    ]
    const ngList = createEmptyNGList()
    ngList.videoTitles.exact = ['Blocked Title']

    const result = filterWithNGList(items, ngList)

    expect(result.filteredItems).toHaveLength(1)
    expect(result.filteredItems[0].id).toBe('sm2')
    expect(result.newDerivedIds).toEqual(['sm1', 'sm3'])
  })

  it('should filter out videos by partial title match and add to derived IDs', () => {
    const items = [
      createMockItem({ id: 'sm1', title: 'This contains spam content' }),
      createMockItem({ id: 'sm2', title: 'Normal video' }),
      createMockItem({ id: 'sm3', title: 'Another spam video' })
    ]
    const ngList = createEmptyNGList()
    ngList.videoTitles.partial = ['spam']

    const result = filterWithNGList(items, ngList)

    expect(result.filteredItems).toHaveLength(1)
    expect(result.filteredItems[0].id).toBe('sm2')
    expect(result.newDerivedIds).toEqual(['sm1', 'sm3'])
  })

  it('should filter out videos by author ID and add to derived IDs', () => {
    const items = [
      createMockItem({ id: 'sm1', authorId: 'blocked123' }),
      createMockItem({ id: 'sm2', authorId: 'normal456' }),
      createMockItem({ id: 'sm3', authorId: 'blocked123' })
    ]
    const ngList = createEmptyNGList()
    ngList.authorIds = ['blocked123']

    const result = filterWithNGList(items, ngList)

    expect(result.filteredItems).toHaveLength(1)
    expect(result.filteredItems[0].id).toBe('sm2')
    expect(result.newDerivedIds).toEqual(['sm1', 'sm3'])
  })

  it('should filter out videos by exact author name match and add to derived IDs', () => {
    const items = [
      createMockItem({ id: 'sm1', authorName: 'Blocked Author' }),
      createMockItem({ id: 'sm2', authorName: 'Normal Author' }),
      createMockItem({ id: 'sm3', authorName: 'Blocked Author' })
    ]
    const ngList = createEmptyNGList()
    ngList.authorNames.exact = ['Blocked Author']

    const result = filterWithNGList(items, ngList)

    expect(result.filteredItems).toHaveLength(1)
    expect(result.filteredItems[0].id).toBe('sm2')
    expect(result.newDerivedIds).toEqual(['sm1', 'sm3'])
  })

  it('should filter out videos by partial author name match and add to derived IDs', () => {
    const items = [
      createMockItem({ id: 'sm1', authorName: 'Spammer User 1' }),
      createMockItem({ id: 'sm2', authorName: 'Normal User' }),
      createMockItem({ id: 'sm3', authorName: 'Another Spammer' })
    ]
    const ngList = createEmptyNGList()
    ngList.authorNames.partial = ['Spammer']

    const result = filterWithNGList(items, ngList)

    expect(result.filteredItems).toHaveLength(1)
    expect(result.filteredItems[0].id).toBe('sm2')
    expect(result.newDerivedIds).toEqual(['sm1', 'sm3'])
  })

  it('should handle complex NG list with multiple criteria', () => {
    const items = [
      createMockItem({ id: 'sm1', title: 'Normal Video', authorId: 'user1' }),
      createMockItem({ id: 'sm2', title: 'Spam Video', authorId: 'user2' }),
      createMockItem({ id: 'sm3', title: 'Normal Video', authorId: 'blocked123' }),
      createMockItem({ id: 'sm4', title: 'Another Video', authorName: 'Blocked User' }),
      createMockItem({ id: 'sm5', title: 'Good Video', authorName: 'Good User' })
    ]
    const ngList = createEmptyNGList()
    ngList.videoIds = ['sm1']
    ngList.videoTitles.partial = ['Spam']
    ngList.authorIds = ['blocked123']
    ngList.authorNames.exact = ['Blocked User']

    const result = filterWithNGList(items, ngList)

    expect(result.filteredItems).toHaveLength(1)
    expect(result.filteredItems[0].id).toBe('sm5')
    expect(result.newDerivedIds.sort()).toEqual(['sm2', 'sm3', 'sm4'])
  })

  it('should not add already blocked video IDs to derived list', () => {
    const items = [
      createMockItem({ id: 'sm1', title: 'Blocked Title' }),
      createMockItem({ id: 'sm2', title: 'Normal Title' })
    ]
    const ngList = createEmptyNGList()
    ngList.videoIds = ['sm1'] // Already in the video ID list
    ngList.videoTitles.exact = ['Blocked Title']

    const result = filterWithNGList(items, ngList)

    expect(result.filteredItems).toHaveLength(1)
    expect(result.filteredItems[0].id).toBe('sm2')
    expect(result.newDerivedIds).toHaveLength(0) // sm1 should not be added again
  })

  it('should maintain original order for filtered items', () => {
    const items = [
      createMockItem({ id: 'sm1', rank: 1 }),
      createMockItem({ id: 'sm2', rank: 2 }),
      createMockItem({ id: 'sm3', rank: 3 }),
      createMockItem({ id: 'sm4', rank: 4 }),
      createMockItem({ id: 'sm5', rank: 5 })
    ]
    const ngList = createEmptyNGList()
    ngList.videoIds = ['sm2', 'sm4']

    const result = filterWithNGList(items, ngList)

    expect(result.filteredItems.map(item => item.id)).toEqual(['sm1', 'sm3', 'sm5'])
    expect(result.filteredItems.map(item => item.rank)).toEqual([1, 3, 5])
  })
})