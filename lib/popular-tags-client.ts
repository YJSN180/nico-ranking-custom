// Client-side popular tags fetching
import type { RankingGenre, RankingPeriod } from '@/types/ranking-config'

/**
 * クライアントサイドから人気タグを取得
 * APIエンドポイント経由で取得することで環境変数の問題を回避
 */
export async function getPopularTagsClient(
  genre: RankingGenre, 
  period: RankingPeriod = '24h'
): Promise<string[]> {
  try {
    const params = new URLSearchParams({
      genre,
      period
    })
    
    const response = await fetch(`/api/popular-tags?${params.toString()}`)
    if (!response.ok) {
      return []
    }
    
    const data = await response.json()
    return data.tags || []
  } catch (error) {
    // エラー時は空配列を返す
    return []
  }
}