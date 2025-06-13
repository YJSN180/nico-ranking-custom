// 各ジャンルの人気タグ
// 動的取得が失敗した場合のフォールバック用
// 最新のデータはgetPopularTags関数で取得すること

import { fetchRanking } from './complete-hybrid-scraper'
import { getGenreRanking } from './cloudflare-kv'
import { GENRE_ID_MAP } from './genre-mapping'
import type { RankingGenre } from '../types/ranking-config'

// ジャンルの人気タグを取得（キャッシュ付き）
export async function getPopularTags(genre: RankingGenre, period: '24h' | 'hour' = '24h'): Promise<string[]> {
  // 「すべて」ジャンルの場合は、他のジャンルから人気タグを集計
  if (genre === 'all') {
    try {
      const genres: RankingGenre[] = ['game', 'anime', 'entertainment', 'technology', 'voicesynthesis', 'other']
      const tagCountMap = new Map<string, number>()
      
      // 各ジャンルの人気タグを取得して集計
      for (const g of genres) {
        const tags = await getPopularTagsForGenre(g, period)
        tags.forEach((tag, index) => {
          // 順位が高いタグほど高いスコアを付与（15位から1位へ）
          const score = tags.length - index
          tagCountMap.set(tag, (tagCountMap.get(tag) || 0) + score)
        })
      }
      
      // スコア順にソートして上位15個を返す
      const sortedTags = Array.from(tagCountMap.entries())
        .sort((a, b) => b[1] - a[1])
        .slice(0, 15)
        .map(([tag]) => tag)
      
      return sortedTags
    } catch (error) {
      // Failed to aggregate popular tags for all genre - returning empty array
      return []
    }
  }
  
  try {
    // 1. Cloudflare KVから取得を試みる
    const cfData = await getGenreRanking(genre, period)
    if (cfData && cfData.popularTags && cfData.popularTags.length > 0) {
      return cfData.popularTags
    }
  } catch (error) {
    // Failed to get popular tags from Cloudflare KV - trying fallback
  }
  
  try {
    // 2. 動的に人気タグを取得（フォールバック）
    const data = await fetchRanking(genre, null, period)
    
    if (data.popularTags && data.popularTags.length > 0) {
      return data.popularTags
    }
  } catch (error) {
    // Failed to fetch popular tags dynamically - returning empty array
  }
  
  // 3. 最終フォールバック：空配列を返す
  return []
}

// 個別ジャンルの人気タグを取得（内部用、allジャンルの集計で使用）
async function getPopularTagsForGenre(genre: RankingGenre, period: '24h' | 'hour' = '24h'): Promise<string[]> {
  try {
    // 1. Cloudflare KVから取得を試みる
    const cfData = await getGenreRanking(genre, period)
    if (cfData && cfData.popularTags && cfData.popularTags.length > 0) {
      return cfData.popularTags
    }
  } catch (error) {
    // Failed to get popular tags from Cloudflare KV - trying fallback
  }
  
  try {
    // 2. 動的に人気タグを取得（フォールバック）
    const data = await fetchRanking(genre, null, period)
    
    if (data.popularTags && data.popularTags.length > 0) {
      return data.popularTags
    }
  } catch (error) {
    // Failed to fetch popular tags dynamically - returning empty array
  }
  
  // 3. 最終フォールバック：空配列を返す
  return []
}