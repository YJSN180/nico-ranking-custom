// 各ジャンルの人気タグ
// 動的取得が失敗した場合のフォールバック用
// 最新のデータはgetPopularTags関数で取得すること

import { kv } from '@vercel/kv'
import { fetchRanking } from './complete-hybrid-scraper'
import { GENRE_ID_MAP } from './genre-mapping'
import type { RankingGenre } from '../types/ranking-config'

// KVキャッシュのキープレフィックス
const POPULAR_TAGS_KEY_PREFIX = 'popular-tags:'
const POPULAR_TAGS_TTL = 3600 // 1時間

// ジャンルの人気タグを取得（キャッシュ付き）
export async function getPopularTags(genre: RankingGenre): Promise<string[]> {
  const cacheKey = `${POPULAR_TAGS_KEY_PREFIX}${genre}`
  
  try {
    // 1. まずGitHub Actionsが保存したランキングデータから取得
    if (typeof kv !== 'undefined') {
      const rankingKey = `ranking-${genre}`
      const rankingData = await kv.get<{
        items: any[]
        popularTags: string[]
        updatedAt: string
      }>(rankingKey)
      
      if (rankingData && rankingData.popularTags && rankingData.popularTags.length > 0) {
        // 取得できたら返す
        return rankingData.popularTags
      }
    }
  } catch (error) {
    console.error('Failed to get popular tags from ranking data:', error)
  }
  
  try {
    // 2. KVキャッシュから取得を試みる
    if (typeof kv !== 'undefined') {
      const cached = await kv.get<string[]>(cacheKey)
      if (cached && Array.isArray(cached)) {
        return cached
      }
    }
  } catch (error) {
    console.error('Failed to get popular tags from cache:', error)
  }
  
  try {
    // 3. 動的に人気タグを取得（フォールバック）
    const data = await fetchRanking(genre, null, '24h')
    
    if (data.popularTags && data.popularTags.length > 0) {
      // KVにキャッシュ
      if (typeof kv !== 'undefined') {
        try {
          await kv.set(cacheKey, data.popularTags, { ex: POPULAR_TAGS_TTL })
        } catch (error) {
          console.error('Failed to cache popular tags:', error)
        }
      }
      
      return data.popularTags
    }
  } catch (error) {
    console.error('Failed to fetch popular tags dynamically:', error)
  }
  
  // 4. 最終フォールバック：空配列を返す
  return []
}