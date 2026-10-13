import type { RankingItem } from '../../types/ranking'
import type { NGList } from '../../types/ng-list'
import type { AutoNgSets } from '../lqng/types'
import { mergeAutoNgIntoList } from '../lqng/merge'
import { filterWithNGListCore } from '../ng-filter-core'
import { filterRankingItemsServer } from '../ng-filter-server'
import { emptyAutoNgExcluded, type AutoNgExcludedByPeriod } from './auto-ng'
import type { RankingContext } from './run-update'

export type NGFilterResult = {
  filteredItems: RankingItem[]
  newDerivedIds: string[]
}

export type NGFilterFn = (
  items: RankingItem[],
) => Promise<NGFilterResult> | NGFilterResult

export interface PipelineNgFilter {
  filterItems: (items: RankingItem[], context: RankingContext) => Promise<NGFilterResult>
  /** 自動NG で除いた件数（期間ごと） */
  autoNgExcluded: AutoNgExcludedByPeriod
}

/**
 * 手動・派生 NG に自動NG（許可リスト適用済み）を合流して除く。合流と評価順はサイト
 * （lib/ng-list-server.ts の mergeAutoNgIntoList → filterWithNGListCore）と同じで、自動NG は手動・派生の後に
 * 評価され、派生 NG には積まない。ジャンル 1 つにつき 1 つ作り、自動NG で除いた件数を期間ごとに数える。
 */
export function createPipelineNgFilter(ngList: NGList, auto: AutoNgSets): PipelineNgFilter {
  const autoNgExcluded = emptyAutoNgExcluded()
  if (auto.authorIds.length === 0 && auto.videoIds.length === 0) {
    return { filterItems: async (items) => filterWithNGListCore(items, ngList), autoNgExcluded }
  }
  const withAuto = mergeAutoNgIntoList(ngList, auto)
  return {
    filterItems: async (items, context) => {
      const result = filterWithNGListCore(items, withAuto)
      // 自動NG は手動・派生の後に評価されるので、手動・派生だけの結果との差が自動NG で除いた件数
      const excluded = filterWithNGListCore(items, ngList).filteredItems.length - result.filteredItems.length
      autoNgExcluded[context.period][context.kind === 'main' ? 'ranking' : 'tags'] += excluded
      return result
    },
    autoNgExcluded,
  }
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
