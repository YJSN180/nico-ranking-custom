import type { RankingItem } from '@/types/ranking'
import type { ExtendedNGList } from '@/types/ng-list-extended'
import { filterByTags } from './filter-with-tags'
import { isExtendedNGList } from './ng-list-migration-extended'

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
  ngList: ExtendedNGList
): ExtendedNGFilterResult {
  const newDerivedIds: string[] = []
  
  // items が undefined または null の場合は空の結果を返す
  if (!items || !Array.isArray(items)) {
    return {
      filteredItems: [],
      newDerivedIds: []
    }
  }
  
  // 入力配列の順序を保持しつつ、rank番号をリセット
  const itemsWithResetRank = items.map((item, index) => ({
    ...item,
    rank: index + 1
  }))
  
  // 高速検索のためにSetを作成
  const videoIdSet = new Set(ngList.videoIds)
  const derivedVideoIdSet = new Set(ngList.derivedVideoIds || [])
  const videoTitleExactSet = new Set(ngList.videoTitles.exact)
  const authorIdSet = new Set(ngList.authorIds)
  const authorNameExactSet = new Set(ngList.authorNames.exact)
  
  const filteredItems = itemsWithResetRank.filter((item) => {
    // 既にNGリストにある場合
    if (videoIdSet.has(item.id)) {
      return false
    }
    
    // 派生NGリストにある場合
    if (derivedVideoIdSet.has(item.id)) {
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
    if (item.authorName && ngList.authorNames.partial.some(partial => item.authorName!.includes(partial))) {
      newDerivedIds.push(item.id)
      return false
    }
    
    // タグでチェック（拡張NGListの場合のみ）
    if (isExtendedNGList(ngList) && ngList.tags) {
      if (filterByTags(item, ngList.tags)) {
        newDerivedIds.push(item.id)
        return false
      }
    }
    
    return true
  })
  
  // フィルタリング後、ランク番号を再計算する
  const rerankedItems = filteredItems.map((item, index) => ({
    ...item,
    rank: index + 1  // 1から始まる連続した番号に再計算
  }))
  
  return {
    filteredItems: rerankedItems,
    newDerivedIds
  }
}