import { describe, it, expect } from 'vitest'

// Mock data structures to match the cron script
interface NGList {
  videoIds: string[]
  videoTitles: {
    exact: string[]
    partial: string[]
  }
  authorIds: string[]
  authorNames: {
    exact: string[]
    partial: string[]
  }
  derivedVideoIds: string[]
}

interface RankingItem {
  rank: number
  id: string
  title: string
  thumbURL: string
  views: number
  comments?: number
  mylists?: number
  likes?: number
  tags?: string[]
  authorId?: string
  authorName?: string
  authorIcon?: string
  registeredAt?: string
}

// Replicate the filterWithNGList function from the cron script
function filterWithNGList(items: RankingItem[], ngList: NGList): { filteredItems: RankingItem[], newDerivedIds: string[] } {
  const newDerivedIds: string[] = []
  
  // High-speed lookups
  const videoIdSet = new Set(ngList.videoIds)
  const derivedVideoIdSet = new Set(ngList.derivedVideoIds)
  const videoTitleExactSet = new Set(ngList.videoTitles.exact)
  const authorIdSet = new Set(ngList.authorIds)
  const authorNameExactSet = new Set(ngList.authorNames.exact)
  
  const filteredItems = items.filter(item => {
    // Already in manual NG list
    if (videoIdSet.has(item.id)) return false
    
    // Already in derived NG list
    if (derivedVideoIdSet.has(item.id)) return false
    
    // Title checks
    if (videoTitleExactSet.has(item.title)) {
      newDerivedIds.push(item.id)
      return false
    }
    
    if (ngList.videoTitles.partial.some(partial => item.title.includes(partial))) {
      newDerivedIds.push(item.id)
      return false
    }
    
    // Author ID check
    if (item.authorId && authorIdSet.has(item.authorId)) {
      newDerivedIds.push(item.id)
      return false
    }
    
    // Author name checks
    if (item.authorName && authorNameExactSet.has(item.authorName)) {
      newDerivedIds.push(item.id)
      return false
    }
    
    if (item.authorName && ngList.authorNames.partial.some(partial => item.authorName!.includes(partial))) {
      newDerivedIds.push(item.id)
      return false
    }
    
    return true
  })
  
  return { filteredItems, newDerivedIds }
}

describe('NG Filtering in Cron Job', () => {
  const mockRankingItems: RankingItem[] = [
    {
      rank: 1,
      id: 'sm1001',
      title: 'Normal Video 1',
      thumbURL: 'https://example.com/thumb1.jpg',
      views: 1000,
      authorId: 'user123',
      authorName: 'NormalUser'
    },
    {
      rank: 2,
      id: 'sm1002',
      title: 'Blocked Title Exact',
      thumbURL: 'https://example.com/thumb2.jpg',
      views: 2000,
      authorId: 'user456',
      authorName: 'AnotherUser'
    },
    {
      rank: 3,
      id: 'sm1003',
      title: 'Video with BadWord in title',
      thumbURL: 'https://example.com/thumb3.jpg',
      views: 3000,
      authorId: 'user789',
      authorName: 'ThirdUser'
    },
    {
      rank: 4,
      id: 'sm1004',
      title: 'Video by blocked author',
      thumbURL: 'https://example.com/thumb4.jpg',
      views: 4000,
      authorId: 'blockeduser',
      authorName: 'BlockedAuthor'
    },
    {
      rank: 5,
      id: 'sm1005',
      title: 'Video by SpamAuthor name',
      thumbURL: 'https://example.com/thumb5.jpg',
      views: 5000,
      authorId: 'user999',
      authorName: 'SpamAuthor123'
    }
  ]

  it('should identify new derived IDs based on NG criteria', () => {
    const ngList: NGList = {
      videoIds: [],
      videoTitles: {
        exact: ['Blocked Title Exact'],
        partial: ['BadWord']
      },
      authorIds: ['blockeduser'],
      authorNames: {
        exact: [],
        partial: ['SpamAuthor']
      },
      derivedVideoIds: []
    }

    const result = filterWithNGList(mockRankingItems, ngList)

    // Should filter out 4 videos and add their IDs to newDerivedIds
    expect(result.filteredItems).toHaveLength(1)
    expect(result.filteredItems[0].id).toBe('sm1001')
    
    // Should identify 4 new derived IDs
    expect(result.newDerivedIds).toHaveLength(4)
    expect(result.newDerivedIds).toContain('sm1002') // exact title match
    expect(result.newDerivedIds).toContain('sm1003') // partial title match
    expect(result.newDerivedIds).toContain('sm1004') // author ID match
    expect(result.newDerivedIds).toContain('sm1005') // partial author name match
  })

  it('should not re-add already derived IDs', () => {
    const ngList: NGList = {
      videoIds: [],
      videoTitles: {
        exact: ['Blocked Title Exact'],
        partial: []
      },
      authorIds: [],
      authorNames: {
        exact: [],
        partial: []
      },
      derivedVideoIds: ['sm1002'] // Already in derived list
    }

    const result = filterWithNGList(mockRankingItems, ngList)

    // Should filter out the already-derived video but not add to newDerivedIds
    expect(result.filteredItems).toHaveLength(4)
    expect(result.newDerivedIds).toHaveLength(0)
    expect(result.filteredItems.find(item => item.id === 'sm1002')).toBeUndefined()
  })

  it('should handle empty NG list', () => {
    const ngList: NGList = {
      videoIds: [],
      videoTitles: { exact: [], partial: [] },
      authorIds: [],
      authorNames: { exact: [], partial: [] },
      derivedVideoIds: []
    }

    const result = filterWithNGList(mockRankingItems, ngList)

    // Should not filter anything
    expect(result.filteredItems).toHaveLength(5)
    expect(result.newDerivedIds).toHaveLength(0)
  })

  it('should handle manual video ID blocking', () => {
    const ngList: NGList = {
      videoIds: ['sm1001', 'sm1003'],
      videoTitles: { exact: [], partial: [] },
      authorIds: [],
      authorNames: { exact: [], partial: [] },
      derivedVideoIds: []
    }

    const result = filterWithNGList(mockRankingItems, ngList)

    // Should filter out manually blocked videos but not add to derived
    expect(result.filteredItems).toHaveLength(3)
    expect(result.newDerivedIds).toHaveLength(0)
    expect(result.filteredItems.find(item => item.id === 'sm1001')).toBeUndefined()
    expect(result.filteredItems.find(item => item.id === 'sm1003')).toBeUndefined()
  })
})