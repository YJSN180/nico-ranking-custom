// Client-side popular tags fetching
import type { RankingGenre, RankingPeriod } from '@/types/ranking-config'
import { requestThrottle } from './request-throttle'

// Worker URLを環境変数から取得（本番環境では直接Worker呼び出し）
const getApiUrl = () => {
  // 本番環境: Cloudflare Worker直接
  // 開発/プレビュー環境: Vercel Function経由
  if (typeof window !== 'undefined') {
    const isProduction = window.location.hostname === 'nico-rank.com'
    if (isProduction) {
      return 'https://nico-rank.com/api/popular-tags'
    }
  }
  // 開発/プレビュー環境はVercel Function経由
  return '/api/popular-tags'
}

/**
 * クライアントサイドから人気タグを取得
 * 本番環境では直接Worker呼び出し、開発環境ではVercel Function経由
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

    const baseUrl = getApiUrl()
    const apiUrl = `${baseUrl}?${params.toString()}`
    
    // Apply client-side rate limiting
    await requestThrottle.throttle(apiUrl)

    // 統一圧縮対応 + CORS対応
    const response = await fetch(apiUrl, {
      signal,
      mode: 'cors',
      credentials: 'omit' // CORSでcookie不要
    })
    
    if (!response.ok) {
      throw new Error(`Failed to fetch popular tags: ${response.status}`)
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