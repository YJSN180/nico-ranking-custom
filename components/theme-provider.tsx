'use client'

import { useLayoutEffect, useEffect, useState } from 'react'
import { useUserPreferences } from '@/hooks/use-user-preferences'

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [isClient, setIsClient] = useState(false)
  const { preferences } = useUserPreferences()

  // クライアントサイドでのみ実行
  useEffect(() => {
    setIsClient(true)
  }, [])

  // useLayoutEffectを使用して、レンダリング前にテーマを適用
  useLayoutEffect(() => {
    if (!isClient) return
    
    // テーマをHTML要素に適用
    const theme = preferences.theme || 'light'
    document.documentElement.setAttribute('data-theme', theme)
  }, [preferences.theme, isClient])

  return <>{children}</>
}