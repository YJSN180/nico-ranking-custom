import type { RankingItem } from '@/types/ranking'
import type { NGList } from '@/types/ng-list'
import { filterWithNGListCore } from '@/lib/ng-filter-core'
import { filterRankingItemsServer } from '@/lib/ng-filter-server'

export type NGFilterResult = {
  filteredItems: RankingItem[]
  newDerivedIds: string[]
}

export type NGFilterFn = (
  items: RankingItem[],
) => Promise<NGFilterResult> | NGFilterResult

export function createCoreNgFilter(ngList: NGList): NGFilterFn {
  return async (items) => filterWithNGListCore(items, ngList)
}

export function createServerNgFilter(): NGFilterFn {
  return async (items) => {
    const result = await filterRankingItemsServer(items)
    return {
      filteredItems: result.filteredItems,
      newDerivedIds: result.newDerivedIds,
    }
  }
}
