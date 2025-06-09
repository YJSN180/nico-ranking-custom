// 各ジャンルの人気タグ
// 動的取得が失敗した場合のフォールバック用
// 最新のデータはgetPopularTags関数で取得すること

import { fetchRanking } from './complete-hybrid-scraper'
import type { RankingGenre } from '../types/ranking-config'

// メモリキャッシュ
const popularTagsCache = new Map<string, { tags: string[], timestamp: number }>()
const CACHE_TTL = 3600000 // 1時間

// ジャンルの人気タグを取得
export async function getPopularTags(genre: RankingGenre, period: '24h' | 'hour' = '24h'): Promise<string[]> {
  const cacheKey = `${genre}-${period}`
  
  // メモリキャッシュから取得
  const cached = popularTagsCache.get(cacheKey)
  if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
    return cached.tags
  }
  
  try {
    // 動的に人気タグを取得
    const data = await fetchRanking(genre, null, period)
    
    if (data.popularTags && data.popularTags.length > 0) {
      // メモリキャッシュに保存
      popularTagsCache.set(cacheKey, {
        tags: data.popularTags,
        timestamp: Date.now()
      })
      
      return data.popularTags
    }
  } catch (error) {
    console.error('Failed to fetch popular tags dynamically:', error)
  }
  
  // フォールバック：空配列を返す
  return []
}

// 人気タグデータのフォールバック（使用されない）
export const POPULAR_TAGS_DATA: Record<RankingGenre, string[]> = {
  all: [],
  game: [],
  anime: [],
  vocaloid: [],
  voicesynthesis: [],
  entertainment: [],
  music: [],
  sing: [],
  dance: [],
  play: [],
  commentary: [],
  cooking: [],
  travel: [],
  nature: [],
  vehicle: [],
  technology: [],
  society: [],
  mmd: [],
  vtuber: [],
  radio: [],
  sports: [],
  animal: [],
  other: []
}