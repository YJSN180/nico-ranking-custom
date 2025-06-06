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
export async function getPopularTags(genre: RankingGenre, period: '24h' | 'hour' = '24h'): Promise<string[]> {
  const cacheKey = `${POPULAR_TAGS_KEY_PREFIX}${genre}-${period}`
  
  try {
    // 1. まずGitHub Actionsが保存したランキングデータから取得
    if (typeof kv !== 'undefined') {
      // period付きのキーで取得を試みる
      const rankingKey = `ranking-${genre}-${period}`
      const rankingData = await kv.get<{
        items: any[]
        popularTags: string[]
        updatedAt: string
      }>(rankingKey)
      
      if (rankingData && rankingData.popularTags && rankingData.popularTags.length > 0) {
        // 取得できたら返す
        return rankingData.popularTags
      }
      
      // 24hの場合は後方互換性のため旧形式のキーも試す
      if (period === '24h') {
        const legacyKey = `ranking-${genre}`
        const legacyData = await kv.get<{
          items: any[]
          popularTags: string[]
          updatedAt: string
        }>(legacyKey)
        
        if (legacyData && legacyData.popularTags && legacyData.popularTags.length > 0) {
          return legacyData.popularTags
        }
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
    const data = await fetchRanking(genre, null, period)
    
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