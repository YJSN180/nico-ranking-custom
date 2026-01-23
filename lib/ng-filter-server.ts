// Server-side NG filtering
import type { RankingItem } from '@/types/ranking'
import type { NGList, NGFilterResult } from '@/types/ng-list'
import { getServerNGList } from './ng-list-server'
import { filterWithNGList } from './filter-with-ng-list'

// Filter ranking items with NG list
export async function filterRankingItemsServer(items: RankingItem[]): Promise<NGFilterResult<RankingItem>> {
  const ngList = await getServerNGList()
  const result = filterWithNGList(items, ngList)
  
  return {
    filteredItems: result.filteredItems,
    filteredCount: items.length - result.filteredItems.length,
    newDerivedIds: result.newDerivedIds
  }
}

// Filter ranking data (with popular tags)
export async function filterRankingDataServer(data: {
  items: RankingItem[]
  popularTags?: string[]
}): Promise<{
  filteredData: {
    items: RankingItem[]
    popularTags?: string[]
  }
  newDerivedIds: string[]
}> {
  const { filteredItems, newDerivedIds } = await filterRankingItemsServer(data.items)
  
  return {
    filteredData: {
      items: filteredItems,
      popularTags: data.popularTags
    },
    newDerivedIds
  }
}