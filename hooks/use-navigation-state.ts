'use client'

import { useEffect, useCallback } from 'react'
import { useSearchParams, usePathname } from 'next/navigation'
import { isPWA } from '@/lib/pwa-utils'

interface NavigationState {
  pathname: string
  searchParams: string
  scrollPosition: number
  timestamp: number
}

const STORAGE_KEY = 'navigation-state'
const STATE_EXPIRY = 30 * 60 * 1000 // 30分

/**
 * PWA環境でのナビゲーション状態を保存・復元するフック
 */
export function useNavigationState() {
  const pathname = usePathname()
  const searchParams = useSearchParams()
  
  /**
   * 現在の状態を保存
   */
  const saveState = useCallback(() => {
    // PWAでない場合は保存しない
    if (!isPWA() || !searchParams) return
    
    const state: NavigationState = {
      pathname,
      searchParams: searchParams.toString(),
      scrollPosition: window.scrollY,
      timestamp: Date.now()
    }
    
    try {
      sessionStorage.setItem(STORAGE_KEY, JSON.stringify(state))
    } catch (e) {
      console.warn('Failed to save navigation state:', e)
    }
  }, [pathname, searchParams])
  
  /**
   * 保存された状態を復元
   */
  const restoreState = useCallback(() => {
    // PWAでない場合は復元しない
    if (!isPWA() || !searchParams) return
    
    try {
      const savedState = sessionStorage.getItem(STORAGE_KEY)
      if (!savedState) return
      
      const state: NavigationState = JSON.parse(savedState)
      
      // 有効期限チェック
      if (Date.now() - state.timestamp > STATE_EXPIRY) {
        sessionStorage.removeItem(STORAGE_KEY)
        return
      }
      
      // パスとクエリパラメータが一致する場合のみ復元
      if (state.pathname === pathname && state.searchParams === searchParams.toString()) {
        // スクロール位置を復元（少し遅延させて確実に復元）
        requestAnimationFrame(() => {
          window.scrollTo(0, state.scrollPosition)
        })
      }
    } catch (e) {
      console.warn('Failed to restore navigation state:', e)
    }
  }, [pathname, searchParams])
  
  /**
   * 状態をクリア
   */
  const clearState = useCallback(() => {
    try {
      sessionStorage.removeItem(STORAGE_KEY)
    } catch (e) {
      console.warn('Failed to clear navigation state:', e)
    }
  }, [])
  
  // ページ遷移前に状態を保存
  useEffect(() => {
    if (!isPWA()) return
    
    // beforeunloadイベントで状態を保存
    const handleBeforeUnload = () => {
      saveState()
    }
    
    // visibilitychangeイベントでも保存（モバイル対応）
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'hidden') {
        saveState()
      }
    }
    
    // popstateイベント（ブラウザバック）での復元
    const handlePopState = () => {
      setTimeout(restoreState, 100)
    }
    
    window.addEventListener('beforeunload', handleBeforeUnload)
    document.addEventListener('visibilitychange', handleVisibilityChange)
    window.addEventListener('popstate', handlePopState)
    
    // 初回読み込み時の復元
    restoreState()
    
    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload)
      document.removeEventListener('visibilitychange', handleVisibilityChange)
      window.removeEventListener('popstate', handlePopState)
    }
  }, [saveState, restoreState])
  
  // スクロール位置の定期保存
  useEffect(() => {
    if (!isPWA()) return
    
    let scrollTimeout: NodeJS.Timeout
    
    const handleScroll = () => {
      clearTimeout(scrollTimeout)
      scrollTimeout = setTimeout(saveState, 300)
    }
    
    window.addEventListener('scroll', handleScroll, { passive: true })
    
    return () => {
      window.removeEventListener('scroll', handleScroll)
      clearTimeout(scrollTimeout)
    }
  }, [saveState])
  
  return {
    saveState,
    restoreState,
    clearState
  }
}