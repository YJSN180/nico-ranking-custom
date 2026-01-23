/**
 * タグ取得モジュール（getthumbinfo専用・レート制限対策強化版）
 *
 * 全動画をgetthumbinfo APIで取得:
 * - 保守的なデフォルト値（1並列 + 3000ms遅延 = 0.33 rps = 1200 req/時）
 * - 適応型バックオフ（403検出で自動減速、成功連続で回復）
 * - 指数バックオフ + ジッター + リトライ
 * - 環境変数による設定オーバーライド
 *
 * 注: ファイル名は後方互換性のため tag-fetcher-hybrid.ts のまま
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
  errorCode?: string
}

/**
 * 適応型レートリミッター設定
 */
interface AdaptiveRateLimiterConfig {
  baseDelayMs: number
  maxDelayMs: number
  maxRetries: number
  jitterRatio: number
  cooldownMs: number
  minParallel: number
  maxParallel: number
}

/**
 * 適応型レートリミッター
 * 403検出時に自動で並列数・遅延を調整し、成功連続で回復
 */
class AdaptiveRateLimiter {
  private currentParallel: number
  private currentDelayMs: number
  private consecutiveSuccess = 0
  private consecutiveRateLimited = 0
  private lastCooldownAt = 0
  private totalRateLimited = 0

  constructor(private config: AdaptiveRateLimiterConfig) {
    this.currentParallel = config.maxParallel
    this.currentDelayMs = config.baseDelayMs
  }

  getParallel(): number {
    return this.currentParallel
  }

  getDelayMs(): number {
    return this.currentDelayMs
  }

  getTotalRateLimited(): number {
    return this.totalRateLimited
  }

  onSuccess(): void {
    this.consecutiveSuccess += 1
    this.consecutiveRateLimited = 0

    // 10回連続成功で回復（ゆっくり）
    if (this.consecutiveSuccess >= 10) {
      this.currentParallel = Math.min(this.currentParallel + 1, this.config.maxParallel)
      this.currentDelayMs = Math.max(
        Math.floor(this.currentDelayMs * 0.9),
        this.config.baseDelayMs
      )
      this.consecutiveSuccess = 0
      console.log(`[AdaptiveRateLimiter] Recovery: parallel=${this.currentParallel}, delay=${this.currentDelayMs}ms`)
    }
  }

  onRateLimited(): void {
    this.consecutiveSuccess = 0
    this.consecutiveRateLimited += 1
    this.totalRateLimited += 1

    // 並列数を30%減、遅延を70%増
    this.currentParallel = Math.max(
      Math.floor(this.currentParallel * 0.7),
      this.config.minParallel
    )
    this.currentDelayMs = Math.min(
      Math.floor(this.currentDelayMs * 1.7),
      this.config.maxDelayMs
    )

    console.log(
      `[AdaptiveRateLimiter] Rate limited! Adjusting: parallel=${this.currentParallel}, delay=${this.currentDelayMs}ms, ` +
      `consecutive=${this.consecutiveRateLimited}, total=${this.totalRateLimited}`
    )
  }

  async maybeCooldown(): Promise<void> {
    // 連続でレート制限を受けたらクールダウン
    if (this.consecutiveRateLimited >= 3) {
      const now = Date.now()
      if (now - this.lastCooldownAt >= this.config.cooldownMs) {
        console.log(`[AdaptiveRateLimiter] Cooldown for ${this.config.cooldownMs}ms...`)
        this.lastCooldownAt = now
        await new Promise(resolve => setTimeout(resolve, this.config.cooldownMs))
        this.consecutiveRateLimited = 0
      }
    }
  }
}

/**
 * ジッター付き遅延を計算
 */
