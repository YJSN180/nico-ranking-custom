'use client'

import { useLayoutEffect } from 'react'
import { useUserPreferences } from '@/hooks/use-user-preferences'

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const { preferences } = useUserPreferences()

  // useLayoutEffectを使用して、レンダリング前にテーマを適用
  useLayoutEffect(() => {
    // テーマをHTML要素に適用
    const theme = preferences.theme || 'light'
    document.documentElement.setAttribute('data-theme', theme)
  }, [preferences.theme])

  return <>{children}</>
}