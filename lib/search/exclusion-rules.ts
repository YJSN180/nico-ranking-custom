// 検索結果からサイト側で除外する粗悪コンテンツのルール定義
// ルールはサーバー側（app/api/search）で適用されるため、クライアントからは無効化できない
// 除外条件を追加する場合はこのファイルの SEARCH_EXCLUSION_RULES に追記する

import type { RankingItem } from '@/types/ranking'

export interface SearchExclusionRules {
  /** このタグを1つでも含む動画を除外（大文字小文字を区別しない完全一致） */
  tags: string[]
  /** タイトルにこの文字列を含む動画を除外（大文字小文字を区別しない部分一致） */
  titleKeywords: string[]
  /** この投稿者IDの動画を除外（ユーザーIDまたは channel/chXXXX 形式） */
  authorIds: string[]
}

// TODO: 除外条件はユーザー指定を待って追記する
export const SEARCH_EXCLUSION_RULES: SearchExclusionRules = {
  tags: [],
  titleKeywords: [],
  authorIds: [],
}

export interface ExclusionResult {
  items: RankingItem[]
  excludedCount: number
}

/** 除外ルールを適用し、通過したアイテムと除外件数を返す */
export function applyExclusionRules(
  items: RankingItem[],
  rules: SearchExclusionRules = SEARCH_EXCLUSION_RULES
): ExclusionResult {
  const tagSet = new Set(rules.tags.map((t) => t.toLowerCase()))
  const keywords = rules.titleKeywords.map((k) => k.toLowerCase())
  const authorSet = new Set(rules.authorIds)

  if (tagSet.size === 0 && keywords.length === 0 && authorSet.size === 0) {
    return { items, excludedCount: 0 }
  }

  const filtered = items.filter((item) => {
    if (item.authorId && authorSet.has(item.authorId)) return false
    const title = item.title.toLowerCase()
    if (keywords.some((keyword) => title.includes(keyword))) return false
    if (item.tags?.some((tag) => tagSet.has(tag.toLowerCase()))) return false
    return true
  })

  return { items: filtered, excludedCount: items.length - filtered.length }
}
