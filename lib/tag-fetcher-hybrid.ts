/**
 * ハイブリッドタグ取得モジュール
 *
 * 使い分け戦略:
 * - Phase 1: v3_guest APIで一括取得（レート制限に強い）
 * - Phase 2: FORBIDDEN動画のみgetthumbinfo APIで取得（HARMFUL_VIDEO対応）
 *
 * これは「フォールバック」ではなく「使い分け」:
 * - 事前判定による振り分け
 * - 各動画は1つのAPIでのみ取得
 * - 明確な責務分離
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
 * タグ取得結果
 */
interface TagFetchResult {
  videoId: string
  tags: TagDetail[]
  source: 'v3_guest' | 'getthumbinfo'
  errorCode?: string
}

/**
 * v3_guest APIを使用してタグを取得
 */
async function fetchTagsFromV3Guest(videoId: string): Promise<{
  tags: TagDetail[]
  errorCode?: string
}> {
  const actionTrackId = `${generateRandomId()}_${Date.now()}`

  try {
    const response = await fetch(
      `https://www.nicovideo.jp/api/watch/v3_guest/${videoId}?actionTrackId=${actionTrackId}`,
      {
        headers: {
          'X-Frontend-Id': '6',
          'X-Frontend-Version': '0',
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
        }
      }
    )

    if (!response.ok) {
      // エラーコードを取得
      let errorCode = 'UNKNOWN'
      try {
        const errorData = await response.json()
        errorCode = errorData?.meta?.errorCode || errorData?.data?.reasonCode || 'UNKNOWN'
      } catch {
        // ignore
      }

      return { tags: [], errorCode }
    }

    const data = await response.json()
    const tagItems = data?.data?.tag?.items || []

    return {
      tags: tagItems.map((item: any) => ({
        name: item.name,
        isLocked: item.isLocked ?? false
      }))
    }
  } catch (error) {
    console.warn(`[v3_guest] Error for ${videoId}:`, error instanceof Error ? error.message : 'Unknown')
    return { tags: [], errorCode: 'NETWORK_ERROR' }
  }
}

/**
 * getthumbinfo APIを使用してタグを取得
 */
async function fetchTagsFromGetThumbInfo(videoId: string): Promise<{
  tags: TagDetail[]
  errorCode?: string
}> {
  try {
    const response = await fetch(`https://ext.nicovideo.jp/api/getthumbinfo/${videoId}`)

    if (!response.ok) {
      return { tags: [], errorCode: `HTTP_${response.status}` }
    }

    const xml = await response.text()

    if (xml.includes('status="fail"')) {
      return { tags: [], errorCode: 'API_FAIL' }
    }

    // タグを抽出
    const tags: TagDetail[] = []
    const tagMatches = xml.matchAll(/<tag(\s+lock="1")?[^>]*>([^<]+)<\/tag>/g)

    for (const match of tagMatches) {
      tags.push({
        name: match[2],
        isLocked: match[1] !== undefined
      })
    }

    return { tags }
  } catch (error) {
    console.warn(`[getthumbinfo] Error for ${videoId}:`, error instanceof Error ? error.message : 'Unknown')
    return { tags: [], errorCode: 'NETWORK_ERROR' }
  }
}

function generateRandomId(): string {
  return Math.random().toString(36).substring(2, 12)
}

/**
 * ハイブリッド方式でタグを取得
 *
 * @param items ランキングアイテムの配列
 * @param options オプション設定
 * @returns タグ詳細が追加されたアイテムの配列
 */
