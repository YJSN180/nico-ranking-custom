// Web Worker for heavy ranking data processing
// This offloads computationally expensive operations from the main thread

interface RankingItem {
  id: string
  rank: number
  title: string
  authorName?: string
  authorId?: string
  tags?: string[]
  [key: string]: any
}

interface NGList {
  titles?: string[]
  authors?: string[]
  tags?: string[]
  videoIds?: string[]
}

interface ProcessingMessage {
  type: 'FILTER_RANKINGS' | 'SORT_RANKINGS' | 'SEARCH_RANKINGS'
  data: {
    items: RankingItem[]
    ngList?: NGList
    searchQuery?: string
    sortBy?: 'rank' | 'views' | 'likes' | 'date'
  }
}

// Optimized filtering function
function filterByNGList(items: RankingItem[], ngList: NGList): RankingItem[] {
  if (!ngList || Object.keys(ngList).length === 0) {
    return items
  }

  // Create lowercase sets for case-insensitive comparison
  const ngTitles = new Set(ngList.titles?.map(t => t.toLowerCase()) || [])
  const ngAuthors = new Set(ngList.authors?.map(a => a.toLowerCase()) || [])
  const ngTags = new Set(ngList.tags?.map(t => t.toLowerCase()) || [])
  const ngVideoIds = new Set(ngList.videoIds || [])

  // Use filter with early returns for performance
  return items.filter(item => {
    // Video ID check (exact match)
    if (ngVideoIds.has(item.id)) return false

    // Title check (partial match)
    if (ngTitles.size > 0 && item.title) {
      const lowerTitle = item.title.toLowerCase()
      for (const ngTitle of ngTitles) {
        if (lowerTitle.includes(ngTitle)) return false
      }
    }

    // Author check (partial match)
    if (ngAuthors.size > 0 && item.authorName) {
      const lowerAuthor = item.authorName.toLowerCase()
      for (const ngAuthor of ngAuthors) {
        if (lowerAuthor.includes(ngAuthor)) return false
      }
    }

    // Tag check (exact match)
    if (ngTags.size > 0 && item.tags && item.tags.length > 0) {
      for (const tag of item.tags) {
        if (ngTags.has(tag.toLowerCase())) return false
      }
    }

    return true
  })
}

// Search function
function searchRankings(items: RankingItem[], query: string): RankingItem[] {
  const lowerQuery = query.toLowerCase()
  
  return items.filter(item => {
    // Search in title
    if (item.title && item.title.toLowerCase().includes(lowerQuery)) {
      return true
    }
    
    // Search in author name
    if (item.authorName && item.authorName.toLowerCase().includes(lowerQuery)) {
      return true
    }
    
    // Search in tags
    if (item.tags && item.tags.some(tag => tag.toLowerCase().includes(lowerQuery))) {
      return true
    }
    
    return false
  })
}

// Sort function
function sortRankings(items: RankingItem[], sortBy: string): RankingItem[] {
  const sorted = [...items]
  
  switch (sortBy) {
    case 'rank':
      return sorted.sort((a, b) => a.rank - b.rank)
    case 'views':
      return sorted.sort((a, b) => (b.viewCount || 0) - (a.viewCount || 0))
    case 'likes':
      return sorted.sort((a, b) => (b.likeCount || 0) - (a.likeCount || 0))
    case 'date':
      return sorted.sort((a, b) => {
        const dateA = new Date(a.uploadedAt || 0).getTime()
        const dateB = new Date(b.uploadedAt || 0).getTime()
        return dateB - dateA
      })
    default:
      return sorted
  }
}

// Message handler
self.onmessage = (event: MessageEvent<ProcessingMessage>) => {
  const { type, data } = event.data
  
  try {
    let result: RankingItem[]
    
    switch (type) {
      case 'FILTER_RANKINGS':
        result = filterByNGList(data.items, data.ngList || {})
        break
        
      case 'SEARCH_RANKINGS':
        result = searchRankings(data.items, data.searchQuery || '')
        break
        
      case 'SORT_RANKINGS':
        result = sortRankings(data.items, data.sortBy || 'rank')
        break
        
      default:
        throw new Error(`Unknown message type: ${type}`)
    }
    
    // Send result back to main thread
    self.postMessage({
      type: 'SUCCESS',
      data: result
    })
  } catch (error) {
    // Send error back to main thread
    self.postMessage({
      type: 'ERROR',
      error: error instanceof Error ? error.message : 'Unknown error'
    })
  }
}

// Export empty object to satisfy TypeScript
export {}