import type { MylistVideo } from '@/lib/storage/types'

// キャッシュ用のMap（メモリ内キャッシュ）
const availabilityCache = new Map<string, boolean>()

export interface VideoAvailabilityResult {
  videoId: string
  available: boolean
}

export interface CheckOptions {
  useCache?: boolean
  timeout?: number
}

/**
 * 単一の動画の利用可能性を確認
 */
export async function checkVideoAvailability(
  videoId: string, 
  options: CheckOptions = {}
): Promise<VideoAvailabilityResult> {
  const { useCache = false, timeout = 5000 } = options

  // キャッシュを使用する場合
  if (useCache && availabilityCache.has(videoId)) {
    return {
      videoId,
      available: availabilityCache.get(videoId)!,
    }
  }

  try {
    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), timeout)

    const response = await fetch(`https://www.nicovideo.jp/watch/${videoId}`, {
      method: 'HEAD',
      signal: controller.signal,
    })

    clearTimeout(timeoutId)

    const available = response.ok && response.status === 200

    // キャッシュに保存
    if (useCache) {
      availabilityCache.set(videoId, available)
    }

    return {
      videoId,
      available,
    }
  } catch (error) {
    // ネットワークエラーやタイムアウトの場合
    return {
      videoId,
      available: false,
    }
  }
}

/**
 * 複数の動画の削除状態を一括確認
 * @param videos マイリスト動画の配列
 * @param batchSize バッチサイズ（デフォルト: 5）
 * @returns 動画IDをキー、利用可能性を値とするオブジェクト
 */
export async function detectDeletedVideos(
  videos: MylistVideo[],
  batchSize: number = 5
): Promise<Record<string, boolean>> {
  if (videos.length === 0) {
    return {}
  }

  const results: Record<string, boolean> = {}
  
  // バッチ処理
  for (let i = 0; i < videos.length; i += batchSize) {
    const batch = videos.slice(i, i + batchSize)
    const batchPromises = batch.map(video => 
      checkVideoAvailability(video.id, { useCache: true })
    )
    
    const batchResults = await Promise.all(batchPromises)
    
    batchResults.forEach(result => {
      results[result.videoId] = result.available
    })
  }

  return results
}

/**
 * キャッシュをクリア
 */
export function clearAvailabilityCache(): void {
  availabilityCache.clear()
}