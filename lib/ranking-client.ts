// Client-side ranking data fetching with direct Worker support
import type { RankingGenre, RankingPeriod } from '@/types/ranking-config'
import type { RankingData } from '@/types/ranking'
import { requestThrottle } from './request-throttle'

// Worker URLを環境に応じて切り替え
const getApiUrl = () => {
  if (typeof window !== 'undefined') {
    const isProduction = window.location.hostname === 'nico-rank.com'
    if (isProduction) {
      // 本番環境: Cloudflare Worker直接
      return 'https://nico-rank.com/api/ranking'
    }
  }
  // 開発/プレビュー環境: Vercel Function経由（プロキシ）
  return '/api/ranking'
}

/**
 * クライアントサイドからランキングデータを取得
 * 本番環境では直接Worker呼び出し、開発環境ではVercel Function経由
 * @param genre ジャンル
 * @param period 期間
 * @param tag タグ（オプション）
 * @param signal AbortSignal（オプション）
 */
export async function getRankingDataClient(
  genre: RankingGenre = 'all',
  period: RankingPeriod = '24h',
  tag?: string,
  signal?: AbortSignal
): Promise<RankingData | null> {
  try {
    const params = new URLSearchParams({
      genre,
      period
    })
    if (tag) {
      params.set('tag', tag)
    }

    const baseUrl = getApiUrl()
    const apiUrl = `${baseUrl}?${params.toString()}`

    // Apply client-side rate limiting
    await requestThrottle.throttle(apiUrl)

    // Fetch with CORS support
    const response = await fetch(apiUrl, {
      signal,
      mode: 'cors',
      credentials: 'omit',
      headers: {
        'Accept': 'application/json',
        'Accept-Encoding': 'gzip, deflate, br'
      }
    })

    // Handle 304 Not Modified
    if (response.status === 304) {
      return null // キャッシュを使用
    }

    if (!response.ok) {
      throw new Error(`Failed to fetch ranking data: ${response.status}`)
    }

    const data = await response.json()
    return data as RankingData
  } catch (error: any) {
    // AbortErrorは正常なキャンセル
    if (error.name === 'AbortError') {
      return null
    }
    console.error('[Ranking Client] Error:', error)
    return null
  }
}

/**
 * サムネイルURLを取得（Worker直接呼び出し）
 * @param videoId 動画ID
 * @param type サムネイルタイプ
 */
export async function getThumbnailUrl(
  videoId: string,
  type: 'proxy' | 'hd' = 'proxy'
): Promise<string | null> {
  try {
    const isProduction = typeof window !== 'undefined' && window.location.hostname === 'nico-rank.com'

    // 本番環境: Worker直接
    if (isProduction) {
      const workerUrl = type === 'hd'
        ? `https://nico-ranking-hd-thumbnail.yjsn180180.workers.dev/${videoId}`
        : `https://nico-ranking-thumbnail-proxy.yjsn180180.workers.dev/${videoId}`

      const response = await fetch(workerUrl, {
        mode: 'cors',
        credentials: 'omit'
      })

      if (response.ok) {
        const data = await response.json()
        return data.url || null
      }
    } else {
      // 開発環境: Vercel Function経由
      const apiPath = type === 'hd' ? '/api/hd-thumbnail' : '/api/thumbnail-proxy'
      const response = await fetch(`${apiPath}/${videoId}`)

      if (response.ok) {
        const data = await response.json()
        return data.url || null
      }
    }

    return null
  } catch (error) {
    console.error('[Thumbnail Client] Error:', error)
    return null
  }
}

/**
 * タグオートコンプリート（Worker直接呼び出し）
 * @param query 検索クエリ
 * @param genre ジャンル
 * @param limit 取得数
 */
export async function getTagAutocomplete(
  query: string,
  genre: RankingGenre = 'all',
  limit: number = 10
): Promise<string[]> {
  try {
    if (query.length < 2) {
      return []
    }

    const params = new URLSearchParams({
      q: query,
      genre,
      limit: limit.toString()
    })

    const isProduction = typeof window !== 'undefined' && window.location.hostname === 'nico-rank.com'

    // 本番環境: Worker直接
    const apiUrl = isProduction
      ? `https://nico-rank.com/api/tags/autocomplete?${params.toString()}`
      : `/api/tags/autocomplete?${params.toString()}`

    const response = await fetch(apiUrl, {
      mode: 'cors',
      credentials: 'omit'
    })

    if (response.ok) {
      const data = await response.json()
      return data.suggestions || []
    }

    return []
  } catch (error) {
    console.error('[Tag Autocomplete] Error:', error)
    return []
  }
}