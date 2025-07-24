/**
 * タグ候補を管理するフック
 */

import { useState, useEffect, useCallback, useMemo } from 'react'
import type { TagSuggestion, TagCache } from '@/types/custom-tag-ranking'
import { TAG_CACHE_KEY_PREFIX, TAG_CACHE_TTL } from '@/types/custom-tag-ranking'
import type { RankingGenre, RankingPeriod } from '@/types/ranking-config'
import { useRankingData } from '@/hooks/use-ranking-data'
import { extractUniqueTags } from '@/lib/filter-with-custom-tags'
import { getPopularTagsClient } from '@/lib/popular-tags-client'

/**
 * タグ候補を取得・管理するフック
 */
export function useTagSuggestions(
  genre: RankingGenre,
  period: RankingPeriod
) {
  const [suggestions, setSuggestions] = useState<TagSuggestion[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [popularTags, setPopularTags] = useState<string[]>([])
  
  // 現在のランキングデータを取得
  const { fullRankingData } = useRankingData({
    initialData: { items: [], popularTags: [] },
    ngList: {
      videoIds: [],
      authorIds: [],
      videoTitles: { exact: [], partial: [] },
      authorNames: { exact: [], partial: [] }
    },
    ngListVersion: '0'
  })

  // キャッシュキー
  const cacheKey = `${TAG_CACHE_KEY_PREFIX}-${genre}-${period}`

  /**
   * タグ候補をキャッシュから読み込む
   */
  const loadFromCache = useCallback((): TagCache | null => {
    try {
      const cached = localStorage.getItem(cacheKey)
      if (!cached) return null
      
      const parsed = JSON.parse(cached) as TagCache
      
      // キャッシュが有効期限内かチェック
      if (Date.now() - parsed.cachedAt > TAG_CACHE_TTL) {
        localStorage.removeItem(cacheKey)
        return null
      }
      
      return parsed
    } catch {
      return null
    }
  }, [cacheKey])

  /**
   * タグ候補をキャッシュに保存
   */
  const saveToCache = useCallback((tags: TagSuggestion[]) => {
    const cache: TagCache = {
      genre,
      period,
      tags,
      cachedAt: Date.now()
    }
    
    try {
      localStorage.setItem(cacheKey, JSON.stringify(cache))
    } catch (error) {
      console.warn('Failed to cache tag suggestions:', error)
    }
  }, [cacheKey, genre, period])

  /**
   * タグ候補を生成
   */
  const generateSuggestions = useCallback(async () => {
    setIsLoading(true)
    
    try {
      // 1. 人気タグを取得
      const popularTagsList = await getPopularTagsClient(genre, period)
      setPopularTags(popularTagsList)
      
      // 2. ランキングデータからタグを抽出
      const tagCountMap = extractUniqueTags(fullRankingData)
      
      // 3. タグ候補を生成
      const allSuggestions: TagSuggestion[] = []
      
      // 人気タグを優先的に追加
      popularTagsList.forEach(tag => {
        allSuggestions.push({
          name: tag,
          count: tagCountMap.get(tag) || 0,
          isPopular: true
        })
      })
      
      // その他のタグを追加（人気タグ以外）
      tagCountMap.forEach((count, tag) => {
        if (!popularTagsList.includes(tag)) {
          allSuggestions.push({
            name: tag,
            count,
            isPopular: false
          })
        }
      })
      
      // 出現回数順にソート（人気タグを優先）
      allSuggestions.sort((a, b) => {
        if (a.isPopular && !b.isPopular) return -1
        if (!a.isPopular && b.isPopular) return 1
        return b.count - a.count
      })
      
      setSuggestions(allSuggestions)
      saveToCache(allSuggestions)
    } catch (error) {
      console.error('Failed to generate tag suggestions:', error)
      setSuggestions([])
    } finally {
      setIsLoading(false)
    }
  }, [genre, period, fullRankingData, saveToCache])

  // 初期化・データ更新時の処理
  useEffect(() => {
    // キャッシュから読み込み
    const cached = loadFromCache()
    if (cached) {
      setSuggestions(cached.tags)
      return
    }
    
    // キャッシュがない場合は生成
    if (fullRankingData.length > 0) {
      generateSuggestions()
    }
  }, [genre, period, fullRankingData, loadFromCache, generateSuggestions])

  /**
   * 入力に基づいてフィルタリングされた候補を返す
   */
  const getFilteredSuggestions = useCallback((input: string, limit: number = 10): TagSuggestion[] => {
    if (!input.trim()) return suggestions.slice(0, limit)
    
    const normalizedInput = input.toLowerCase()
    
    return suggestions
      .filter(suggestion => 
        suggestion.name.toLowerCase().includes(normalizedInput)
      )
      .slice(0, limit)
  }, [suggestions])

  return {
    suggestions,
    popularTags,
    isLoading,
    getFilteredSuggestions,
    refreshSuggestions: generateSuggestions
  }
}