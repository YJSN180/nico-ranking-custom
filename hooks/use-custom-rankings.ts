import { useState, useEffect, useCallback } from 'react'
import { CustomRanking, CustomRankingStorage } from '@/types/custom-ranking'

const STORAGE_KEY = 'custom-rankings'
const CURRENT_VERSION = 1

const defaultStorage: CustomRankingStorage = {
  rankings: [],
  selectedId: undefined,
}

export function useCustomRankings() {
  const [storage, setStorage] = useState<CustomRankingStorage>(defaultStorage)
  const [isLoading, setIsLoading] = useState(true)

  // 初回読み込みとストレージ変更の監視
  useEffect(() => {
    if (typeof window === 'undefined') return

    const loadStorage = () => {
      try {
        const stored = localStorage.getItem(STORAGE_KEY)
        if (stored) {
          const parsed = JSON.parse(stored)
          
          // 後方互換性: tagTypeが存在しない古いデータにデフォルト値を追加
          if (parsed.rankings) {
            parsed.rankings = parsed.rankings.map((ranking: any) => ({
              ...ranking,
              conditions: ranking.conditions?.map((condition: any) => ({
                ...condition,
                tagType: condition.tagType || 'both' // デフォルトは'both'
              })) || []
            }))
          }
          
          setStorage(parsed)
        }
      } catch (error) {
        // Failed to load custom rankings
      } finally {
        // データ読み込み完了をマーク
        setIsLoading(false)
      }
    }
    
    // 初回読み込み
    loadStorage()
    
    // storageイベントを監視（他のタブでの変更を検知）
    const handleStorageChange = (e: StorageEvent) => {
      if (e.key === STORAGE_KEY && e.newValue) {
        try {
          const parsed = JSON.parse(e.newValue)
          setStorage(parsed)
        } catch (error) {
          // Failed to parse storage event
        }
      }
    }
    
    // customRankingsUpdatedイベントを監視（他のコンポーネントからの変更を検知）
    const handleCustomRankingsUpdated = (e: CustomEvent) => {
      if (e.detail && e.detail.storage) {
        setStorage(e.detail.storage)
      }
    }
    
    window.addEventListener('storage', handleStorageChange)
    window.addEventListener('customRankingsUpdated', handleCustomRankingsUpdated as EventListener)
    
    return () => {
      window.removeEventListener('storage', handleStorageChange)
      window.removeEventListener('customRankingsUpdated', handleCustomRankingsUpdated as EventListener)
    }
  }, [])

  // ストレージに保存
  const saveStorage = useCallback((newStorage: CustomRankingStorage) => {
    setStorage(newStorage)
    
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(newStorage))
      
      // カスタムランキング更新イベントを発火（他のコンポーネントに通知）
      window.dispatchEvent(new CustomEvent('customRankingsUpdated', { 
        detail: { storage: newStorage } 
      }))
    } catch (error) {
      // Failed to save custom rankings
    }
  }, [])

  // カスタムランキングを作成
  const createRanking = useCallback((ranking: Omit<CustomRanking, 'id' | 'createdAt' | 'updatedAt'>) => {
    const newRanking: CustomRanking = {
      ...ranking,
      id: crypto.randomUUID(),
      createdAt: Date.now(),
      updatedAt: Date.now(),
    }

    const newStorage = {
      ...storage,
      rankings: [...storage.rankings, newRanking],
      selectedId: newRanking.id, // 作成したランキングを自動選択
    }

    saveStorage(newStorage)
    return newRanking
  }, [storage, saveStorage])

  // カスタムランキングを更新
  const updateRanking = useCallback((id: string, updates: Partial<Omit<CustomRanking, 'id' | 'createdAt'>>) => {
    const newRankings = storage.rankings.map(ranking => 
      ranking.id === id 
        ? { ...ranking, ...updates, updatedAt: Date.now() }
        : ranking
    )

    const newStorage = {
      ...storage,
      rankings: newRankings,
    }

    saveStorage(newStorage)
  }, [storage, saveStorage])

  // カスタムランキングを削除
  const deleteRanking = useCallback((id: string) => {
    const newRankings = storage.rankings.filter(ranking => ranking.id !== id)
    const newStorage = {
      ...storage,
      rankings: newRankings,
      selectedId: storage.selectedId === id ? undefined : storage.selectedId,
    }

    saveStorage(newStorage)
  }, [storage, saveStorage])

  // カスタムランキングを選択
  const selectRanking = useCallback((id: string | undefined) => {
    const newStorage = {
      ...storage,
      selectedId: id,
    }

    saveStorage(newStorage)
  }, [storage, saveStorage])

  // 選択中のカスタムランキングを取得
  const selectedRanking = storage.selectedId 
    ? storage.rankings.find(r => r.id === storage.selectedId)
    : undefined

  // タイトルの重複チェック
  const isUniqueTitle = useCallback((title: string, excludeId?: string) => {
    return !storage.rankings.some(ranking => 
      ranking.title === title && ranking.id !== excludeId
    )
  }, [storage.rankings])

  return {
    rankings: storage.rankings,
    selectedId: storage.selectedId,
    selectedRanking,
    createRanking,
    updateRanking,
    deleteRanking,
    selectRanking,
    isUniqueTitle,
    isLoading,
  }
}