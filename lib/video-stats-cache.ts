/**
 * 動画統計キャッシュシステム
 * Vercel Edge Config + In-Memory キャッシュによる最適化
 */

interface VideoStats {
  videoId: string
  viewCount: number
  commentCount: number
  likeCount: number
  timestamp: number
}

interface CachedStatsEntry {
  stats: VideoStats
  timestamp: number
}

// In-memory キャッシュ（Function実行間で共有）
const statsCache = new Map<string, CachedStatsEntry>()

// キャッシュ設定
const CACHE_TTL = 5 * 60 * 1000 // 5分
const MAX_CACHE_SIZE = 1000 // 最大1000エントリ

/**
 * KVから動画統計を取得（バックアップ用）
 */
async function getStatsFromKV(videoId: string): Promise<VideoStats | null> {
  try {
    const kvApiUrl = process.env.KV_REST_API_URL
    const kvToken = process.env.KV_REST_API_TOKEN
    
    if (!kvApiUrl || !kvToken) {
      console.warn('[VideoStats] KV credentials not configured')
      return null
    }
    
    const response = await fetch(`${kvApiUrl}/get/VIDEO_STATS_${videoId}`, {
      headers: {
        'Authorization': `Bearer ${kvToken}`,
        'Content-Type': 'application/json'
      },
      next: { revalidate: 300 } // 5分キャッシュ
    })
    
    if (!response.ok) {
      if (response.status === 404) {
        return null // データなし
      }
      throw new Error(`KV API error: ${response.status}`)
    }
    
    const data = await response.json()
    return data.result ? JSON.parse(data.result) : null
    
  } catch (error) {
    console.error('[VideoStats] KV fetch error:', error)
    return null
  }
}

/**
 * Cloudflare Workerから最新統計を取得
 */
async function getStatsFromWorker(videoId: string): Promise<VideoStats | null> {
  try {
    const workerUrl = `https://video-stats-updater.yjsn180180.workers.dev/stats/${videoId}`
    
    const response = await fetch(workerUrl, {
      headers: {
        'X-Worker-Auth': process.env.WORKER_AUTH_KEY || '',
        'Accept': 'application/json'
      },
      next: { revalidate: 300 } // 5分キャッシュ
    })
    
    if (!response.ok) {
      if (response.status === 404) {
        return null
      }
      throw new Error(`Worker API error: ${response.status}`)
    }
    
    return await response.json()
    
  } catch (error) {
    console.error('[VideoStats] Worker fetch error:', error)
    return null
  }
}

/**
 * キャッシュクリーンアップ（LRU風）
 */
function cleanupCache() {
  if (statsCache.size <= MAX_CACHE_SIZE) return
  
  // 古いエントリを削除
  const entries = Array.from(statsCache.entries())
  entries.sort((a, b) => a[1].timestamp - b[1].timestamp)
  
  const toDelete = entries.slice(0, Math.floor(MAX_CACHE_SIZE * 0.2)) // 20%削除
  for (const [key] of toDelete) {
    statsCache.delete(key)
  }
  
  // Cache cleanup completed
}

/**
 * 動画統計を取得（キャッシュ優先）
 */
export async function getVideoStats(videoId: string): Promise<VideoStats | null> {
  const now = Date.now()
  
  // 1. In-memoryキャッシュから確認
  const cached = statsCache.get(videoId)
  if (cached && (now - cached.timestamp) < CACHE_TTL) {
    return cached.stats
  }
  
  // 2. Workerから取得を試行
  let stats = await getStatsFromWorker(videoId)
  
  // 3. Worker失敗時はKVからフォールバック
  if (!stats) {
    stats = await getStatsFromKV(videoId)
  }
  
  // 4. キャッシュに保存
  if (stats) {
    statsCache.set(videoId, {
      stats,
      timestamp: now
    })
    
    // キャッシュサイズ管理
    cleanupCache()
  }
  
  return stats
}

/**
 * 複数動画の統計を並列取得
 */
export async function getBatchVideoStats(videoIds: string[]): Promise<Record<string, VideoStats | null>> {
  const results: Record<string, VideoStats | null> = {}
  
  // 並列処理（最大10並列）
  const BATCH_SIZE = 10
  for (let i = 0; i < videoIds.length; i += BATCH_SIZE) {
    const batch = videoIds.slice(i, i + BATCH_SIZE)
    const promises = batch.map(async (videoId) => {
      const stats = await getVideoStats(videoId)
      return { videoId, stats }
    })
    
    const batchResults = await Promise.all(promises)
    batchResults.forEach(({ videoId, stats }) => {
      results[videoId] = stats
    })
  }
  
  return results
}

/**
 * キャッシュ統計を取得（デバッグ用）
 */
export function getCacheStats() {
  return {
    size: statsCache.size,
    maxSize: MAX_CACHE_SIZE,
    ttl: CACHE_TTL,
    entries: Array.from(statsCache.entries()).map(([key, value]) => ({
      videoId: key,
      age: Date.now() - value.timestamp
    }))
  }
}