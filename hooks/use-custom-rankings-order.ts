'use client'

import { useState, useEffect, useCallback } from 'react'

const STORAGE_KEY = 'customRankingsOrder'

interface CustomRankingOrderItem {
  id: string
  order: number
  isVisible: boolean
}

/**
 * カスタムランキング順序管理フック
 * カスタムランキングの表示順序と表示・非表示を管理する
 */
export function useCustomRankingsOrder(rankings: any[]) {
  const [orderItems, setOrderItems] = useState<CustomRankingOrderItem[]>(() => {
    if (typeof window === 'undefined') return []
    
    try {
      const stored = localStorage.getItem(STORAGE_KEY)
      if (stored) {
        const parsed = JSON.parse(stored) as CustomRankingOrderItem[]
        return parsed
      }
    } catch (error) {
      console.error('Failed to load custom rankings order:', error)
    }
    
    return []
  })

  // 新しいランキングが追加された場合、最後に追加
  useEffect(() => {
    let hasNewItems = false
    const newOrderItems = [...orderItems]
    
    rankings.forEach((ranking, index) => {
      const exists = orderItems.find(item => item.id === ranking.id)
      if (!exists) {
        // 既存の最大order値を取得
        const maxOrder = Math.max(...orderItems.map(item => item.order), -1)
        newOrderItems.push({
          id: ranking.id,
          order: maxOrder + 1 + index,
          isVisible: true // デフォルトで表示
        })
        hasNewItems = true
      }
    })
    
    // 削除されたランキングを除去
    const currentIds = new Set(rankings.map(r => r.id))
    const filteredItems = newOrderItems.filter(item => currentIds.has(item.id))
    
    if (hasNewItems || filteredItems.length !== newOrderItems.length) {
      setOrderItems(filteredItems)
      saveToLocalStorage(filteredItems)
    }
  }, [rankings])

  const saveToLocalStorage = (items: CustomRankingOrderItem[]) => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(items))
    } catch (error) {
      console.error('Failed to save custom rankings order:', error)
    }
  }

  /**
   * ランキングを新しい位置に移動
   */
  const moveRanking = useCallback((fromId: string, toId: string) => {
    setOrderItems(currentItems => {
      const newItems = [...currentItems]
      
      // インデックスを事前に取得
      const fromIndex = newItems.findIndex(item => item.id === fromId)
      const toIndex = newItems.findIndex(item => item.id === toId)
      
      if (fromIndex === -1 || toIndex === -1 || fromIndex === toIndex) return currentItems
      
      // アイテムを削除
      const [movedItem] = newItems.splice(fromIndex, 1)
      
      // 削除後のインデックス調整
      // fromIndexがtoIndexより前にあった場合、toIndexは1つ前にずれる
      const adjustedToIndex = fromIndex < toIndex ? toIndex - 1 : toIndex
      
      // 新しい位置に挿入
      newItems.splice(adjustedToIndex, 0, movedItem)
      
      // 順序を再計算
      newItems.forEach((item, index) => {
        item.order = index
      })
      
      saveToLocalStorage(newItems)
      return newItems
    })
  }, [])

  /**
   * 表示/非表示を切り替える
   */
  const toggleVisibility = useCallback((id: string) => {
    setOrderItems(currentItems => {
      const newItems = currentItems.map(item =>
        item.id === id ? { ...item, isVisible: !item.isVisible } : item
      )
      saveToLocalStorage(newItems)
      return newItems
    })
  }, [])

  /**
   * 順序でソートされたランキングを返す（表示・非表示両方）
   */
  const getSortedRankings = useCallback((rankingsToSort: any[]) => {
    // orderItemsの情報をマップ化
    const orderMap = new Map<string, CustomRankingOrderItem>()
    orderItems.forEach(item => {
      orderMap.set(item.id, item)
    })
    
    // ランキングにorder情報を付与してソート
    return [...rankingsToSort]
      .map(ranking => {
        const orderItem = orderMap.get(ranking.id)
        return {
          ...ranking,
          order: orderItem?.order ?? Number.MAX_SAFE_INTEGER,
          isVisible: orderItem?.isVisible ?? true
        }
      })
      .sort((a, b) => a.order - b.order)
  }, [orderItems])

  /**
   * 表示されているランキングのみを返す
   */
  const getVisibleRankings = useCallback((rankingsToSort: any[]) => {
    const sorted = getSortedRankings(rankingsToSort)
    return sorted.filter(ranking => ranking.isVisible)
  }, [getSortedRankings])

  /**
   * 順序をリセット
   */
  const resetOrder = useCallback(() => {
    setOrderItems([])
    try {
      localStorage.removeItem(STORAGE_KEY)
    } catch (error) {
      console.error('Failed to reset custom rankings order:', error)
    }
  }, [])

  return {
    getSortedRankings,
    getVisibleRankings,
    moveRanking,
    toggleVisibility,
    resetOrder
  }
}