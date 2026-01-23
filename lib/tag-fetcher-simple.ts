/**
 * ニコニコ動画の固定タグを取得するためのシンプルなモジュール
 * getthumbinfo APIのみを使用
 */

import type { RankingItem } from '../types/ranking'

/**
 * タグの詳細情報
 */
export interface TagDetail {
  name: string
  isLocked: boolean
}

/**
 * getthumbinfo APIを使用して固定タグを取得
 * @param videoId 動画ID
 * @param maxRetries 最大リトライ回数（デフォルト: 2）
 * @returns 固定タグの配列、取得できない場合は空配列
 */
export async function fetchFixedTagsFromGetThumbInfo(
  videoId: string,
  maxRetries: number = 2
): Promise<string[]> {
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const response = await fetch(`https://ext.nicovideo.jp/api/getthumbinfo/${videoId}`)

      // レート制限時は待機してリトライ
      if (response.status === 429) {
        const waitTime = Math.pow(2, attempt) * 1000
        // eslint-disable-next-line no-console
        console.warn(`[Tag Fetch] Rate limited for ${videoId}, waiting ${waitTime}ms...`)
        await new Promise(resolve => setTimeout(resolve, waitTime))
        continue
      }

      if (!response.ok) {
        // eslint-disable-next-line no-console
        console.warn(`[Tag Fetch] HTTP ${response.status} for ${videoId}`)
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
      if (attempt < maxRetries) {
        await new Promise(resolve => setTimeout(resolve, 1000))
        continue
      }
      // eslint-disable-next-line no-console
      console.warn(`[Tag Fetch] Failed for ${videoId}:`, error instanceof Error ? error.message : 'Unknown error')
      return []
    }
  }
  return []
}

/**
 * getthumbinfo APIを使用してすべてのタグ（ロックタグ＋ユーザータグ）を取得
 * @param videoId 動画ID
 * @param maxRetries 最大リトライ回数（デフォルト: 2）
 * @returns タグ詳細の配列、取得できない場合は空配列
 */
export async function fetchAllTagsFromGetThumbInfo(
  videoId: string,
  maxRetries: number = 2
): Promise<TagDetail[]> {
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const response = await fetch(`https://ext.nicovideo.jp/api/getthumbinfo/${videoId}`)

      // レート制限時は待機してリトライ
      if (response.status === 429) {
        const waitTime = Math.pow(2, attempt) * 1000
        // eslint-disable-next-line no-console
        console.warn(`[Tag Fetch] Rate limited for ${videoId}, waiting ${waitTime}ms...`)
        await new Promise(resolve => setTimeout(resolve, waitTime))
        continue
      }

      if (!response.ok) {
        // eslint-disable-next-line no-console
        console.warn(`[Tag Fetch] HTTP ${response.status} for ${videoId}`)
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

      // すべてのタグを抽出（ロック状態も含む）
      const allTagMatches = xml.matchAll(/<tag(\s+lock="1")?[^>]*>([^<]+)<\/tag>/g)
      const tagDetails: TagDetail[] = []

      for (const match of allTagMatches) {
        tagDetails.push({
          name: match[2],
          isLocked: match[1] !== undefined
        })
      }

      return tagDetails
    } catch (error) {
      if (attempt < maxRetries) {
        await new Promise(resolve => setTimeout(resolve, 1000))
        continue
      }
      // eslint-disable-next-line no-console
      console.warn(`[Tag Fetch] Failed for ${videoId}:`, error instanceof Error ? error.message : 'Unknown error')
      return []
    }
  }
  return []
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
  parallelCount: number = 10,
  batchDelay: number = 300
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
      // eslint-disable-next-line no-console
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
  // eslint-disable-next-line no-console
  console.log(
    `[Tag Fetching] Completed: ${totalItems} items in ${elapsed}s, ` +
    `${itemsWithTags} items with tags (${Math.round(itemsWithTags / totalItems * 100)}%)`
  )
  
  return enrichedItems
}


/**
 * 複数のランキングアイテムに対してタグ詳細を一括取得
 * @param items ランキングアイテムの配列
 * @param parallelCount 並列処理数（デフォルト: 50、getthumbinfo APIは軽量）
 * @param batchDelay バッチ間の遅延（ミリ秒、デフォルト: 50）
 * @returns タグ詳細情報が追加されたランキングアイテムの配列
 */
export async function enrichRankingItemsWithTagDetails(
  items: RankingItem[],
  parallelCount: number = 10,
  batchDelay: number = 300
): Promise<(RankingItem & { tagDetails?: TagDetail[] })[]> {
  const totalItems = items.length
  const startTime = Date.now()
  let processedCount = 0
  let itemsWithTags = 0
  
  // バッチ処理
  const enrichedItems: (RankingItem & { tagDetails?: TagDetail[] })[] = []
  
  for (let i = 0; i < items.length; i += parallelCount) {
    const batch = items.slice(i, i + parallelCount)
    
    const batchPromises = batch.map(async (item) => {
      const tagDetails = await fetchAllTagsFromGetThumbInfo(item.id)

      // API失敗時（空配列）は既存のタグを保持
      if (tagDetails.length === 0) {
        return item
      }

      itemsWithTags++

      return {
        ...item,
        tagDetails,
        // 後方互換性のため、既存のtagsフィールドも更新
        tags: tagDetails.map(t => t.name)
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
      // eslint-disable-next-line no-console
      console.log(
        `[Tag Details Fetching] ${progress}% complete (${processedCount}/${totalItems}), ` +
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
  // eslint-disable-next-line no-console
  console.log(
    `[Tag Details Fetching] Completed: ${totalItems} items in ${elapsed}s, ` +
    `${itemsWithTags} items with tags (${Math.round(itemsWithTags / totalItems * 100)}%)`
  )
  
  return enrichedItems
}