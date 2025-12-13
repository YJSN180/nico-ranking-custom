'use client'

import { useState, useEffect, useCallback } from 'react'
import { GenreItem, createDefaultGenreItems } from '@/types/genre-order'
import { RankingGenre } from '@/types/ranking-config'

const STORAGE_KEY = 'nicoRankingGenreOrder'

/**
 * ジャンル順序管理フック v2
 * - シンプルな状態管理
 * - 一時状態と永続化状態の明確な分離
 * - 直感的なAPI
 */
export function useGenreOrderV2() {
  // 永続化された状態
  const [savedItems, setSavedItems] = useState<GenreItem[]>(() => {
    if (typeof window === 'undefined') return createDefaultGenreItems()
    
    try {
      const stored = localStorage.getItem(STORAGE_KEY)
      if (stored) {
        const parsed = JSON.parse(stored) as GenreItem[]
        // 不正なデータのバリデーション
        if (Array.isArray(parsed) && parsed.length > 0) {
          // 既存のlocalStorageデータに新しいジャンルが含まれているか確認
          const defaultItems = createDefaultGenreItems()
          const existingIds = new Set(parsed.map(item => item.id))
          const missingItems: GenreItem[] = []
          
          // デフォルトのジャンルリストに存在するが、保存データに存在しないジャンルを検出
          defaultItems.forEach(defaultItem => {
            if (!existingIds.has(defaultItem.id)) {
              // 新しいジャンルを最後に追加（表示状態で）
              missingItems.push({
                id: defaultItem.id,
                isVisible: true,
                order: parsed.length + missingItems.length
              })
            }
          })
          
          // 新しいジャンルが見つかった場合は追加
          if (missingItems.length > 0) {
            return [...parsed, ...missingItems]
          }
          
          return parsed
        }
      }
    } catch (error) {
      console.error('Failed to load genre order:', error)
    }
    
    return createDefaultGenreItems()
  })

  // 一時的な編集状態
  const [tempItems, setTempItems] = useState<GenreItem[]>(savedItems)
  const [hasChanges, setHasChanges] = useState(false)

  // 保存済み状態が変更されたら一時状態も更新
  useEffect(() => {
    setTempItems(savedItems)
    setHasChanges(false)
  }, [savedItems])

  // 変更検知
  useEffect(() => {
    const isChanged = JSON.stringify(tempItems) !== JSON.stringify(savedItems)
    setHasChanges(isChanged)
  }, [tempItems, savedItems])

  /**
   * アイテムを新しい位置に移動する（Insert方式）
   * ドラッグしたアイテムを新しい位置に挿入し、他のアイテムは順番を保ちながらシフト
   */
  const moveItem = useCallback((fromId: RankingGenre, toId: RankingGenre) => {
    setTempItems(items => {
      const newItems = [...items]
      const fromIndex = newItems.findIndex(item => item.id === fromId)
      const toIndex = newItems.findIndex(item => item.id === toId)
      
      if (fromIndex === -1 || toIndex === -1 || fromIndex === toIndex) return items
      
      // ドラッグされたアイテムを取り出す
      const [draggedItem] = newItems.splice(fromIndex, 1)
      
      // 新しい位置に挿入
      newItems.splice(toIndex, 0, draggedItem)
      
      // orderを再計算
      newItems.forEach((item, index) => {
        item.order = index
      })
      
      return newItems
    })
  }, [])

  /**
   * 表示/非表示を切り替える
   */
  const toggleVisibility = useCallback((id: RankingGenre) => {
    setTempItems(items => 
      items.map(item => 
        item.id === id 
          ? { ...item, isVisible: !item.isVisible }
          : item
      )
    )
  }, [])

  /**
   * デフォルトに戻す
   */
  const resetToDefault = useCallback(() => {
    setTempItems(createDefaultGenreItems())
  }, [])

  /**
   * すべて非表示にする
   */
  const hideAll = useCallback(() => {
    setTempItems(items => 
      items.map(item => ({ ...item, isVisible: false }))
    )
  }, [])

  /**
   * すべて表示にする
   */
  const showAll = useCallback(() => {
    setTempItems(items => 
      items.map(item => ({ ...item, isVisible: true }))
    )
  }, [])

  /**
   * 変更を適用してLocalStorageに保存
   */
  const applyChanges = useCallback(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(tempItems))
      setSavedItems(tempItems)
      setHasChanges(false)
      
      // ページリロードで変更を反映
      window.location.reload()
    } catch (error) {
      console.error('Failed to save genre order:', error)
      throw error
    }
  }, [tempItems])

  /**
   * 変更を破棄
   */
  const cancelChanges = useCallback(() => {
    setTempItems(savedItems)
    setHasChanges(false)
  }, [savedItems])

  /**
   * 現在の表示順序（表示されているもののみ）
   */
  const visibleGenres = tempItems
    .filter(item => item.isVisible)
    .sort((a, b) => a.order - b.order)
    .map(item => item.id)

  /**
   * 現在の非表示リスト
   */
  const hiddenGenres = tempItems
    .filter(item => !item.isVisible)
    .map(item => item.id)

  return {
    // 状態
    items: tempItems,
    visibleGenres,
    hiddenGenres,
    hasChanges,
    
    // 操作
    moveItem,
    toggleVisibility,
    resetToDefault,
    hideAll,
    showAll,
    applyChanges,
    cancelChanges
  }
}