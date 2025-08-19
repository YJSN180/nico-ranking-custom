'use client'

import { useEffect, useState } from 'react'
import { isPWA } from '@/lib/pwa-utils'

export function usePullToRefresh() {
  const [isPulling, setIsPulling] = useState(false)
  const [pullDistance, setPullDistance] = useState(0)

  useEffect(() => {
    // PWA環境でのみ有効
    if (!isPWA()) return

    let startY = 0
    let currentY = 0
    let isActive = false

    const handleTouchStart = (e: TouchEvent) => {
      // ページ最上部でのみ開始
      if (window.scrollY === 0) {
        startY = e.touches[0].pageY
        isActive = true
      }
    }

    const handleTouchMove = (e: TouchEvent) => {
      if (!isActive) return
      
      currentY = e.touches[0].pageY
      const distance = currentY - startY
      
      // 下方向へのスワイプのみ処理
      if (distance > 0) {
        // 最大150pxまで
        const limitedDistance = Math.min(distance, 150)
        setPullDistance(limitedDistance)
        setIsPulling(true)
        
        // プルダウンインジケーターを表示
        if (limitedDistance > 80) {
          document.body.classList.add('pull-to-refresh-ready')
        } else {
          document.body.classList.remove('pull-to-refresh-ready')
        }
        
        // スクロールを防止
        if (distance > 10) {
          e.preventDefault()
        }
      }
    }

    const handleTouchEnd = () => {
      if (isActive && pullDistance > 80) {
        // リロード実行
        document.body.classList.add('pull-to-refresh-loading')
        
        // キャッシュクリアとリロード
        if ('caches' in window) {
          caches.keys().then(names => {
            Promise.all(names.map(name => caches.delete(name)))
              .then(() => {
                setTimeout(() => {
                  window.location.reload()
                }, 500)
              })
          })
        } else {
          setTimeout(() => {
            window.location.reload()
          }, 500)
        }
      }
      
      // リセット
      isActive = false
      setIsPulling(false)
      setPullDistance(0)
      document.body.classList.remove('pull-to-refresh-ready')
    }

    // イベントリスナー登録
    document.addEventListener('touchstart', handleTouchStart, { passive: true })
    document.addEventListener('touchmove', handleTouchMove, { passive: false })
    document.addEventListener('touchend', handleTouchEnd, { passive: true })

    return () => {
      document.removeEventListener('touchstart', handleTouchStart)
      document.removeEventListener('touchmove', handleTouchMove)
      document.removeEventListener('touchend', handleTouchEnd)
      document.body.classList.remove('pull-to-refresh-ready', 'pull-to-refresh-loading')
    }
  }, [pullDistance])

  return { isPulling, pullDistance }
}