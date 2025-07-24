/**
 * カスタムタグ条件によるフィルタリング
 */

import type { RankingItem } from '@/types/ranking'
import type { CustomTagConditions } from '@/types/custom-tag-ranking'

/**
 * カスタムタグ条件でランキングアイテムをフィルタリング
 * @param items ランキングアイテムの配列
 * @param conditions カスタムタグ条件
 * @returns フィルタリング後のアイテム配列
 */
export function filterByCustomTags(
  items: RankingItem[],
  conditions: CustomTagConditions
): RankingItem[] {
  // 条件が空の場合はすべて返す
  if (
    conditions.and.length === 0 &&
    conditions.or.length === 0 &&
    conditions.not.length === 0
  ) {
    return items
  }

  return items.filter(item => {
    // アイテムのタグ名を小文字で取得
    const itemTags = item.tagDetails?.map(t => t.name.toLowerCase()) || []
    
    // AND条件：すべてのタグを含む必要がある
    const andMatch = conditions.and.length === 0 || 
      conditions.and.every(tag => 
        itemTags.includes(tag.toLowerCase())
      )
    
    // OR条件：いずれかのタグを含めばOK
    const orMatch = conditions.or.length === 0 ||
      conditions.or.some(tag => 
        itemTags.includes(tag.toLowerCase())
      )
    
    // NOT条件：指定されたタグを含まない
    const notMatch = conditions.not.every(tag => 
      !itemTags.includes(tag.toLowerCase())
    )
    
    // すべての条件を満たす場合のみtrue
    return andMatch && orMatch && notMatch
  })
}

/**
 * フィルタリング結果を順位付きで返す
 * @param items ランキングアイテムの配列
 * @param conditions カスタムタグ条件
 * @returns フィルタリング後のアイテム配列（rank再計算済み）
 */
export function filterAndRerankByCustomTags(
  items: RankingItem[],
  conditions: CustomTagConditions
): RankingItem[] {
  const filtered = filterByCustomTags(items, conditions)
  
  // rankを再計算
  return filtered.map((item, index) => ({
    ...item,
    rank: index + 1
  }))
}

/**
 * 各ランキングアイテムからユニークなタグを抽出
 * @param items ランキングアイテムの配列
 * @returns タグ名と出現回数のマップ
 */
export function extractUniqueTags(items: RankingItem[]): Map<string, number> {
  const tagCountMap = new Map<string, number>()
  
  items.forEach(item => {
    item.tagDetails?.forEach(tag => {
      const count = tagCountMap.get(tag.name) || 0
      tagCountMap.set(tag.name, count + 1)
    })
  })
  
  return tagCountMap
}

/**
 * タグの出現頻度順にソートして返す
 * @param items ランキングアイテムの配列
 * @param limit 返すタグの最大数
 * @returns タグ名の配列（出現頻度順）
 */
export function getTopTags(items: RankingItem[], limit: number = 100): string[] {
  const tagCountMap = extractUniqueTags(items)
  
  return Array.from(tagCountMap.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([tag]) => tag)
}