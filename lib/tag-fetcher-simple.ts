/**
 * ニコニコ動画の固定タグを取得するためのシンプルなモジュール
 * getthumbinfo APIのみを使用
 */

import type { RankingItem } from '../types/ranking'

/**
 * getthumbinfo APIを使用して固定タグを取得
 * @param videoId 動画ID
 * @returns 固定タグの配列、取得できない場合は空配列
 */
export async function fetchFixedTagsFromGetThumbInfo(videoId: string): Promise<string[]> {
  try {
    const response = await fetch(`https://ext.nicovideo.jp/api/getthumbinfo/${videoId}`)
    
    if (!response.ok) {
      return []
    }
    
    const xml = await response.text()
    
    // エラーレスポンスのチェック
    if (xml.includes('status="fail"')) {
      return []
    }
    
    // 成功レスポンスのチェック
    if (!xml.includes('status="ok"')) {
      return []
    }
    
    // ロックされたタグ（固定タグ）を抽出
    const lockedTagMatches = xml.matchAll(/<tag[^>]*lock="1"[^>]*>([^<]+)<\/tag>/g)
    const lockedTags = Array.from(lockedTagMatches, m => m[1])
    
    return lockedTags
  } catch (error) {
    // エラーは静かに処理（ログ出力なし）
    return []
  }
}

/**
 * 複数のランキングアイテムに対して固定タグを一括取得（最適化版）
 * @param items ランキングアイテムの配列
 * @param parallelCount 並列処理数（デフォルト: 50）
 * @param batchDelay バッチ間の遅延（ミリ秒、デフォルト: 50）
 * @returns 固定タグ情報が追加されたランキングアイテムの配列
 */
export async function enrichRankingItemsWithFixedTags(
  items: RankingItem[],
  parallelCount: number = 50,
  batchDelay: number = 50
): Promise<RankingItem[]> {
  const totalItems = items.length
  const startTime = Date.now()
  let processedCount = 0
  let itemsWithTags = 0
  
  // バッチ処理
  const enrichedItems: RankingItem[] = []
  
  for (let i = 0; i < items.length; i += parallelCount) {
    const batch = items.slice(i, i + parallelCount)
    
    const batchPromises = batch.map(async (item) => {
      // 既にタグがある場合はスキップ
      if (item.tags && item.tags.length > 0) {
        return item
      }
      
      const tags = await fetchFixedTagsFromGetThumbInfo(item.id)
      
      if (tags.length > 0) {
        itemsWithTags++
      }
      
      return {
        ...item,
        tags
      }
    })
    
    const batchResults = await Promise.all(batchPromises)
    enrichedItems.push(...batchResults)
    
    processedCount += batch.length
    
    // 進捗表示（10%ごと）
    const progress = Math.floor((processedCount / totalItems) * 10) * 10
    if (progress > 0 && processedCount % Math.floor(totalItems / 10) < parallelCount) {
      const elapsed = Date.now() - startTime
      const avgTime = elapsed / processedCount
      const remainingTime = Math.round((totalItems - processedCount) * avgTime / 1000)
      console.log(
        `[Tag Fetching] ${progress}% complete (${processedCount}/${totalItems}), ` +
        `${itemsWithTags} items with tags, ` +
        `ETA: ${remainingTime}s`
      )
    }
    
    // バッチ間の遅延（最後のバッチ以外）
    if (i + parallelCount < items.length) {
      await new Promise(resolve => setTimeout(resolve, batchDelay))
    }
  }
  
  // 最終統計
  const elapsed = Math.round((Date.now() - startTime) / 1000)
  console.log(
    `[Tag Fetching] Completed: ${totalItems} items in ${elapsed}s, ` +
    `${itemsWithTags} items with tags (${Math.round(itemsWithTags / totalItems * 100)}%)`
  )
  
  return enrichedItems
}