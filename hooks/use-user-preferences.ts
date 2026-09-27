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

// 同じタブでこのフックを使う他の箇所（ページ・設定モーダル・ナビ・テーマ）へ保存した設定を知らせる
const PREFERENCES_UPDATED_EVENT = 'userPreferencesUpdated'

function isCurrentPreferences(value: unknown): value is Partial<UserPreferences> {
  return typeof value === 'object' && value !== null && 'version' in value && value.version === CURRENT_VERSION
}

/**
 * 保存済みの設定を読む（Cookie、なければ localStorage の控え）。どちらも無ければ null
 */
function readStoredPreferences(): UserPreferences | null {
  if (typeof window === 'undefined') return null

  const cookiePrefs = getUserPreferencesCookieClient()
  if (isCurrentPreferences(cookiePrefs)) {
    return { ...defaultPreferences, ...cookiePrefs }
  }

  try {
    const stored = localStorage.getItem(STORAGE_KEY)
    if (stored) {
      const parsed: unknown = JSON.parse(stored)
      if (isCurrentPreferences(parsed)) {
        return { ...defaultPreferences, ...parsed }
      }
    }
  } catch {
    // 読めなければ保存なしとして扱う
  }
  return null
}

/**
 * Cookie と localStorage の控えに保存し、同じタブの他の箇所に知らせる
 */
function persistPreferences(prefs: UserPreferences): void {
  try {
    setUserPreferencesCookieClient(prefs)
  } catch {
    // Cookie save error - silent fail
  }

  // localStorageにも保存（PWA環境のフォールバック）
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(prefs))
  } catch {
    // localStorage save error - silent fail
  }

  window.dispatchEvent(new CustomEvent<UserPreferences>(PREFERENCES_UPDATED_EVENT, { detail: prefs }))
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
      
      // Cookieがない場合、localStorageから読み込む（PWA対応）。
      // 控えは消さない: app/layout.tsx の描画前スクリプトがテーマを当てるのに読み、
      // Cookie がまた失効したとき（Safari は JS で書いた Cookie を 7 日で失効させる）の戻り先にもなる
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

  // 他の箇所（同じタブ）や他のタブで保存された設定に追従する
  useEffect(() => {
    const handleUpdated = (event: Event): void => {
      if (event instanceof CustomEvent && isCurrentPreferences(event.detail)) {
        setPreferences({ ...defaultPreferences, ...event.detail })
      }
    }
    const handleStorage = (event: StorageEvent): void => {
      if (event.key !== STORAGE_KEY || !event.newValue) return
      const stored = readStoredPreferences()
      if (stored) {
        setPreferences(stored)
      }
    }

    window.addEventListener(PREFERENCES_UPDATED_EVENT, handleUpdated)
    window.addEventListener('storage', handleStorage)
    return () => {
      window.removeEventListener(PREFERENCES_UPDATED_EVENT, handleUpdated)
      window.removeEventListener('storage', handleStorage)
    }
  }, [])

  // 設定を更新。このインスタンスが持つ値ではなく保存済みの最新値に重ねる
  // （ページ・設定モーダル・ナビがそれぞれこのフックを持つため、古い値で他の箇所の変更を上書きしない）
  const updatePreferences = useCallback((updates: Partial<UserPreferences>): void => {
    const newPrefs: UserPreferences = {
      ...(readStoredPreferences() ?? preferences),
      ...updates,
      updatedAt: new Date().toISOString(),
    }
    setPreferences(newPrefs)
    persistPreferences(newPrefs)
  }, [preferences])

  // 設定をリセット
  const resetPreferences = useCallback((): void => {
    const newPrefs = {
      ...defaultPreferences,
      updatedAt: new Date().toISOString(),
    }
    setPreferences(newPrefs)
    persistPreferences(newPrefs)
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
        // Cookieに同期を試みる（localStorage の控えは残す）
        setUserPreferencesCookieClient(parsed)
        return parsed
      }
    }
  } catch {
    // エラーは無視
  }
  
  return null
}
