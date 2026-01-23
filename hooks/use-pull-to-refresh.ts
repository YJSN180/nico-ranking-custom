'use client'

import { useEffect, useState, useRef, useCallback } from 'react'
import { isPWA } from '@/lib/pwa-utils'

export function usePullToRefresh() {
  const [isPulling, setIsPulling] = useState(false)
  const [pullDistance, setPullDistance] = useState(0)

  // useRefで状態を保持（useEffectの再実行を防ぐ）
  const stateRef = useRef({
    startY: 0,
    currentY: 0,
    isActive: false,
    pullDistance: 0,
  })

  // リロード実行を別関数に分離
  const executeReload = useCallback(() => {
    document.body.classList.add('pull-to-refresh-loading')

    // キャッシュクリアとリロード
    if ('caches' in window) {
      caches.keys().then((names) => {
        Promise.all(names.map((name) => caches.delete(name))).then(() => {
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
  }, [])

  useEffect(() => {
    // PWA環境でのみ有効
    if (!isPWA()) return

    const handleTouchStart = (e: TouchEvent) => {
      // ページ最上部でのみ開始
      if (window.scrollY === 0) {
        stateRef.current.startY = e.touches[0].pageY
        stateRef.current.isActive = true
      }
    }

    const handleTouchMove = (e: TouchEvent) => {
      if (!stateRef.current.isActive) return

      stateRef.current.currentY = e.touches[0].pageY
      const distance = stateRef.current.currentY - stateRef.current.startY

      // 下方向へのスワイプのみ処理
      if (distance > 0) {
        // 最大150pxまで
        const limitedDistance = Math.min(distance, 150)
        stateRef.current.pullDistance = limitedDistance
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
      if (stateRef.current.isActive && stateRef.current.pullDistance > 80) {
        // リロード実行
        executeReload()
      }

      // リセット
      stateRef.current.isActive = false
      stateRef.current.pullDistance = 0
      setIsPulling(false)
      setPullDistance(0)
      document.body.classList.remove('pull-to-refresh-ready')
    }

    // イベントリスナー登録（オプションを定数化して一貫性を保つ）
    const touchStartOptions: AddEventListenerOptions = { passive: true }
    const touchMoveOptions: AddEventListenerOptions = { passive: false }
    const touchEndOptions: AddEventListenerOptions = { passive: true }

    document.addEventListener('touchstart', handleTouchStart, touchStartOptions)
    document.addEventListener('touchmove', handleTouchMove, touchMoveOptions)
    document.addEventListener('touchend', handleTouchEnd, touchEndOptions)

    return () => {
      // クリーンアップ時も同じオプションを指定（Safari対応）
      document.removeEventListener(
        'touchstart',
        handleTouchStart,
        touchStartOptions
      )
      document.removeEventListener(
        'touchmove',
        handleTouchMove,
        touchMoveOptions
      )
      document.removeEventListener('touchend', handleTouchEnd, touchEndOptions)
      document.body.classList.remove(
        'pull-to-refresh-ready',
        'pull-to-refresh-loading'
      )
    }
  }, [executeReload]) // 依存配列からpullDistanceを削除

  return { isPulling, pullDistance }
}
