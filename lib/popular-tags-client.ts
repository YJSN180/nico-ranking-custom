// Client-side popular tags fetching
import type { RankingGenre, RankingPeriod } from '@/types/ranking-config'
import { requestThrottle } from './request-throttle'

/**
 * クライアントサイドから人気タグを取得
 * APIエンドポイント経由で取得することで環境変数の問題を回避
 * @param genre ジャンル
 * @param period 期間
 * @param signal AbortSignal（オプション）- リクエストキャンセル用
 */
export async function getPopularTagsClient(
  genre: RankingGenre, 
  period: RankingPeriod = '24h',
  signal?: AbortSignal
): Promise<string[]> {
  try {
    const params = new URLSearchParams({
      genre,
      period
    })
    
    const apiUrl = `/api/edge/popular-tags?${params.toString()}`
    
    // Apply client-side rate limiting
    await requestThrottle.throttle(apiUrl)
    
    const response = await fetch(apiUrl, {
      signal
    })
    if (!response.ok) {
      return []
    }
    
    const data = await response.json()
    return data.tags || []
  } catch (error: any) {
    // AbortErrorは正常なキャンセルなので空配列を返す
    if (error.name === 'AbortError') {
      return []
    }
    // その他のエラーも空配列を返す
    return []
  }
}