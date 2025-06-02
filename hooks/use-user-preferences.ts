import { useState, useEffect, useCallback } from 'react'
import type { RankingGenre, RankingPeriod } from '@/types/ranking-config'

export interface UserPreferences {
  lastGenre: RankingGenre
  lastPeriod: RankingPeriod
  lastTag?: string
  version: number
  updatedAt: string
}

const STORAGE_KEY = 'user-preferences'
const CURRENT_VERSION = 1

const defaultPreferences: UserPreferences = {
  lastGenre: 'all',
  lastPeriod: '24h',
  lastTag: undefined,
  version: CURRENT_VERSION,
  updatedAt: new Date().toISOString(),
}

export function useUserPreferences() {
  const [preferences, setPreferences] = useState<UserPreferences>(defaultPreferences)

  // 初回読み込み
  useEffect(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY)
      if (stored) {
        const parsed = JSON.parse(stored)
        // バージョンチェック
        if (parsed.version === CURRENT_VERSION) {
          setPreferences(parsed)
        }
      }
    } catch (error) {
      // エラーは無視してデフォルト値を使用
    }
  }, [])

  // 設定を更新
  const updatePreferences = useCallback((updates: Partial<UserPreferences>) => {
    setPreferences(prev => {
      const newPrefs = {
        ...prev,
        ...updates,
        updatedAt: new Date().toISOString(),
      }
      
      // localStorageに保存
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(newPrefs))
      } catch (error) {
        // ストレージエラーは無視
      }
      
      return newPrefs
    })
  }, [])

  // 設定をリセット
  const resetPreferences = useCallback(() => {
    const newPrefs = {
      ...defaultPreferences,
      updatedAt: new Date().toISOString(),
    }
    setPreferences(newPrefs)
    
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(newPrefs))
    } catch (error) {
      // ストレージエラーは無視
    }
  }, [])

  return {
    preferences,
    updatePreferences,
    resetPreferences,
  }
}

// サーバーサイドで使用する関数
export function getStoredPreferences(): Partial<UserPreferences> | null {
  // サーバーサイドではlocalStorageが使えないのでnullを返す
  if (typeof window === 'undefined') {
    return null
  }

  try {
    const stored = localStorage.getItem(STORAGE_KEY)
    if (stored) {
      const parsed = JSON.parse(stored)
      if (parsed.version === CURRENT_VERSION) {
        return parsed
      }
    }
  } catch {
    // エラーは無視
  }
  
  return null
}