function withJitter(baseMs: number, ratio: number): number {
  if (ratio <= 0) return baseMs
  const rand = Math.random() * 2 - 1 // -1..1
  return Math.max(0, Math.floor(baseMs * (1 + rand * ratio)))
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

/**
 * getthumbinfo APIをリトライ付きで取得
 */
async function fetchGetThumbInfoWithRetry(
  videoId: string,
  limiter: AdaptiveRateLimiter,
  config: AdaptiveRateLimiterConfig
): Promise<{ tags: TagDetail[]; errorCode?: string }> {
  for (let attempt = 0; attempt <= config.maxRetries; attempt++) {
    const result = await fetchTagsFromGetThumbInfo(videoId)

    if (result.errorCode === 'HTTP_403') {
      limiter.onRateLimited()
      await limiter.maybeCooldown()

      // 指数バックオフ + ジッター
      const waitMs = withJitter(
        Math.min(config.baseDelayMs * Math.pow(2, attempt), config.maxDelayMs),
        config.jitterRatio
      )
      console.log(`[getthumbinfo] 403 for ${videoId}, retry ${attempt + 1}/${config.maxRetries} after ${waitMs}ms`)
      await new Promise(resolve => setTimeout(resolve, waitMs))
      continue
    }

    if (!result.errorCode || result.tags.length > 0) {
      limiter.onSuccess()
      return result
    }

    // 403以外のエラーはリトライせず返す
    return result
  }

  return { tags: [], errorCode: 'HTTP_403_RETRY_EXCEEDED' }
}

/**
 * 環境変数から設定を読み込み（デフォルト値は保守的に設定）
 */
function getConfigFromEnv() {
  return {
    // getthumbinfo API設定（保守的なデフォルト: 0.33 rps = 1200 req/時）
    parallelCount: parseInt(process.env.GETTHUMBINFO_PARALLEL || '1', 10),
    batchDelay: parseInt(process.env.GETTHUMBINFO_DELAY || '3000', 10),

    // 適応型バックオフ設定
    maxRetries: parseInt(process.env.TAG_FETCH_MAX_RETRIES || '3', 10),
    maxDelayMs: parseInt(process.env.TAG_FETCH_MAX_DELAY_MS || '10000', 10),
    cooldownMs: parseInt(process.env.TAG_FETCH_COOLDOWN_MS || '30000', 10),
    jitterRatio: parseFloat(process.env.TAG_FETCH_JITTER_RATIO || '0.3')
  }
}

/**
 * getthumbinfo APIでタグを取得（レート制限対策強化版）
 *
 * @param items ランキングアイテムの配列
 * @param options オプション設定（環境変数でオーバーライド可能）
 * @returns タグ詳細が追加されたアイテムの配列
 */
export async function enrichRankingItemsWithTagDetailsHybrid(
  items: RankingItem[],
  options: {
    v3GuestParallelCount?: number  // 後方互換性のため残す（無視される）
    v3GuestBatchDelay?: number     // 後方互換性のため残す（無視される）
    getThumbInfoParallelCount?: number
    getThumbInfoBatchDelay?: number
  } = {}
): Promise<(RankingItem & { tagDetails?: TagDetail[] })[]> {
  // 環境変数からデフォルト値を取得し、オプションでオーバーライド
  const envConfig = getConfigFromEnv()
  const parallelCount = options.getThumbInfoParallelCount ?? envConfig.parallelCount
  const batchDelay = options.getThumbInfoBatchDelay ?? envConfig.batchDelay

  const totalItems = items.length
  const startTime = Date.now()

  // 設定をログ出力
  console.log(
    `[Tag Fetch] Config: getthumbinfo=${parallelCount}p/${batchDelay}ms ` +
    `(${(parallelCount / (batchDelay / 1000)).toFixed(2)} rps = ${Math.floor(parallelCount / (batchDelay / 1000) * 3600)} req/h)`
  )

  // 結果
  const results: Map<string, TagFetchResult> = new Map()

  // 適応型レートリミッターを初期化
  const limiterConfig: AdaptiveRateLimiterConfig = {
    baseDelayMs: batchDelay,
    maxDelayMs: envConfig.maxDelayMs,
    maxRetries: envConfig.maxRetries,
    jitterRatio: envConfig.jitterRatio,
    cooldownMs: envConfig.cooldownMs,
    minParallel: 1,
    maxParallel: parallelCount
  }
  const limiter = new AdaptiveRateLimiter(limiterConfig)

  console.log(`[Tag Fetch] Processing ${totalItems} items with getthumbinfo API`)

  // 動的並列数で処理
  let processed = 0
  let successCount = 0

  while (processed < totalItems) {
    const currentParallel = limiter.getParallel()
    const batch = items.slice(processed, processed + currentParallel)

    const batchResults = await Promise.all(
      batch.map(async (item) => {
        // 既にタグがある場合はスキップ
        if (item.tags && item.tags.length > 0 && (item as any).tagDetails) {
          return {
            videoId: item.id,
            tags: (item as any).tagDetails as TagDetail[],
            skipped: true
          }
        }

        const result = await fetchGetThumbInfoWithRetry(item.id, limiter, limiterConfig)
        return {
          videoId: item.id,
          tags: result.tags,
          errorCode: result.errorCode,
          skipped: false
        }
      })
    )

    for (const result of batchResults) {
      if (result.tags.length > 0) {
        successCount++
      }
      results.set(result.videoId, {
        videoId: result.videoId,
        tags: result.tags,
        errorCode: result.errorCode
      })
    }

    processed += currentParallel

    // 進捗表示（10%ごと）
    const progressPct = Math.floor((processed / totalItems) * 10) * 10
    if (processed % Math.max(1, Math.floor(totalItems / 10)) < currentParallel) {
      const elapsed = ((Date.now() - startTime) / 1000).toFixed(1)
      console.log(
        `[Tag Fetch] ${progressPct}% (${processed}/${totalItems}), ` +
        `success=${successCount}, 403s=${limiter.getTotalRateLimited()}, ` +
        `rate=${limiter.getParallel()}p/${limiter.getDelayMs()}ms [${elapsed}s]`
      )
    }

    // バッチ間遅延（適応型）
    if (processed < totalItems) {
      const delayMs = withJitter(limiter.getDelayMs(), limiterConfig.jitterRatio)
      await new Promise(resolve => setTimeout(resolve, delayMs))
    }
  }

  // 結果をマージ
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

  console.log(
    `[Tag Fetch] Final: ${itemsWithTags}/${totalItems} items with tags ` +
    `(${Math.round(itemsWithTags / totalItems * 100)}%) in ${(totalTime / 1000).toFixed(1)}s, ` +
    `total 403s: ${limiter.getTotalRateLimited()}`
  )

  return enrichedItems
}

// 後方互換性のためのエクスポート
export { enrichRankingItemsWithTagDetailsHybrid as enrichRankingItemsWithTagDetails }
