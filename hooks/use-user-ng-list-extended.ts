import { useState, useCallback, useEffect } from 'react'
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

// localStorageから初期データを読み込む関数（useEffect不要）
const loadInitialNGList = (): ExtendedUserNGList => {
  if (typeof window === 'undefined') return defaultNGList
  
  try {
    const stored = localStorage.getItem(STORAGE_KEY)
    if (stored) {
      const parsed = JSON.parse(stored)
      
      // バージョン1の場合はマイグレーション
      if (parsed.version === 1) {
        const migrated = migrateToExtendedNGList(parsed) as ExtendedUserNGList
        migrated.version = CURRENT_VERSION
        // マイグレーションしたデータを保存
        localStorage.setItem(STORAGE_KEY, JSON.stringify(migrated))
        return migrated
      } else if (parsed.version === CURRENT_VERSION) {
        return parsed
      }
    }
  } catch (error) {
    // エラーは無視してデフォルト値を使用
  }
  
  return defaultNGList
}

export function useUserNGListExtended() {
  // useEffectを使わずに初期化（useStateの遅延初期化を使用）
  const [ngList, setNGList] = useState<ExtendedUserNGList>(() => loadInitialNGList())
  
  // 他のコンポーネントからのNGリスト更新を監視（最小限のuseEffect使用）
  useEffect(() => {
    const handleNGListUpdated = (e: Event) => {
      const event = e as CustomEvent<{ ngList: ExtendedUserNGList }>
      if (event.detail && event.detail.ngList) {
        // ローカルストレージから再読み込みして最新状態を確実に取得
        const updatedList = loadInitialNGList()
        setNGList(updatedList)
      }
    }

    const handleStorageChange = (e: StorageEvent) => {
      if (e.key === STORAGE_KEY) {
        const updatedList = loadInitialNGList()
        setNGList(updatedList)
      }
    }
    
    window.addEventListener('ngListUpdated', handleNGListUpdated)
    window.addEventListener('storage', handleStorageChange)
    return () => {
      window.removeEventListener('ngListUpdated', handleNGListUpdated)
      window.removeEventListener('storage', handleStorageChange)
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
