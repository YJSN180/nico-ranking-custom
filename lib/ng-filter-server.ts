// Server-side NG filtering
import type { RankingItem } from '@/types/ranking'
import type { NGList, NGFilterResult } from '@/types/ng-list'
import { getServerNGList } from './ng-list-server'
import { filterWithNGList } from './filter-with-ng-list'
import { applyRequestRules } from './lqng/request-rules'
import { getLqngConfig, isLqngEnabled } from './lqng/server'
import type { LqngConfig } from './lqng/types'
import type { KvReadOptions } from './simple-kv'

/** サーバー側で当てる NG（管理者の手動・派生・自動 NG と、リクエスト時ルールの設定） */
export interface ServerNgContext {
  ngList: NGList
  lqngConfig: LqngConfig | null
}

/**
 * NG を読む。失敗しても投げない（直前の成功値か空で続ける）。
 * 検索 API は上流の問い合わせと並列に読み始めるため、読み込みと適用を分けている
 */
export async function loadServerNgContext(options: KvReadOptions = {}): Promise<ServerNgContext> {
  const [ngList, lqngConfig] = await Promise.all([
    getServerNGList(options),
    isLqngEnabled() ? getLqngConfig(options).catch(() => null) : Promise.resolve(null)
  ])
  return { ngList, lqngConfig }
}

// 手動NG → 派生NG → 自動NG（判定テーブル）の順に落とした後、粗悪コンテンツのリクエスト時ルール
// （タイトル照合・ロックタグ群）をその場でも掛ける。ポーリングの隙間を埋めるため。
export function applyServerNgContext(items: RankingItem[], context: ServerNgContext): NGFilterResult {
  const result = filterWithNGList(items, context.ngList)
  const requestRules = applyRequestRules(result.filteredItems, context.lqngConfig)
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

// Filter ranking items with NG list
export async function filterRankingItemsServer(items: RankingItem[], options: KvReadOptions = {}): Promise<NGFilterResult> {
  return applyServerNgContext(items, await loadServerNgContext(options))
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