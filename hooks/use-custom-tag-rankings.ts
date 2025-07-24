/**
 * カスタムタグランキングの管理フック
 */

import { useState, useEffect, useCallback } from 'react'
import type { CustomTagRanking, CustomTagConditions } from '@/types/custom-tag-ranking'
import { CUSTOM_RANKINGS_STORAGE_KEY } from '@/types/custom-tag-ranking'
import type { RankingGenre, RankingPeriod } from '@/types/ranking-config'

/**
 * カスタムタグランキングを管理するフック
 */
export function useCustomTagRankings() {
  const [rankings, setRankings] = useState<CustomTagRanking[]>([])
  const [isLoading, setIsLoading] = useState(true)

  // 初回ロード
  useEffect(() => {
    loadRankings()
  }, [])

  /**
   * LocalStorageからランキングを読み込む
   */
  const loadRankings = useCallback(() => {
    try {
      const stored = localStorage.getItem(CUSTOM_RANKINGS_STORAGE_KEY)
      if (stored) {
        const parsed = JSON.parse(stored)
        setRankings(Array.isArray(parsed) ? parsed : [])
      }
    } catch (error) {
      console.error('Failed to load custom rankings:', error)
      setRankings([])
    } finally {
      setIsLoading(false)
    }
  }, [])

  /**
   * LocalStorageにランキングを保存する
   */
  const saveRankings = useCallback((newRankings: CustomTagRanking[]) => {
    try {
      localStorage.setItem(CUSTOM_RANKINGS_STORAGE_KEY, JSON.stringify(newRankings))
      setRankings(newRankings)
    } catch (error) {
      console.error('Failed to save custom rankings:', error)
      throw new Error('カスタムランキングの保存に失敗しました')
    }
  }, [])

  /**
   * 新しいカスタムランキングを作成
   */
  const createRanking = useCallback((
    name: string,
    genre: RankingGenre,
    period: RankingPeriod,
    conditions: CustomTagConditions
  ): CustomTagRanking => {
    const newRanking: CustomTagRanking = {
      id: `custom-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      name,
      genre,
      period,
      conditions,
      createdAt: Date.now(),
      updatedAt: Date.now()
    }

    const updatedRankings = [...rankings, newRanking]
    saveRankings(updatedRankings)
    
    return newRanking
  }, [rankings, saveRankings])

  /**
   * カスタムランキングを更新
   */
  const updateRanking = useCallback((
    id: string,
    updates: Partial<Omit<CustomTagRanking, 'id' | 'createdAt'>>
  ) => {
    const updatedRankings = rankings.map(ranking => {
      if (ranking.id === id) {
        return {
          ...ranking,
          ...updates,
          updatedAt: Date.now()
        }
      }
      return ranking
    })

    saveRankings(updatedRankings)
  }, [rankings, saveRankings])

  /**
   * カスタムランキングを削除
   */
  const deleteRanking = useCallback((id: string) => {
    const updatedRankings = rankings.filter(ranking => ranking.id !== id)
    saveRankings(updatedRankings)
  }, [rankings, saveRankings])

  /**
   * IDでカスタムランキングを取得
   */
  const getRankingById = useCallback((id: string): CustomTagRanking | undefined => {
    return rankings.find(ranking => ranking.id === id)
  }, [rankings])

  return {
    rankings,
    isLoading,
    createRanking,
    updateRanking,
    deleteRanking,
    getRankingById,
    reloadRankings: loadRankings
  }
}