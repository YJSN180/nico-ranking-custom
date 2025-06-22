'use client'

import { useUserPreferences } from './use-user-preferences'

export function useTheme() {
  const { preferences } = useUserPreferences()
  
  // user-preferencesから直接テーマを取得
  const theme = preferences.theme || 'light'
  
  return theme as 'light' | 'dark' | 'darkblue'
}