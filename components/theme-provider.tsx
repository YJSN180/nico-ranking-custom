'use client'

import { useEffect } from 'react'
import { useUserPreferences } from '@/hooks/use-user-preferences'

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const { preferences } = useUserPreferences()

  useEffect(() => {
    // テーマをHTML要素に適用
    const theme = preferences.theme || 'light'
    document.documentElement.setAttribute('data-theme', theme)
  }, [preferences.theme])

  return <>{children}</>
}