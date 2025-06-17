'use client'

import { useUserPreferences } from './use-user-preferences'

export function useTheme() {
  const { preferences } = useUserPreferences()
  
  // user-preferencesから直接テーマを取得
  // 'dark-blue'は'darkblue'に正規化されているので変換
  const theme = preferences.theme === 'darkblue' ? 'dark-blue' : (preferences.theme || 'light')
  
  return theme as 'light' | 'dark' | 'dark-blue'
}