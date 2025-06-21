import { useState, useEffect, useCallback, useRef } from 'react'

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
  
  // コンポーネントの一意IDを生成（二重更新を防ぐため）
  const componentId = useRef(`ng-list-${Math.random().toString(36).substr(2, 9)}`)

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
      // イベントが自分自身のコンポーネントIDと異なる場合のみ処理
      // （同じコンポーネント内でのsaveNGListDirectly呼び出しによる二重更新を防ぐ）
      if (e.detail && e.detail.ngList && e.detail.sourceId !== componentId.current) {
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
      // sourceIdを含めることで、自分自身への二重更新を防ぐ
      window.dispatchEvent(new CustomEvent('ngListUpdated', { 
        detail: { 
          ngList: updatedList,
          sourceId: componentId.current 
        } 
      }))
    } catch (error) {
      // ストレージエラーは無視
    }
  }, [recalculateTotalCount])

  // フィルタリング関数
  // NGリストの内容が変わったときに新しい関数参照を作成するため、
  // ngListオブジェクト全体を依存配列に含める
  const filterItems = useCallback((items: any[]) => {
    // 高速化のためSetを作成
    const videoIdSet = new Set(ngList.videoIds)
    const videoTitleExactSet = new Set(ngList.videoTitles.exact)
    const authorIdSet = new Set(ngList.authorIds)
    const authorNameExactSet = new Set(ngList.authorNames.exact)

    return items.filter(item => {
      // 動画IDチェック
      if (videoIdSet.has(item.id)) return false

      // 動画タイトル（完全一致）チェック
      if (videoTitleExactSet.has(item.title)) return false

      // 動画タイトル（部分一致）チェック
      if (ngList.videoTitles.partial.some(partial => item.title.includes(partial))) {
        return false
      }

      // 投稿者IDチェック
      if (item.authorId && authorIdSet.has(item.authorId)) return false

      // 投稿者名（完全一致）チェック
      if (item.authorName && authorNameExactSet.has(item.authorName)) return false

      // 投稿者名（部分一致）チェック
      if (item.authorName && ngList.authorNames.partial.some(partial => item.authorName.includes(partial))) {
        return false
      }

      return true
    })
  }, [ngList.videoIds, ngList.videoTitles, ngList.authorIds, ngList.authorNames, ngList.updatedAt])

  return {
    ngList,
    filterItems,
    saveNGListDirectly,
  }
}