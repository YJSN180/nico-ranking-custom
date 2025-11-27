"use client"

import { useEffect } from 'react'

// 古い next-pwa / Workbox サービスワーカーと Cache Storage を強制的に掃除する
// 既存ユーザー環境で stale データが残るのを防ぐため、1 セッション 1 回だけ実行する
export function ServiceWorkerClearer() {
  useEffect(() => {
    const flagKey = 'nr-sw-clear-done'
    if (typeof window === 'undefined') return
    if (sessionStorage.getItem(flagKey)) return

    const unregister = async () => {
      try {
        if ('serviceWorker' in navigator) {
          const regs = await navigator.serviceWorker.getRegistrations()
          await Promise.all(regs.map((reg) => reg.unregister()))
        }
      } catch (error) {
        console.warn('[ServiceWorkerClearer] unregister failed', error)
      }
    }

    const clearCaches = async () => {
      try {
        if (typeof caches !== 'undefined') {
          const keys = await caches.keys()
          // Workbox/next-pwa が生成したキャッシュは全削除
          await Promise.all(keys.map((key) => caches.delete(key)))
        }
      } catch (error) {
        console.warn('[ServiceWorkerClearer] cache cleanup failed', error)
      }
    }

    unregister().finally(clearCaches).finally(() => {
      sessionStorage.setItem(flagKey, '1')
    })
  }, [])

  return null
}

