'use client'

import { useEffect, useCallback, useRef } from 'react'
import { useSearchParams, usePathname } from 'next/navigation'

interface NavigationState {
  pathname: string
  searchParams: string
  scrollPosition: number
  timestamp: number
}

interface UseNavigationStateOptions {
  /**
   * 表示中のページの内容がそろっているか（既定 true）。false の間はスクロール位置の復元を保留し、
   * true になった時点で復元する。ランキングの 2 ページ目以降は全件の補完が終わるまで
   * 内容が無いため、先に戻すと位置がずれる（X-e）
   */
  isReady?: boolean
}

const STORAGE_KEY = 'navigation-state'
const STATE_EXPIRY = 30 * 60 * 1000 // 30分

/**
 * ナビゲーション状態（スクロール位置等）を保存・復元するフック。
 * 元はPWA限定だったが、通常ブラウザの「戻る」でも
 * 検索→動画→戻る の体験を改善するため全環境に適用（フェーズ3-3）
 */
export function useNavigationState({ isReady = true }: UseNavigationStateOptions = {}) {
  const pathname = usePathname()
  const searchParams = useSearchParams()
  // 内容がそろうまで保留している復元先のスクロール位置
  const pendingScrollRef = useRef<number | null>(null)
  const isReadyRef = useRef(isReady)

  useEffect(() => {
    isReadyRef.current = isReady
    if (!isReady || pendingScrollRef.current === null) return
    const scrollPosition = pendingScrollRef.current
    pendingScrollRef.current = null
    requestAnimationFrame(() => {
      window.scrollTo(0, scrollPosition)
    })
  }, [isReady])

  /**
   * 現在の状態を保存
   */
  const saveState = useCallback(() => {
    if (!searchParams) return

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
    if (!searchParams) return

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
        if (isReadyRef.current) {
          // スクロール位置を復元（少し遅延させて確実に復元）
          requestAnimationFrame(() => {
            window.scrollTo(0, state.scrollPosition)
          })
        } else {
          // 内容がそろってから復元する（上の isReady の effect）
          pendingScrollRef.current = state.scrollPosition
        }
      } else {
        // ページ（クエリ）が変わったら、保留中の復元は当てはまらない
        pendingScrollRef.current = null
      }
    } catch (e) {
      console.warn('Failed to restore navigation state:', e)
    }
  }, [pathname, searchParams])

  /**
   * 状態をクリア
   */
  const clearState = useCallback(() => {
    pendingScrollRef.current = null
    try {
      sessionStorage.removeItem(STORAGE_KEY)
    } catch (e) {
      console.warn('Failed to clear navigation state:', e)
    }
  }, [])

  // ページ遷移前に状態を保存
  useEffect(() => {
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
