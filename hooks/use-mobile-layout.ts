import { useEffect, useState } from 'react'

export interface MobileLayout {
  isMobile: boolean
  isNarrow: boolean
  isVeryNarrow: boolean
}

export function useMobileLayout(): MobileLayout {
  const [layout, setLayout] = useState<MobileLayout>({
    isMobile: false,
    isNarrow: false,
    isVeryNarrow: false
  })

  useEffect(() => {
    let timeoutId: NodeJS.Timeout
    
    const checkLayout = () => {
      const width = window.innerWidth
      setLayout(prevLayout => {
        const newLayout = {
          isMobile: width <= 640,
          isNarrow: width <= 375,
          isVeryNarrow: width <= 320
        }
        
        // 値が変わった場合のみ更新（不要な再レンダリングを防ぐ）
        if (
          prevLayout.isMobile === newLayout.isMobile &&
          prevLayout.isNarrow === newLayout.isNarrow &&
          prevLayout.isVeryNarrow === newLayout.isVeryNarrow
        ) {
          return prevLayout
        }
        
        return newLayout
      })
    }

    // デバウンス付きのresize handler
    const handleResize = () => {
      clearTimeout(timeoutId)
      timeoutId = setTimeout(checkLayout, 150)
    }

    // 初回チェック
    checkLayout()
    
    // passiveオプションでパフォーマンス向上
    window.addEventListener('resize', handleResize, { passive: true })
    
    return () => {
      window.removeEventListener('resize', handleResize)
      clearTimeout(timeoutId)
    }
  }, [])

  return layout
}