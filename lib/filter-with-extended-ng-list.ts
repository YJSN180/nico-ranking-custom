import type { RankingItem } from '@/types/ranking'
import type { ExtendedNGList } from '@/types/ng-list-extended'
import { matchesTagNGList, prepareTagNGList } from './filter-with-tags'
import { isExtendedNGList } from './ng-list-migration-extended'
import { filterWithNGListCore } from './ng-filter-core'

export interface ExtendedNGFilterResult {
  filteredItems: RankingItem[]
  newDerivedIds: string[]
}

/**
 * 拡張NGリスト（タグ対応）に基づいてランキングアイテムをフィルタリング
 * @param items フィルタリング対象のアイテム
 * @param ngList 拡張NGリスト
 * @returns フィルタリング結果と新たに追加すべき派生ID
 */
export function filterWithExtendedNGList(
  items: RankingItem[],
  ngList: ExtendedNGList,
): ExtendedNGFilterResult {
  // タグの NG は比べる形に 1 回だけ直し、動画ごとには作り直さない
  const tagNG =
    isExtendedNGList(ngList) && ngList.tags
      ? prepareTagNGList(ngList.tags)
      : null
  return filterWithNGListCore(items, ngList, {
    tagFilter: (item) => tagNG !== null && matchesTagNGList(item, tagNG),
  })
}
