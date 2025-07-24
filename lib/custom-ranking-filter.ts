import type { RankingItem } from '@/types/ranking'
import type { TagCondition } from '@/types/custom-ranking'

/**
 * カスタムランキングの条件に基づいてアイテムをフィルタリング
 * @param items ランキングアイテムの配列
 * @param conditions タグ条件の配列
 * @returns フィルタリング後のランキングアイテム
 */
export function applyCustomFilters(
  items: RankingItem[],
  conditions: TagCondition[]
): RankingItem[] {
  if (conditions.length === 0) {
    return items
  }

  return items.filter(item => matchesConditions(item, conditions))
}

/**
 * アイテムが条件に一致するかチェック
 * @param item ランキングアイテム
 * @param conditions タグ条件の配列
 * @returns 条件に一致する場合はtrue
 */
function matchesConditions(
  item: RankingItem,
  conditions: TagCondition[]
): boolean {
  // AND条件の収集
  const andConditions = conditions.filter(c => c.operator === 'AND')
  // OR条件の収集
  const orConditions = conditions.filter(c => c.operator === 'OR')
  // NOT条件の収集
  const notConditions = conditions.filter(c => c.operator === 'NOT')

  // アイテムのタグを取得（大文字小文字を区別しない比較のため小文字化）
  const itemTags = getItemTags(item).map(tag => tag.toLowerCase())

  // NOT条件のチェック（1つでも含まれていたら除外）
  for (const condition of notConditions) {
    if (itemTags.includes(condition.tag.toLowerCase())) {
      return false
    }
  }

  // AND条件のチェック（すべて含まれている必要がある）
  for (const condition of andConditions) {
    if (!itemTags.includes(condition.tag.toLowerCase())) {
      return false
    }
  }

  // OR条件のチェック（少なくとも1つ含まれている必要がある）
  if (orConditions.length > 0) {
    const hasAnyOrTag = orConditions.some(condition => 
      itemTags.includes(condition.tag.toLowerCase())
    )
    if (!hasAnyOrTag) {
      return false
    }
  }

  return true
}

/**
 * アイテムからタグを取得
 * @param item ランキングアイテム
 * @returns タグの配列
 */
function getItemTags(item: RankingItem): string[] {
  const tags: string[] = []

  // tagDetailsから取得（優先）
  if (item.tagDetails && item.tagDetails.length > 0) {
    tags.push(...item.tagDetails.map(detail => detail.name))
  }
  // tagsから取得（フォールバック）
  else if (item.tags && item.tags.length > 0) {
    tags.push(...item.tags)
  }

  return tags
}

/**
 * タグごとの出現回数を集計
 * @param items ランキングアイテムの配列
 * @returns タグと出現回数のマップ
 */
export function collectTagCounts(items: RankingItem[]): Map<string, number> {
  const tagCounts = new Map<string, number>()

  for (const item of items) {
    const tags = getItemTags(item)
    for (const tag of tags) {
      const current = tagCounts.get(tag) || 0
      tagCounts.set(tag, current + 1)
    }
  }

  return tagCounts
}