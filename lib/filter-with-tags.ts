import type { RankingItem } from '@/types/ranking'
import type { ExtendedNGList } from '@/types/ng-list-extended'

/**
 * タグによるフィルタリング
 * @param item ランキングアイテム
 * @param ngTags タグNGリスト
 * @returns NGリストに該当する場合はtrue
 */
export function filterByTags(
  item: RankingItem,
  ngTags: ExtendedNGList['tags']
): boolean {
  // タグNGリストが未定義の場合はフィルタリングしない
  if (!ngTags) {
    return false
  }
  
  // アイテムにタグ情報がない場合はフィルタリングしない
  if (!item.tagDetails || item.tagDetails.length === 0) {
    return false
  }
  
  // 各タグをチェック
  for (const tag of item.tagDetails) {
    const tagName = tag.name
    const isLocked = tag.isLocked
    
    // ロックタグのチェック
    if (isLocked) {
      // 完全一致（大文字小文字を区別しない）
      if (ngTags.locked.exact.some(exact => tagName.toLowerCase() === exact.toLowerCase())) {
        return true
      }
      // 部分一致（大文字小文字を区別しない）
      if (ngTags.locked.partial.some(partial => tagName.toLowerCase().includes(partial.toLowerCase()))) {
        return true
      }
    }
    
    // ユーザータグのチェック
    if (!isLocked) {
      // 完全一致（大文字小文字を区別しない）
      if (ngTags.user.exact.some(exact => tagName.toLowerCase() === exact.toLowerCase())) {
        return true
      }
      // 部分一致（大文字小文字を区別しない）
      if (ngTags.user.partial.some(partial => tagName.toLowerCase().includes(partial.toLowerCase()))) {
        return true
      }
    }
    
    // 両方（ロック・ユーザー問わず）のチェック
    // 完全一致（大文字小文字を区別しない）
    if (ngTags.both.exact.some(exact => tagName.toLowerCase() === exact.toLowerCase())) {
      return true
    }
    // 部分一致（大文字小文字を区別しない）
    if (ngTags.both.partial.some(partial => tagName.toLowerCase().includes(partial.toLowerCase()))) {
      return true
    }
  }
  
  // どのNGタグにも該当しない場合
  return false
}