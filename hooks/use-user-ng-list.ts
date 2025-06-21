import { useState, useEffect, useCallback } from 'react'
import { filterWithNGList } from '@/lib/filter-with-ng-list'
import type { NGList } from '@/types/ng-list'
import type { RankingItem } from '@/types/ranking'

export interface UserNGList {
  videoIds: string[]
  videoTitles: {
    exact: string[]
    partial: string[]
  }
  authorIds: string[]
  authorNames: {
    exact: string[]
    partial: string[]
  }
  version: number
  totalCount: number
  updatedAt: string
}

const STORAGE_KEY = 'user-ng-list'
const CURRENT_VERSION = 1

const defaultNGList: UserNGList = {
  videoIds: [],
  videoTitles: {
    exact: [],
    partial: [],
  },
  authorIds: [],
  authorNames: {
    exact: [],
    partial: [],
  },
  version: CURRENT_VERSION,
  totalCount: 0,
  updatedAt: new Date().toISOString(),
}

export function useUserNGList() {
  const [ngList, setNGList] = useState<UserNGList>(defaultNGList)

  // 初回読み込みとストレージ変更の監視
  useEffect(() => {
    const loadNGList = () => {
      try {
        const stored = localStorage.getItem(STORAGE_KEY)
        if (stored) {
          const parsed = JSON.parse(stored)
          if (parsed.version === CURRENT_VERSION) {
            setNGList(parsed)
          }
        }
      } catch (error) {
        // エラーは無視してデフォルト値を使用
      }
    }
    
    // 初回読み込み
    loadNGList()
    
    // storageイベントを監視（他のタブでの変更を検知）
    const handleStorageChange = (e: StorageEvent) => {
      if (e.key === STORAGE_KEY && e.newValue) {
        try {
          const parsed = JSON.parse(e.newValue)
          if (parsed.version === CURRENT_VERSION) {
            setNGList(parsed)
          }
        } catch (error) {
          // エラーは無視
        }
      }
    }
    
    // ngListUpdatedイベントを監視（他のコンポーネントからの変更を検知）
    const handleNGListUpdated = (e: CustomEvent) => {
      if (e.detail && e.detail.ngList) {
        setNGList(e.detail.ngList)
      }
    }
    
    window.addEventListener('storage', handleStorageChange)
    window.addEventListener('ngListUpdated', handleNGListUpdated as EventListener)
    
    return () => {
      window.removeEventListener('storage', handleStorageChange)
      window.removeEventListener('ngListUpdated', handleNGListUpdated as EventListener)
    }
  }, [])

  // 総数を再計算
  const recalculateTotalCount = useCallback((list: UserNGList): number => {
    return (
      list.videoIds.length +
      list.videoTitles.exact.length +
      list.videoTitles.partial.length +
      list.authorIds.length +
      list.authorNames.exact.length +
      list.authorNames.partial.length
    )
  }, [])

  // 適用ボタン用：NGリストを直接保存
  const saveNGListDirectly = useCallback((newList: UserNGList) => {
    const updatedList = {
      ...newList,
      updatedAt: new Date().toISOString(),
      totalCount: recalculateTotalCount(newList)
    }
    setNGList(updatedList)
    
    // localStorageに保存
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(updatedList))
      
      // NGリスト更新イベントを発火（他のコンポーネントに通知）
      window.dispatchEvent(new CustomEvent('ngListUpdated', { 
        detail: { ngList: updatedList } 
      }))
    } catch (error) {
      // ストレージエラーは無視
    }
  }, [recalculateTotalCount])

  // UserNGListをNGList形式に変換
  const convertToNGList = useCallback((userNGList: UserNGList): NGList => {
    return {
      videoIds: userNGList.videoIds,
      videoTitles: userNGList.videoTitles,
      authorIds: userNGList.authorIds,
      authorNames: userNGList.authorNames,
      derivedVideoIds: [] // クライアント側では派生IDは使用しない
    }
  }, [])

  // フィルタリング関数（ランク再計算を含む）
  const filterItems = useCallback((items: RankingItem[]): RankingItem[] => {
    const ngListForFilter = convertToNGList(ngList)
    const result = filterWithNGList(items, ngListForFilter)
    return result.filteredItems
  }, [ngList, convertToNGList])

  return {
    ngList,
    filterItems,
    saveNGListDirectly,
  }
}