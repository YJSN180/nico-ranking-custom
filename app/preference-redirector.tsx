'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { getStoredPreferences } from '@/hooks/use-user-preferences'

export function PreferenceRedirector() {
  const router = useRouter()
  
  useEffect(() => {
    // サーバーサイドでは実行しない
    if (typeof window === 'undefined') return
    
    // URLパラメータがある場合は何もしない
    const currentParams = new URLSearchParams(window.location.search)
    if (currentParams.has('genre') || currentParams.has('period') || currentParams.has('tag')) {
      return
    }
    
    // 直接アクセスのみ処理（リファラーがない、または同一オリジン）
    const referrer = document.referrer
    const currentOrigin = window.location.origin
    const isDirectAccess = !referrer || referrer === '' || 
                          referrer === currentOrigin || 
                          referrer === currentOrigin + '/' ||
                          referrer.startsWith(currentOrigin + '/?') ||
                          referrer.startsWith(currentOrigin + '/#')
    
    if (!isDirectAccess) {
      return
    }
    
    // 保存された設定を読み込む
    const preferences = getStoredPreferences()
    if (!preferences || 
        (preferences.lastGenre === 'all' && 
         preferences.lastPeriod === '24h' && 
         !preferences.lastTag)) {
      // デフォルト設定の場合は何もしない
      return
    }
    
    // URLパラメータを構築
    const params = new URLSearchParams()
    if (preferences.lastGenre && preferences.lastGenre !== 'all') {
      params.set('genre', preferences.lastGenre)
    }
    if (preferences.lastPeriod && preferences.lastPeriod !== '24h') {
      params.set('period', preferences.lastPeriod)
    }
    if (preferences.lastTag) {
      params.set('tag', preferences.lastTag)
    }
    
    // パラメータがある場合のみリダイレクト
    if (params.toString()) {
      router.replace(`/?${params.toString()}`)
    }
  }, [router])
  
  return null
}