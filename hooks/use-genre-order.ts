import { useState, useCallback, useEffect } from 'react'
import type { RankingGenre } from '@/types/ranking-config'

export interface GenreOrderState {
  // カスタム順序の配列（表示するジャンルのみ）
  order: RankingGenre[]
  // 非表示にするジャンル
  hidden: Set<RankingGenre>
  // バージョン管理
  version: number
  // 最終更新日時
  updatedAt: string
}

const STORAGE_KEY = 'genre-order'
const CURRENT_VERSION = 1

// デフォルトの順序（GENRE_LABELSと同じ順序）
const DEFAULT_ORDER: RankingGenre[] = [
  'all', 'game', 'anime', 'vocaloid', 'voicesynthesis', 'entertainment',
  'music', 'sing', 'dance', 'play', 'commentary', 'cooking',
  'travel', 'nature', 'vehicle', 'technology', 'society', 'mmd',
  'vtuber', 'radio', 'sports', 'animal', 'other'
]

const defaultState: GenreOrderState = {
  order: DEFAULT_ORDER,
  hidden: new Set<RankingGenre>(),
  version: CURRENT_VERSION,
  updatedAt: new Date().toISOString()
}

export function useGenreOrder() {
  const [state, setState] = useState<GenreOrderState>(() => {
    if (typeof window === 'undefined') {
      return defaultState
    }

    try {
      const stored = localStorage.getItem(STORAGE_KEY)
      if (stored) {
        const parsed = JSON.parse(stored)
        // バージョンチェック
        if (parsed.version === CURRENT_VERSION) {
          // Set を復元
          return {
            ...parsed,
            hidden: new Set(parsed.hidden || [])
          }
        }
      }
    } catch (error) {
      console.error('Failed to load genre order from localStorage:', error)
    }

    return defaultState
  })

  // LocalStorageに保存
  const saveToStorage = useCallback((newState: GenreOrderState) => {
    try {
      // Set を配列に変換して保存
      const toSave = {
        ...newState,
        hidden: Array.from(newState.hidden),
        updatedAt: new Date().toISOString()
      }
      localStorage.setItem(STORAGE_KEY, JSON.stringify(toSave))
    } catch (error) {
      console.error('Failed to save genre order to localStorage:', error)
    }
  }, [])

  // ジャンルの順序を更新
  const updateOrder = useCallback((newOrder: RankingGenre[]) => {
    setState(prev => {
      const newState = {
        ...prev,
        order: newOrder,
        updatedAt: new Date().toISOString()
      }
      saveToStorage(newState)
      return newState
    })
  }, [saveToStorage])

  // ジャンルの表示/非表示を切り替え
  const toggleGenreVisibility = useCallback((genre: RankingGenre) => {
    setState(prev => {
      const newHidden = new Set(prev.hidden)
      if (newHidden.has(genre)) {
        newHidden.delete(genre)
        // 非表示から表示に戻す場合、orderの最後に追加
        const newOrder = prev.order.includes(genre) 
          ? prev.order 
          : [...prev.order, genre]
        const newState = {
          ...prev,
          order: newOrder,
          hidden: newHidden,
          updatedAt: new Date().toISOString()
        }
        saveToStorage(newState)
        return newState
      } else {
        newHidden.add(genre)
        // 表示から非表示にする場合、orderからも削除
        const newOrder = prev.order.filter(g => g !== genre)
        const newState = {
          ...prev,
          order: newOrder,
          hidden: newHidden,
          updatedAt: new Date().toISOString()
        }
        saveToStorage(newState)
        return newState
      }
    })
  }, [saveToStorage])

  // 特定のジャンルを上に移動
  const moveGenreUp = useCallback((genre: RankingGenre) => {
    setState(prev => {
      const index = prev.order.indexOf(genre)
      if (index <= 0) return prev
      
      const newOrder = [...prev.order]
      newOrder[index] = newOrder[index - 1]
      newOrder[index - 1] = genre
      
      const newState = {
        ...prev,
        order: newOrder,
        updatedAt: new Date().toISOString()
      }
      saveToStorage(newState)
      return newState
    })
  }, [saveToStorage])

  // 特定のジャンルを下に移動
  const moveGenreDown = useCallback((genre: RankingGenre) => {
    setState(prev => {
      const index = prev.order.indexOf(genre)
      if (index < 0 || index >= prev.order.length - 1) return prev
      
      const newOrder = [...prev.order]
      newOrder[index] = newOrder[index + 1]
      newOrder[index + 1] = genre
      
      const newState = {
        ...prev,
        order: newOrder,
        updatedAt: new Date().toISOString()
      }
      saveToStorage(newState)
      return newState
    })
  }, [saveToStorage])

  // デフォルトにリセット
  const resetToDefault = useCallback(() => {
    const newState = {
      ...defaultState,
      updatedAt: new Date().toISOString()
    }
    setState(newState)
    saveToStorage(newState)
  }, [saveToStorage])

  // インポート用（バックアップから復元）
  const importOrder = useCallback((data: { order: RankingGenre[], hidden: RankingGenre[] }) => {
    const newState: GenreOrderState = {
      order: data.order,
      hidden: new Set(data.hidden),
      version: CURRENT_VERSION,
      updatedAt: new Date().toISOString()
    }
    setState(newState)
    saveToStorage(newState)
  }, [saveToStorage])

  // エクスポート用（バックアップ用）
  const exportOrder = useCallback(() => {
    return {
      order: state.order,
      hidden: Array.from(state.hidden)
    }
  }, [state])

  // 表示するジャンルのみを返す
  const visibleGenres = state.order.filter(genre => !state.hidden.has(genre))

  return {
    order: state.order,
    hidden: state.hidden,
    visibleGenres,
    updateOrder,
    toggleGenreVisibility,
    moveGenreUp,
    moveGenreDown,
    resetToDefault,
    importOrder,
    exportOrder
  }
}