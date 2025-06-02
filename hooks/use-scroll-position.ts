import { useEffect, useState, useCallback, useRef } from 'react'

interface UseScrollPositionReturn {
  scrollY: number
  isRestored: boolean
}

export function useScrollPosition(key: string): UseScrollPositionReturn {
  const [scrollY, setScrollY] = useState(0)
  const [isRestored, setIsRestored] = useState(false)
  const saveTimeoutRef = useRef<NodeJS.Timeout>()

  // スクロール位置を保存（デバウンス付き）
  const saveScrollPosition = useCallback(() => {
    if (saveTimeoutRef.current) {
      clearTimeout(saveTimeoutRef.current)
    }
    
    saveTimeoutRef.current = setTimeout(() => {
      sessionStorage.setItem(`scroll-${key}`, window.scrollY.toString())
    }, 100)
  }, [key])

  // スクロールハンドラー
  const handleScroll = useCallback(() => {
    setScrollY(window.scrollY)
    saveScrollPosition()
  }, [saveScrollPosition])

  useEffect(() => {
    // スクロールイベントの登録
    window.addEventListener('scroll', handleScroll)

    // 保存された位置を復元
    const savedPosition = sessionStorage.getItem(`scroll-${key}`)
    if (savedPosition && !isRestored) {
      const position = parseInt(savedPosition, 10)
      // 少し遅延させて確実にコンテンツが表示されてから復元
      setTimeout(() => {
        window.scrollTo(0, position)
        setScrollY(position)
        setIsRestored(true)
      }, 100)
    }

    return () => {
      window.removeEventListener('scroll', handleScroll)
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current)
      }
    }
  }, [key, handleScroll, isRestored])

  return { scrollY, isRestored }
}