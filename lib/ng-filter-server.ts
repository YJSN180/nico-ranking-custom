// Server-side NG filtering
import type { RankingItem } from '@/types/ranking'
import type { NGList, NGFilterResult } from '@/types/ng-list'
import { getServerNGList } from './ng-list-server'
import { filterWithNGList } from './filter-with-ng-list'
import { applyRequestRules } from './lqng/request-rules'
import { getLqngConfig, isLqngEnabled } from './lqng/server'

// Filter ranking items with NG list
// 手動NG → 派生NG → 自動NG（判定テーブル）の順に落とした後、粗悪コンテンツのリクエスト時ルール
// （タイトル照合・ロックタグ群）をその場でも掛ける。ポーリングの隙間を埋めるため。
export async function filterRankingItemsServer(items: RankingItem[]): Promise<NGFilterResult> {
  const [ngList, lqngConfig] = await Promise.all([
    getServerNGList(),
    isLqngEnabled() ? getLqngConfig().catch(() => null) : Promise.resolve(null)
  ])
  const result = filterWithNGList(items, ngList)
  const requestRules = applyRequestRules(result.filteredItems, lqngConfig)
  const filteredItems =
    requestRules.excludedCount === 0
      ? result.filteredItems
      : requestRules.items.map((item, index) => ({ ...item, rank: index + 1 }))
  
  return {
    filteredItems,
    filteredCount: items.length - filteredItems.length,
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