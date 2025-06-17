'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { getStoredPreferences } from '@/hooks/use-user-preferences'

export function PreferenceLoader() {
  const router = useRouter()
  
  useEffect(() => {
    // URLにgenreやperiodが指定されていない場合のみ、保存された設定を適用
    // ただし、直接アクセス（referrerなし）の場合のみ
    const params = new URLSearchParams(window.location.search)
    const isDirectAccess = !document.referrer || document.referrer === window.location.origin + '/';
    
    if (!params.has('genre') && !params.has('period') && !params.has('tag') && isDirectAccess) {
      const stored = getStoredPreferences()
      if (stored && (stored.lastGenre !== 'all' || stored.lastPeriod !== '24h' || stored.lastTag)) {
        const newParams = new URLSearchParams()
        if (stored.lastGenre && stored.lastGenre !== 'all') newParams.set('genre', stored.lastGenre)
        if (stored.lastPeriod && stored.lastPeriod !== '24h') newParams.set('period', stored.lastPeriod)
        if (stored.lastTag) newParams.set('tag', stored.lastTag)
        
        // URLを更新（ページ遷移なし）
        if (newParams.toString()) {
          router.replace(`/?${newParams.toString()}`)
        }
      }
    }
  }, [router])
  
  return null
}