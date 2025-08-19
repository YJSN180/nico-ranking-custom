'use client'

import { useEffect } from 'react'

export function useKeyboardShortcuts() {
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Ctrl/Cmd + R でリロード
      if ((e.ctrlKey || e.metaKey) && e.key === 'r') {
        e.preventDefault()
        
        // キャッシュクリアしてリロード
        const performReload = () => {
          if (typeof window !== 'undefined' && window.location) {
            window.location.reload()
          }
        }
        
        if ('caches' in window) {
          caches.keys().then(names => {
            Promise.all(names.map((name: string) => caches.delete(name)))
              .then(() => {
                performReload()
              })
          })
        } else {
          performReload()
        }
      }
      
      // F5キーでリロード
      if (e.key === 'F5') {
        e.preventDefault()
        if (typeof window !== 'undefined' && window.location) {
          window.location.reload()
        }
      }
    }

    // イベントリスナー登録
    document.addEventListener('keydown', handleKeyDown)

    return () => {
      document.removeEventListener('keydown', handleKeyDown)
    }
  }, [])
}