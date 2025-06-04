import { useEffect, useState } from 'react'

export function useMobileDetect() {
  const [isMobile, setIsMobile] = useState(false)

  useEffect(() => {
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

    checkMobile()
    window.addEventListener('resize', handleResize)
    
    return () => {
      window.removeEventListener('resize', handleResize)
      clearTimeout(timeoutId)
    }
  }, [])

  return isMobile
}