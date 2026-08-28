'use client'

import { useEffect } from 'react'
import { useUserPreferences } from '@/hooks/use-user-preferences'

// テーマの初期適用は app/layout.tsx の head 内インラインスクリプトが
// ペイント前に行うため、ここでは「設定変更への追従」だけを担当する。
// 注意: 子要素を visibility:hidden で隠すゲートを入れないこと
// （初回ペイント全体が hydration 完了まで遅延し、LCP を悪化させる）
export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const { preferences } = useUserPreferences()

  useEffect(() => {
    const theme = preferences.theme || 'light'
    if (document.documentElement.getAttribute('data-theme') !== theme) {
      document.documentElement.setAttribute('data-theme', theme)
    }
  }, [preferences.theme])

  return <>{children}</>
}
