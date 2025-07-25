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
  // eslint-disable-next-line no-console
  console.log('[FILTER DEBUG] applyCustomFilters called')
  // eslint-disable-next-line no-console
  console.log('[FILTER DEBUG] Items count:', items.length)
  // eslint-disable-next-line no-console
  console.log('[FILTER DEBUG] Conditions:', conditions)
  
  if (conditions.length === 0) {
    // eslint-disable-next-line no-console
    console.log('[FILTER DEBUG] No conditions, returning all items')
    return items
  }

  const filtered = items.filter(item => matchesConditions(item, conditions))
  // eslint-disable-next-line no-console
  console.log('[FILTER DEBUG] Filtered count:', filtered.length)
  return filtered
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

  // NOT条件のチェック（1つでも含まれていたら除外）
  for (const condition of notConditions) {
    if (hasMatchingTag(item, condition)) {
      return false
    }
  }

  // AND条件のチェック（すべて含まれている必要がある）
  for (const condition of andConditions) {
    if (!hasMatchingTag(item, condition)) {
      return false
    }
  }

  // OR条件のチェック（少なくとも1つ含まれている必要がある）
  if (orConditions.length > 0) {
    const hasAnyOrTag = orConditions.some(condition => 
      hasMatchingTag(item, condition)
    )
    if (!hasAnyOrTag) {
      return false
    }
  }

  return true
}

/**
 * アイテムが指定されたタグ条件に一致するかチェック
 * @param item ランキングアイテム
 * @param condition タグ条件
 * @returns 条件に一致する場合はtrue
 */
function hasMatchingTag(item: RankingItem, condition: TagCondition): boolean {
  const tagNameLower = condition.tag.toLowerCase()
  
  // デバッグ用：最初の数件のみログ出力
  if (Math.random() < 0.01) { // 1%の確率でログ出力（大量ログ防止）
    // eslint-disable-next-line no-console
    console.log('[FILTER DEBUG] Checking tag:', condition.tag, 'for item:', item.title)
    // eslint-disable-next-line no-console
    console.log('[FILTER DEBUG] Item tags:', item.tags)
    // eslint-disable-next-line no-console
    console.log('[FILTER DEBUG] Item tagDetails:', item.tagDetails?.map(td => ({ name: td.name, isLocked: td.isLocked })))
  }

  // tagDetailsがある場合は詳細情報を使用
  if (item.tagDetails && item.tagDetails.length > 0) {
    for (const tagDetail of item.tagDetails) {
      if (tagDetail.name.toLowerCase() === tagNameLower) {
        // タグタイプのチェック
        switch (condition.tagType) {
          case 'lock':
            return tagDetail.isLocked
          case 'user':
            return !tagDetail.isLocked
          case 'both':
            return true
          default:
            // 後方互換性のため、tagTypeが未定義の場合は両方を対象とする
            return true
        }
      }
    }
    return false
  }

  // tagDetailsがない場合はtagsを使用（タグタイプの区別はできない）
  if (item.tags && item.tags.length > 0) {
    const hasTag = item.tags.some(tag => tag.toLowerCase() === tagNameLower)
    if (hasTag) {
      // tagDetailsがない場合は、'both'の場合のみ一致とする
      // 'lock'や'user'の場合は正確な判定ができないため除外
      return condition.tagType === 'both'
    }
  }

  return false
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