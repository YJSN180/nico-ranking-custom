import { useState, useEffect, useCallback } from 'react'
import type { RankingGenre, RankingPeriod } from '@/types/ranking-config'
import { getUserPreferencesCookieClient, setUserPreferencesCookieClient } from '@/lib/user-preferences-cookie'

export type ThemeType = 'light' | 'dark' | 'darkblue'

export interface UserPreferences {
  lastGenre: RankingGenre
  lastPeriod: RankingPeriod
  lastTag?: string
  theme?: ThemeType
  showTags?: boolean
  version: number
  updatedAt: string
}

const STORAGE_KEY = 'user-preferences'
const CURRENT_VERSION = 1

const defaultPreferences: UserPreferences = {
  lastGenre: 'all',
  lastPeriod: '24h',
  lastTag: undefined,
  theme: 'light',
  showTags: true,
  version: CURRENT_VERSION,
  updatedAt: new Date().toISOString(),
}

export function useUserPreferences() {
  const [preferences, setPreferences] = useState<UserPreferences>(() => {
    // 初期化時にCookie/localStorageから読み込み
    if (typeof window !== 'undefined') {
      // まずCookieから読み込みを試みる
      const cookiePrefs = getUserPreferencesCookieClient()
      if (cookiePrefs?.version === CURRENT_VERSION) {
        return { ...defaultPreferences, ...cookiePrefs }
      }
      
      // Cookieがない場合、localStorageから移行を試みる（後方互換性）
      try {
        const stored = localStorage.getItem(STORAGE_KEY)
        if (stored) {
          const parsed = JSON.parse(stored)
          // バージョンチェック
          if (parsed.version === CURRENT_VERSION) {
            // Cookieに移行
            setUserPreferencesCookieClient(parsed)
            // localStorageからは削除
            localStorage.removeItem(STORAGE_KEY)
            return parsed
          }
        }
      } catch (error) {
        // エラーは無視してデフォルト値を使用
      }
    }
    return defaultPreferences
  })

  // 設定を更新
  const updatePreferences = useCallback((updates: Partial<UserPreferences>) => {
    setPreferences(prev => {
      const newPrefs = {
        ...prev,
        ...updates,
        updatedAt: new Date().toISOString(),
      }
      
      // Cookieに保存
      try {
        setUserPreferencesCookieClient(newPrefs)
      } catch (error) {
        // エラーは無視
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
      setUserPreferencesCookieClient(newPrefs)
    } catch (error) {
      // エラーは無視
    }
  }, [])

  return {
    preferences,
    updatePreferences,
    resetPreferences,
  }
}

// クライアントサイドで使用する関数（Cookieから取得）
export function getStoredPreferences(): Partial<UserPreferences> | null {
  // サーバーサイドではCookieが使えないのでnullを返す
  if (typeof window === 'undefined') {
    return null
  }

  // Cookieから読み込み
  const cookiePrefs = getUserPreferencesCookieClient()
  if (cookiePrefs?.version === CURRENT_VERSION) {
    return cookiePrefs
  }
  
  // 後方互換性のためlocalStorageもチェック
  try {
    const stored = localStorage.getItem(STORAGE_KEY)
    if (stored) {
      const parsed = JSON.parse(stored)
      if (parsed.version === CURRENT_VERSION) {
        // Cookieに移行
        setUserPreferencesCookieClient(parsed)
        localStorage.removeItem(STORAGE_KEY)
        return parsed
      }
    }
  } catch {
    // エラーは無視
  }
  
  return null
}