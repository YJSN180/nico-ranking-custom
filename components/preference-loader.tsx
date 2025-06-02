'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { getStoredPreferences } from '@/hooks/use-user-preferences'

export function PreferenceLoader() {
  const router = useRouter()
  
  useEffect(() => {
    // URLにgenreやperiodが指定されていない場合のみ、保存された設定を適用
    const params = new URLSearchParams(window.location.search)
    if (!params.has('genre') && !params.has('period')) {
      const stored = getStoredPreferences()
      if (stored && (stored.lastGenre || stored.lastPeriod)) {
        const newParams = new URLSearchParams()
        if (stored.lastGenre) newParams.set('genre', stored.lastGenre)
        if (stored.lastPeriod) newParams.set('period', stored.lastPeriod)
        if (stored.lastTag) newParams.set('tag', stored.lastTag)
        
        // URLを更新（ページ遷移なし）
        router.replace(`/?${newParams.toString()}`)
      }
    }
  }, [router])
  
  return null
}