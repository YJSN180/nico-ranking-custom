'use client'

import { createContext, useContext, ReactNode, useCallback, useEffect, useState } from 'react'
import { useUserPreferences } from '@/hooks/use-user-preferences'

interface TagDisplayContextType {
  showTags: boolean
  setShowTags: (show: boolean) => void
  toggleTags: () => void
}

const TagDisplayContext = createContext<TagDisplayContextType | undefined>(undefined)

interface TagDisplayProviderProps {
  children: ReactNode
}

export function TagDisplayProvider({ children }: TagDisplayProviderProps) {
  const { preferences, updatePreferences } = useUserPreferences()
  // showTagsがundefinedの場合のみfalseにする（trueの場合はtrueを保持）
  // preferencesがnullの場合も考慮してフォールバック
  const showTags = (preferences?.showTags !== undefined ? preferences.showTags : false) ?? false
  
  // デバッグログ（本番環境では削除）
  if (process.env.NODE_ENV === 'development') {
    console.log('[TagDisplayProvider] Initial showTags:', preferences.showTags, '→', showTags)
  }

  const setShowTags = useCallback((show: boolean) => {
    if (process.env.NODE_ENV === 'development') {
      console.log('[TagDisplayProvider] setShowTags:', show)
    }
    updatePreferences({ showTags: show })
  }, [updatePreferences])

  const toggleTags = useCallback(() => {
    const newValue = !showTags
    if (process.env.NODE_ENV === 'development') {
      console.log('[TagDisplayProvider] toggleTags:', showTags, '→', newValue)
    }
    updatePreferences({ showTags: newValue })
  }, [showTags, updatePreferences])

  return (
    <TagDisplayContext.Provider value={{ showTags, setShowTags, toggleTags }}>
      {children}
    </TagDisplayContext.Provider>
  )
}

export function useTagDisplay() {
  const context = useContext(TagDisplayContext)
  if (context === undefined) {
    throw new Error('useTagDisplay must be used within a TagDisplayProvider')
  }
  return context
}