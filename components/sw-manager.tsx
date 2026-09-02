'use client'

import { useEffect } from 'react'

// Service Worker 管理（UX改善計画 フェーズ5-1）
// 旧構成では「一回きりの掃除（ServiceWorkerClearer, layout）」と
// 「登録（PWARegister, トップページのみ）」が別コンポーネントで並走しており、
// 初回訪問時に登録直後のSWを掃除側が unregister しうるレースがあった。
// ここでは「必要なら掃除 → その後に登録」を単一の直列フローに統合する。
//
// 掃除: 古い next-pwa / Workbox のSWとCache Storageを一掃する移行コード。
// CLEANUP_VERSION を上げると全ユーザーで再実行される。
const CLEANUP_VERSION = '3'
const FLAG_KEY = 'nr-sw-clear-version'

export function ServiceWorkerManager() {
  useEffect(() => {
    if (typeof window === 'undefined' || !('serviceWorker' in navigator)) return

    const needsCleanup = (() => {
      try {
        return localStorage.getItem(FLAG_KEY) !== CLEANUP_VERSION
      } catch {
        return true // localStorage不可（プライベートブラウジング等）でも掃除は安全
      }
    })()

    const cleanup = async () => {
      try {
        const regs = await navigator.serviceWorker.getRegistrations()
        await Promise.all(regs.map((reg) => reg.unregister()))
      } catch (error) {
        console.warn('[ServiceWorkerManager] unregister failed', error)
      }
      try {
        if (typeof caches !== 'undefined') {
          const keys = await caches.keys()
          await Promise.all(keys.map((key) => caches.delete(key)))
        }
      } catch (error) {
        console.warn('[ServiceWorkerManager] cache cleanup failed', error)
      }
      try {
        localStorage.setItem(FLAG_KEY, CLEANUP_VERSION)
      } catch {
        // 書き込み失敗は無視
      }
    }

    const register = async () => {
      try {
        await navigator.serviceWorker.register('/sw.js', {
          scope: '/',
          updateViaCache: 'none'
        })
      } catch {
        // 登録失敗は静かに無視（PWA機能が使えないだけでサイトは動く）
      }
    }

    ;(async () => {
      if (needsCleanup) {
        await cleanup()
      }
      await register()
    })()
  }, [])

  return null
}
