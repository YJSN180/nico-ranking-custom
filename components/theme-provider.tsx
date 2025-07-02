'use client'

import { useLayoutEffect, useEffect, useState } from 'react'
import { useUserPreferences } from '@/hooks/use-user-preferences'

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [isClient, setIsClient] = useState(false)
  const [themeReady, setThemeReady] = useState(false)
  const { preferences } = useUserPreferences()

  // クライアントサイドでのみ実行
  useEffect(() => {
    setIsClient(true)
  }, [])

  // 初期テーマを即座に適用（FOUC対策）
  useLayoutEffect(() => {
    if (!isClient) return
    
    // デフォルトテーマを即座に適用
    const currentTheme = document.documentElement.getAttribute('data-theme')
    if (!currentTheme) {
      document.documentElement.setAttribute('data-theme', 'light')
    }
    setThemeReady(true)
  }, [isClient])

  // ユーザー設定のテーマを適用
  useLayoutEffect(() => {
    if (!isClient || !themeReady) return
    
    const theme = preferences.theme || 'light'
    const currentTheme = document.documentElement.getAttribute('data-theme')
    
    // テーマが変更された場合のみ更新（不要な再描画を防止）
    if (currentTheme !== theme) {
      document.documentElement.setAttribute('data-theme', theme)
    }
  }, [preferences.theme, isClient, themeReady])

  // テーマ適用完了まで子要素を非表示（FOUC完全回避）
  if (!isClient || !themeReady) {
    return (
      <div style={{ 
        visibility: 'hidden',
        position: 'absolute',
        top: 0,
        left: 0,
        width: '100%',
        height: '100%'
      }}>
        {children}
      </div>
    )
  }

  return <>{children}</>
}