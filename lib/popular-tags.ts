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
      console.error('Failed to aggregate popular tags for all genre:', error)
      return []
    }
  }
  
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
  
  // 4. バックアップデータから取得を試みる
  try {
    if (typeof kv !== 'undefined') {
      const now = new Date()
      
      // 現在時刻から過去7日間のバックアップを探す
      for (let daysAgo = 0; daysAgo < 7; daysAgo++) {
        const checkDate = new Date(now.getTime() - daysAgo * 24 * 60 * 60 * 1000)
        
        // 4時間ごとのバックアップ時刻（0, 4, 8, 12, 16, 20）
        const backupHours = [20, 16, 12, 8, 4, 0]
        
        for (const hour of backupHours) {
          // 未来の時刻はスキップ
          if (daysAgo === 0 && hour > now.getHours()) continue
          
          const backupKey = `popular-tags-backup:${checkDate.getFullYear()}-${String(checkDate.getMonth() + 1).padStart(2, '0')}-${String(checkDate.getDate()).padStart(2, '0')}:${String(hour).padStart(2, '0')}`
          
          const backupData = await kv.get(backupKey) as Record<string, string[]> | null
          
          if (backupData && backupData[genre] && Array.isArray(backupData[genre]) && backupData[genre].length > 0) {
            // バックアップから取得できた
            return backupData[genre]
          }
        }
      }
    }
  } catch (error) {
    console.error('Failed to get popular tags from backup:', error)
  }
  
  // 5. 最終フォールバック：空配列を返す
  return []
}

// 個別ジャンルの人気タグを取得（内部用、allジャンルの集計で使用）
async function getPopularTagsForGenre(genre: RankingGenre, period: '24h' | 'hour' = '24h'): Promise<string[]> {
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
  
  // 4. バックアップデータから取得を試みる
  try {
    if (typeof kv !== 'undefined') {
      const now = new Date()
      
      // 現在時刻から過去7日間のバックアップを探す
      for (let daysAgo = 0; daysAgo < 7; daysAgo++) {
        const checkDate = new Date(now.getTime() - daysAgo * 24 * 60 * 60 * 1000)
        
        // 4時間ごとのバックアップ時刻（0, 4, 8, 12, 16, 20）
        const backupHours = [20, 16, 12, 8, 4, 0]
        
        for (const hour of backupHours) {
          // 未来の時刻はスキップ
          if (daysAgo === 0 && hour > now.getHours()) continue
          
          const backupKey = `popular-tags-backup:${checkDate.getFullYear()}-${String(checkDate.getMonth() + 1).padStart(2, '0')}-${String(checkDate.getDate()).padStart(2, '0')}:${String(hour).padStart(2, '0')}`
          
          const backupData = await kv.get(backupKey) as Record<string, string[]> | null
          
          if (backupData && backupData[genre] && Array.isArray(backupData[genre]) && backupData[genre].length > 0) {
            // バックアップから取得できた
            return backupData[genre]
          }
        }
      }
    }
  } catch (error) {
    console.error('Failed to get popular tags from backup:', error)
  }
  
  // 5. 最終フォールバック：空配列を返す
  return []
}