'use client'

import { createContext, useContext, ReactNode, useCallback } from 'react'
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
  const showTags = preferences.showTags ?? false

  const setShowTags = useCallback((show: boolean) => {
    updatePreferences({ showTags: show })
  }, [updatePreferences])

  const toggleTags = useCallback(() => {
    updatePreferences({ showTags: !showTags })
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