'use client'

import { createContext, useContext, useState, ReactNode } from 'react'

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
  const [showTags, setShowTags] = useState(false)

  const toggleTags = () => {
    setShowTags(prev => !prev)
  }

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