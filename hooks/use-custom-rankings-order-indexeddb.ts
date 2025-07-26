'use client'

import { useCallback } from 'react'
import type { CustomRankingWithConditions } from '@/lib/storage/types'

/**
 * IndexedDB版カスタムランキング順序管理フック
 * IndexedDBでは順序情報がランキング自体に統合されているため、
 * 順序操作は直接ランキング更新を通じて行う
 */
interface UseCustomRankingsOrderIndexedDBProps {
  rankings: CustomRankingWithConditions[]
  updateRankingOrder: (rankingOrders: { id: string; orderIndex: number }[]) => Promise<boolean>
  toggleVisibility: (id: string) => Promise<boolean>
}

export function useCustomRankingsOrderIndexedDB({ 
  rankings, 
  updateRankingOrder,
  toggleVisibility
}: UseCustomRankingsOrderIndexedDBProps) {
  
  /**
   * ランキングを新しい位置に移動
   */
  const moveRanking = useCallback(async (fromId: string, toId: string): Promise<boolean> => {
    const fromIndex = rankings.findIndex(item => item.id === fromId)
    const toIndex = rankings.findIndex(item => item.id === toId)
    
    if (fromIndex === -1 || toIndex === -1 || fromIndex === toIndex) {
      return false
    }
    
    // 新しい順序を計算
    const newRankings = [...rankings]
    const [movedItem] = newRankings.splice(fromIndex, 1)
    
    // 削除後のインデックス調整
    const adjustedToIndex = fromIndex < toIndex ? toIndex - 1 : toIndex
    newRankings.splice(adjustedToIndex, 0, movedItem)
    
    // 新しい順序インデックスを計算して更新
    const rankingOrders = newRankings.map((ranking, index) => ({
      id: ranking.id,
      orderIndex: index
    }))
    
    return await updateRankingOrder(rankingOrders)
  }, [rankings, updateRankingOrder])

  /**
   * 順序でソートされたランキングを返す（表示・非表示両方）
   */
  const getSortedRankings = (rankingsToSort: CustomRankingWithConditions[]) => {
    return [...rankingsToSort].sort((a, b) => a.orderIndex - b.orderIndex)
  }

  /**
   * 表示されているランキングのみを返す
   */
  const getVisibleRankings = useCallback((rankingsToSort: CustomRankingWithConditions[]) => {
    const sorted = getSortedRankings(rankingsToSort)
    return sorted.filter(ranking => ranking.isVisible)
  }, [])

  /**
   * 順序をリセット（作成日順に再配置）
   */
  const resetOrder = useCallback(async (): Promise<boolean> => {
    const sortedByCreationDate = [...rankings].sort((a, b) => a.createdAt - b.createdAt)
    
    const rankingOrders = sortedByCreationDate.map((ranking, index) => ({
      id: ranking.id,
      orderIndex: index
    }))
    
    return await updateRankingOrder(rankingOrders)
  }, [rankings, updateRankingOrder])

  return {
    getSortedRankings,
    getVisibleRankings,
    moveRanking,
    toggleVisibility,
    resetOrder
  }
}