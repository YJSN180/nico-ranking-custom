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
  showTags: false,
  version: CURRENT_VERSION,
  updatedAt: new Date().toISOString(),
}

export function useUserPreferences() {
  const [preferences, setPreferences] = useState<UserPreferences>(() => {
    // 初期化時にCookie/localStorageから読み込み
    if (typeof window !== 'undefined') {
      // まずCookieから読み込みを試みる
      const cookiePrefs = getUserPreferencesCookieClient()
      // デバッグログ（本番環境では削除）
      if (process.env.NODE_ENV === 'development') {
        console.log('[UserPreferences] Cookie loaded:', cookiePrefs)
      }
      if (cookiePrefs?.version === CURRENT_VERSION) {
        const merged = { ...defaultPreferences, ...cookiePrefs }
        if (process.env.NODE_ENV === 'development') {
          console.log('[UserPreferences] Merged preferences:', merged)
        }
        return merged
      }
      
      // Cookieがない場合、localStorageから読み込む（PWA対応）
      try {
        const stored = localStorage.getItem(STORAGE_KEY)
        if (stored) {
          const parsed = JSON.parse(stored)
          // バージョンチェック
          if (parsed.version === CURRENT_VERSION) {
            // Cookieにも同期を試みる
            setUserPreferencesCookieClient(parsed)
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
      
      if (process.env.NODE_ENV === 'development') {
        console.log('[UserPreferences] Updating:', updates)
        console.log('[UserPreferences] New preferences:', newPrefs)
      }
      
      // Cookieに保存
      try {
        setUserPreferencesCookieClient(newPrefs)
        if (process.env.NODE_ENV === 'development') {
          console.log('[UserPreferences] Cookie saved successfully')
        }
      } catch (error) {
        if (process.env.NODE_ENV === 'development') {
          console.error('[UserPreferences] Cookie save error:', error)
        }
      }
      
      // localStorageにも保存（PWA環境のフォールバック）
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(newPrefs))
        if (process.env.NODE_ENV === 'development') {
          console.log('[UserPreferences] localStorage saved successfully')
        }
      } catch (error) {
        if (process.env.NODE_ENV === 'development') {
          console.error('[UserPreferences] localStorage save error:', error)
        }
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
    
    // localStorageもリセット
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(newPrefs))
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

// クライアントサイドで使用する関数（Cookie/localStorageから取得）
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
  
  // localStorageからも読み込み（PWA対応）
  try {
    const stored = localStorage.getItem(STORAGE_KEY)
    if (stored) {
      const parsed = JSON.parse(stored)
      if (parsed.version === CURRENT_VERSION) {
        // Cookieに同期を試みる
        setUserPreferencesCookieClient(parsed)
        return parsed
      }
    }
  } catch {
    // エラーは無視
  }
  
  return null
}