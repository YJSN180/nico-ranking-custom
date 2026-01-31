import type { RankingItem } from '@/types/ranking'
import type { NGList } from '@/types/ng-list'
import { filterWithNGListCore } from './ng-filter-core'

export interface NGFilterResult {
  filteredItems: RankingItem[]
  newDerivedIds: string[]
}

/**
 * NGリストに基づいてランキングアイテムをフィルタリング
 * @param items フィルタリング対象のアイテム
 * @param ngList NGリスト
 * @returns フィルタリング結果と新たに追加すべき派生ID
 */
export function filterWithNGList(items: RankingItem[], ngList: NGList): NGFilterResult {
  return filterWithNGListCore(items, ngList)
}
