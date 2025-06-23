'use client'

import { useState, useEffect } from 'react'

export function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState(false)

  useEffect(() => {
    const media = window.matchMedia(query)
    
    // 初期値を設定
    setMatches(media.matches)

    // リスナーの設定
    const listener = (event: MediaQueryListEvent) => {
      setMatches(event.matches)
    }

    // addEventListener/removeEventListenerの代わりにaddListener/removeListenerを使う（互換性のため）
    if (media.addEventListener) {
      media.addEventListener('change', listener)
    } else {
      media.addListener(listener)
    }

    return () => {
      if (media.removeEventListener) {
        media.removeEventListener('change', listener)
      } else {
        media.removeListener(listener)
      }
    }
  }, [query])

  return matches
}