'use client'

import { RefreshCw } from 'lucide-react'
import { isPWA } from '@/lib/pwa-utils'
import { useState, useEffect } from 'react'
import styles from './reload-button.module.css'

export function ReloadButton() {
  const [isReloading, setIsReloading] = useState(false)
  const [isDebugMode, setIsDebugMode] = useState(false)
  
  useEffect(() => {
    // URLパラメータでデバッグモードをチェック
    if (typeof window !== 'undefined') {
      const params = new URLSearchParams(window.location.search)
      setIsDebugMode(params.get('debug-pwa') === 'true')
    }
  }, [])

  const handleReload = async () => {
    setIsReloading(true)

    // 1. 古いService Workerを解除（Workbox SWなど）
    if ('serviceWorker' in navigator) {
      try {
        const registrations = await navigator.serviceWorker.getRegistrations()
        await Promise.all(registrations.map(reg => reg.unregister()))
      } catch (error) {
        console.error('Failed to unregister service workers:', error)
      }
    }

    // 2. Service Workerのキャッシュをクリア
    if ('caches' in window) {
      try {
        const cacheNames = await caches.keys()
        await Promise.all(
          cacheNames.map(name => caches.delete(name))
        )
      } catch (error) {
        console.error('Failed to clear caches:', error)
      }
    }

    // 3. localStorageのSWクリアフラグをリセット（次回ロード時に再度クリア実行）
    try {
      localStorage.removeItem('nr-sw-clear-version')
    } catch {
      // localStorage access may fail in some contexts
    }

    // 少し待ってからリロード（アニメーション表示のため）
    setTimeout(() => {
      window.location.reload()
    }, 500)
  }

  // PWA環境またはデバッグモードでのみ表示
  if (!isPWA() && !isDebugMode) return null

  return (
    <button
      onClick={handleReload}
      disabled={isReloading}
      className={styles.reloadButton}
      aria-label="ページをリロード"
      title="ページをリロード (Ctrl+R)"
    >
      <RefreshCw 
        size={20} 
        className={isReloading ? styles.spinning : ''} 
      />
      <span className={styles.tooltip}>リロード</span>
    </button>
  )
}