export async function enrichRankingItemsWithTagDetailsHybrid(
  items: RankingItem[],
  options: {
    v3GuestParallelCount?: number
    v3GuestBatchDelay?: number
    getThumbInfoParallelCount?: number
    getThumbInfoBatchDelay?: number
  } = {}
): Promise<(RankingItem & { tagDetails?: TagDetail[] })[]> {
  const {
    v3GuestParallelCount = 20,
    v3GuestBatchDelay = 100,
    getThumbInfoParallelCount = 5,
    getThumbInfoBatchDelay = 500
  } = options

  const totalItems = items.length
  const startTime = Date.now()

  // 結果とFORBIDDEN動画のリスト
  const results: Map<string, TagFetchResult> = new Map()
  const forbiddenVideoIds: string[] = []

  // ===== Phase 1: v3_guest APIで一括取得 =====
  // eslint-disable-next-line no-console
  console.log(`[Hybrid Tag Fetch] Phase 1: v3_guest API (${totalItems} items)`)

  for (let i = 0; i < items.length; i += v3GuestParallelCount) {
    const batch = items.slice(i, i + v3GuestParallelCount)

    const batchResults = await Promise.all(
      batch.map(async (item) => {
        // 既にタグがある場合はスキップ
        if (item.tags && item.tags.length > 0 && (item as any).tagDetails) {
          return {
            videoId: item.id,
            tags: (item as any).tagDetails,
            source: 'v3_guest' as const
          }
        }

        const result = await fetchTagsFromV3Guest(item.id)

        if (result.errorCode === 'FORBIDDEN' || result.errorCode === 'HARMFUL_VIDEO' ||
            result.errorCode === 'NOT_FOUND' || result.errorCode === 'DELETED') {
          // Phase 2で処理するため記録
          forbiddenVideoIds.push(item.id)
          return null
        }

        return {
          videoId: item.id,
          tags: result.tags,
          source: 'v3_guest' as const,
          errorCode: result.tags.length === 0 ? result.errorCode : undefined
        }
      })
    )

    for (const result of batchResults) {
      if (result) {
        results.set(result.videoId, result)
      }
    }

    // 進捗表示（20%ごと）
    const processed = Math.min(i + v3GuestParallelCount, totalItems)
    const progress = Math.floor((processed / totalItems) * 5) * 20
    if (progress > 0 && processed % Math.floor(totalItems / 5) < v3GuestParallelCount) {
      // eslint-disable-next-line no-console
      console.log(
        `[Phase 1] ${progress}% complete (${processed}/${totalItems}), ` +
        `FORBIDDEN: ${forbiddenVideoIds.length}`
      )
    }

    // バッチ間遅延
    if (i + v3GuestParallelCount < items.length) {
      await new Promise(resolve => setTimeout(resolve, v3GuestBatchDelay))
    }
  }

  const v3GuestTime = Date.now() - startTime
  const v3GuestSuccess = results.size

  // eslint-disable-next-line no-console
  console.log(
    `[Phase 1] Completed: ${v3GuestSuccess}/${totalItems} items in ${(v3GuestTime / 1000).toFixed(1)}s, ` +
    `FORBIDDEN: ${forbiddenVideoIds.length}`
  )

  // ===== Phase 2: FORBIDDEN動画のみgetthumbinfo APIで取得 =====
  if (forbiddenVideoIds.length > 0) {
    // eslint-disable-next-line no-console
    console.log(`[Hybrid Tag Fetch] Phase 2: getthumbinfo API (${forbiddenVideoIds.length} FORBIDDEN items)`)

    const phase2Start = Date.now()
    let phase2Success = 0

    for (let i = 0; i < forbiddenVideoIds.length; i += getThumbInfoParallelCount) {
      const batch = forbiddenVideoIds.slice(i, i + getThumbInfoParallelCount)

      const batchResults = await Promise.all(
        batch.map(async (videoId) => {
          const result = await fetchTagsFromGetThumbInfo(videoId)

          if (result.tags.length > 0) {
            phase2Success++
          }

          return {
            videoId,
            tags: result.tags,
            source: 'getthumbinfo' as const,
            errorCode: result.tags.length === 0 ? result.errorCode : undefined
          }
        })
      )

      for (const result of batchResults) {
        results.set(result.videoId, result)
      }

      // バッチ間遅延（レート制限対策）
      if (i + getThumbInfoParallelCount < forbiddenVideoIds.length) {
        await new Promise(resolve => setTimeout(resolve, getThumbInfoBatchDelay))
      }
    }

    const phase2Time = Date.now() - phase2Start
    // eslint-disable-next-line no-console
    console.log(
      `[Phase 2] Completed: ${phase2Success}/${forbiddenVideoIds.length} items in ${(phase2Time / 1000).toFixed(1)}s`
    )
  }

  // ===== 結果をマージ =====
  const enrichedItems = items.map(item => {
    const fetchResult = results.get(item.id)

    if (!fetchResult || fetchResult.tags.length === 0) {
      // タグ取得失敗 → 既存データを保持
      return item
    }

    return {
      ...item,
      tagDetails: fetchResult.tags,
      tags: fetchResult.tags.map(t => t.name)
    }
  })

  // 統計
  const totalTime = Date.now() - startTime
  const itemsWithTags = enrichedItems.filter(item => (item as any).tagDetails?.length > 0).length

  // eslint-disable-next-line no-console
  console.log(
    `[Hybrid Tag Fetch] Final: ${itemsWithTags}/${totalItems} items with tags ` +
    `(${Math.round(itemsWithTags / totalItems * 100)}%) in ${(totalTime / 1000).toFixed(1)}s`
  )

  return enrichedItems
}

// 後方互換性のためのエクスポート
export { enrichRankingItemsWithTagDetailsHybrid as enrichRankingItemsWithTagDetails }
