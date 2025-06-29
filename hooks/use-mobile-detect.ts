import { useEffect, useState } from 'react'

export function useMobileDetect() {
  // SSRとの一貫性のため、初期値は常にfalse
  const [isMobile, setIsMobile] = useState(false)
  const [isHydrated, setIsHydrated] = useState(false)

  useEffect(() => {
    if (typeof window === 'undefined') return
    
    let timeoutId: NodeJS.Timeout
    
    const checkMobile = () => {
      const newIsMobile = window.innerWidth <= 640
      setIsMobile(prevIsMobile => {
        // 値が変わった場合のみ更新
        if (prevIsMobile !== newIsMobile) {
          return newIsMobile
        }
        return prevIsMobile
      })
    }

    // デバウンス付きのresize handler
    const handleResize = () => {
      clearTimeout(timeoutId)
      timeoutId = setTimeout(checkMobile, 150)
    }

    // 初回のチェックを実行
    checkMobile()
    // ハイドレーション完了をマーク
    setIsHydrated(true)
    
    window.addEventListener('resize', handleResize)
    
    return () => {
      window.removeEventListener('resize', handleResize)
      clearTimeout(timeoutId)
    }
  }, [])

  return isMobile
}