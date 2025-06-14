// Server-side NG filtering
import type { RankingItem } from '@/types/ranking'
import type { NGList, NGFilterResult } from '@/types/ng-list'
import { getServerNGList } from './ng-list-server'

// Filter ranking items with NG list
export async function filterRankingItemsServer(items: RankingItem[]): Promise<NGFilterResult> {
  const ngList = await getServerNGList()
  const newDerivedIds: string[] = []
  
  // Create Sets for fast lookup
  const videoIdSet = new Set([...ngList.videoIds, ...ngList.derivedVideoIds])
  const titleSet = new Set(ngList.videoTitles)
  const authorIdSet = new Set(ngList.authorIds)
  const authorNameSet = new Set(ngList.authorNames)
  
  const filteredItems = items.filter((item) => {
    // Video ID exact match
    if (videoIdSet.has(item.id)) {
      return false
    }
    
    // Title exact match
    if (titleSet.has(item.title)) {
      newDerivedIds.push(item.id)
      return false
    }
    
    // Title partial match
    for (const ngTitle of ngList.videoTitles) {
      if (item.title.includes(ngTitle)) {
        newDerivedIds.push(item.id)
        return false
      }
    }
    
    // Author ID exact match
    if (item.authorId && authorIdSet.has(item.authorId)) {
      newDerivedIds.push(item.id)
      return false
    }
    
    // Author name exact match
    if (item.authorName && authorNameSet.has(item.authorName)) {
      newDerivedIds.push(item.id)
      return false
    }
    
    // Author name partial match
    if (item.authorName) {
      for (const ngName of ngList.authorNames) {
        if (item.authorName.includes(ngName)) {
          newDerivedIds.push(item.id)
          return false
        }
      }
    }
    
    return true
  })
  
  // Keep original rank numbers (no re-ranking)
  
  return {
    filteredItems: filteredItems, // 元のランク番号を保持
    filteredCount: items.length - filteredItems.length,
    newDerivedIds: Array.from(new Set(newDerivedIds))
  }
}

// Filter ranking data (with popular tags)
export async function filterRankingDataServer(data: {
  items: RankingItem[]
  popularTags?: string[]
}): Promise<{
  items: RankingItem[]
  popularTags?: string[]
}> {
  const { filteredItems } = await filterRankingItemsServer(data.items)
  
  return {
    items: filteredItems,
    popularTags: data.popularTags
  }
}