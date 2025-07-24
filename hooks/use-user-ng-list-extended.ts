import { useState, useEffect, useCallback } from 'react'
import type { ExtendedUserNGList } from '../types/ng-list-extended'
import { migrateToExtendedNGList, createEmptyTagNGList } from '../lib/ng-list-migration-extended'

const STORAGE_KEY = 'user-ng-list'
const CURRENT_VERSION = 2

const defaultNGList: ExtendedUserNGList = {
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
  tags: createEmptyTagNGList(),
  version: CURRENT_VERSION,
  totalCount: 0,
  updatedAt: new Date().toISOString(),
}

export function useUserNGListExtended() {
  const [ngList, setNGList] = useState<ExtendedUserNGList>(defaultNGList)

  // 初回読み込みとストレージ変更の監視
  useEffect(() => {
    if (typeof window === 'undefined') return

    const loadNGList = () => {
      try {
        const stored = localStorage.getItem(STORAGE_KEY)
        if (stored) {
          const parsed = JSON.parse(stored)
          
          // バージョン1の場合はマイグレーション
          if (parsed.version === 1) {
            const migrated = migrateToExtendedNGList(parsed) as ExtendedUserNGList
            migrated.version = CURRENT_VERSION
            setNGList(migrated)
            // マイグレーションしたデータを保存
            localStorage.setItem(STORAGE_KEY, JSON.stringify(migrated))
          } else if (parsed.version === CURRENT_VERSION) {
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
          } else if (parsed.version === 1) {
            // 他のタブでv1データが保存された場合もマイグレーション
            const migrated = migrateToExtendedNGList(parsed) as ExtendedUserNGList
            migrated.version = CURRENT_VERSION
            setNGList(migrated)
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

  // 総数を再計算（タグも含む）
  const recalculateTotalCount = useCallback((list: ExtendedUserNGList): number => {
    let count = 
      list.videoIds.length +
      list.videoTitles.exact.length +
      list.videoTitles.partial.length +
      list.authorIds.length +
      list.authorNames.exact.length +
      list.authorNames.partial.length
    
    // タグがある場合はタグ数も加算
    if (list.tags) {
      count += 
        list.tags.locked.exact.length +
        list.tags.locked.partial.length +
        list.tags.user.exact.length +
        list.tags.user.partial.length +
        list.tags.both.exact.length +
        list.tags.both.partial.length
    }
    
    return count
  }, [])

  // 適用ボタン用：NGリストを直接保存
  const saveNGListDirectly = useCallback((newList: ExtendedUserNGList) => {
    const updatedList = {
      ...newList,
      updatedAt: new Date().toISOString(),
      totalCount: recalculateTotalCount(newList),
      version: CURRENT_VERSION // 必ずversion 2で保存
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


  return {
    ngList,
    saveNGListDirectly,
  }
}