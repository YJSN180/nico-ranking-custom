'use client'

import { useState, useEffect, useCallback } from 'react'

const STORAGE_KEY = 'customRankingsOrder'

interface CustomRankingOrderItem {
  id: string
  order: number
}

/**
 * カスタムランキング順序管理フック
 * カスタムランキングの表示順序を管理する
 */
export function useCustomRankingsOrder(rankings: any[]) {
  const [orderMap, setOrderMap] = useState<Map<string, number>>(() => {
    if (typeof window === 'undefined') return new Map()
    
    try {
      const stored = localStorage.getItem(STORAGE_KEY)
      if (stored) {
        const parsed = JSON.parse(stored) as CustomRankingOrderItem[]
        const map = new Map<string, number>()
        parsed.forEach(item => {
          map.set(item.id, item.order)
        })
        return map
      }
    } catch (error) {
      console.error('Failed to load custom rankings order:', error)
    }
    
    return new Map()
  })

  // 新しいランキングが追加された場合、最後に追加
  useEffect(() => {
    let hasNewItems = false
    const newOrderMap = new Map(orderMap)
    
    rankings.forEach((ranking, index) => {
      if (!orderMap.has(ranking.id)) {
        // 既存の最大order値を取得
        const maxOrder = Math.max(...Array.from(orderMap.values()), -1)
        newOrderMap.set(ranking.id, maxOrder + 1 + index)
        hasNewItems = true
      }
    })
    
    if (hasNewItems) {
      setOrderMap(newOrderMap)
      saveToLocalStorage(newOrderMap)
    }
  }, [rankings, orderMap])

  const saveToLocalStorage = (map: Map<string, number>) => {
    try {
      const items: CustomRankingOrderItem[] = Array.from(map.entries()).map(([id, order]) => ({
        id,
        order
      }))
      localStorage.setItem(STORAGE_KEY, JSON.stringify(items))
    } catch (error) {
      console.error('Failed to save custom rankings order:', error)
    }
  }

  /**
   * ランキングを新しい位置に移動
   */
  const moveRanking = useCallback((fromId: string, toId: string) => {
    setOrderMap(currentMap => {
      const newMap = new Map(currentMap)
      const fromOrder = newMap.get(fromId)
      const toOrder = newMap.get(toId)
      
      if (fromOrder === undefined || toOrder === undefined) return currentMap
      
      // 全てのアイテムを順序でソート
      const items = Array.from(newMap.entries()).sort((a, b) => a[1] - b[1])
      
      // fromアイテムを削除
      const fromIndex = items.findIndex(item => item[0] === fromId)
      const [movedItem] = items.splice(fromIndex, 1)
      
      // toアイテムの位置を見つけて挿入
      const toIndex = items.findIndex(item => item[0] === toId)
      items.splice(toIndex, 0, movedItem)
      
      // 順序を再計算
      const updatedMap = new Map<string, number>()
      items.forEach((item, index) => {
        updatedMap.set(item[0], index)
      })
      
      saveToLocalStorage(updatedMap)
      return updatedMap
    })
  }, [])

  /**
   * 順序でソートされたランキングを返す
   */
  const getSortedRankings = useCallback((rankingsToSort: any[]) => {
    return [...rankingsToSort].sort((a, b) => {
      const orderA = orderMap.get(a.id) ?? Number.MAX_SAFE_INTEGER
      const orderB = orderMap.get(b.id) ?? Number.MAX_SAFE_INTEGER
      return orderA - orderB
    })
  }, [orderMap])

  /**
   * 順序をリセット
   */
  const resetOrder = useCallback(() => {
    setOrderMap(new Map())
    try {
      localStorage.removeItem(STORAGE_KEY)
    } catch (error) {
      console.error('Failed to reset custom rankings order:', error)
    }
  }, [])

  return {
    getSortedRankings,
    moveRanking,
    resetOrder
  }
}