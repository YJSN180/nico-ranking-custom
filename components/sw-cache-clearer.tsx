"use client"

import { useEffect } from 'react'

// 古い next-pwa / Workbox サービスワーカーと Cache Storage を強制的に掃除する
// localStorage にバージョン番号を保存し、バージョンが変わった時に再度クリーンアップを実行
// これにより、新しい問題が発生した場合にバージョンを上げるだけで全ユーザーに再クリーンアップを適用可能

const CLEANUP_VERSION = '2' // バージョンを上げると全ユーザーで再度クリーンアップが実行される
const FLAG_KEY = 'nr-sw-clear-version'

export function ServiceWorkerClearer() {
  useEffect(() => {
    // 既にこのバージョンでクリーンアップ済みの場合はスキップ
    try {
      if (localStorage.getItem(FLAG_KEY) === CLEANUP_VERSION) return
    } catch {
      // localStorage アクセスが失敗した場合は続行（プライベートブラウジングなど）
    }

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

    // 正しい Promise チェーン: unregister → clearCaches → フラグ設定
    ;(async () => {
      await unregister()
      await clearCaches()
      try {
        localStorage.setItem(FLAG_KEY, CLEANUP_VERSION)
      } catch {
        // localStorage 書き込み失敗は無視
      }
    })()
  }, [])

  return null
}
