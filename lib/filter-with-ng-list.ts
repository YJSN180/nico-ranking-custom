import type { RankingItem } from '@/types/ranking'
import type { NGList } from '@/types/ng-list'

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
  const newDerivedIds: string[] = []
  
  // 高速検索のためにSetを作成
  const videoIdSet = new Set(ngList.videoIds)
  const videoTitleExactSet = new Set(ngList.videoTitles.exact)
  const authorIdSet = new Set(ngList.authorIds)
  const authorNameExactSet = new Set(ngList.authorNames.exact)
  
  const filteredItems = items.filter((item) => {
    // 既にNGリストにある場合
    if (videoIdSet.has(item.id)) {
      return false
    }
    
    // タイトルでチェック（完全一致）
    if (videoTitleExactSet.has(item.title)) {
      newDerivedIds.push(item.id)
      return false
    }
    
    // タイトルでチェック（部分一致）
    if (ngList.videoTitles.partial.some(partial => item.title.includes(partial))) {
      newDerivedIds.push(item.id)
      return false
    }
    
    // 投稿者IDでチェック
    if (item.authorId && authorIdSet.has(item.authorId)) {
      newDerivedIds.push(item.id)
      return false
    }
    
    // 投稿者名でチェック（完全一致）
    if (item.authorName && authorNameExactSet.has(item.authorName)) {
      newDerivedIds.push(item.id)
      return false
    }
    
    // 投稿者名でチェック（部分一致）
    if (item.authorName && ngList.authorNames.partial.some(partial => item.authorName.includes(partial))) {
      newDerivedIds.push(item.id)
      return false
    }
    
    return true
  })
  
  return {
    filteredItems,
    newDerivedIds
  }
}