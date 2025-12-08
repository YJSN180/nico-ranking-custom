'use client'

import { useEffect, useRef, useCallback } from 'react'

/**
 * BFCache（Back-Forward Cache）からの復元を検出し、
 * 古いデータを防ぐためにリフレッシュコールバックを実行するフック
 *
 * BFCacheは、ブラウザの「戻る」「進む」ナビゲーション時にページを
 * メモリから即座に復元する機能。これにより、SSRで埋め込まれた
 * 古いデータがそのまま表示されてしまう問題を防ぐ。
 *
 * @param onBFCacheRestore BFCacheから復元された際に呼び出されるコールバック
 * @param options.maxAge キャッシュの有効期限（ミリ秒）。この時間を超えた場合のみリフレッシュ
 */
export function useBFCacheRefresh(
  onBFCacheRestore: () => void,
  options: { maxAge?: number } = {}
) {
  const { maxAge = 5 * 60 * 1000 } = options // デフォルト5分
  const pageLoadTimeRef = useRef<number>(Date.now())
  const hasRefreshedRef = useRef<boolean>(false)

  const handlePageShow = useCallback((event: PageTransitionEvent) => {
    // event.persisted === true の場合、ページはBFCacheから復元された
    if (event.persisted) {
      const now = Date.now()
      const elapsed = now - pageLoadTimeRef.current

      // maxAgeを超えている場合のみリフレッシュを実行
      // これにより、短時間の「戻る」操作では不要なリフェッチを避ける
      if (elapsed > maxAge && !hasRefreshedRef.current) {
        hasRefreshedRef.current = true
        onBFCacheRestore()
        // ページロード時間を更新（次回のBFCache復元検出用）
        pageLoadTimeRef.current = now
        hasRefreshedRef.current = false
      }
    } else {
      // 通常のページロード時は時間をリセット
      pageLoadTimeRef.current = Date.now()
      hasRefreshedRef.current = false
    }
  }, [onBFCacheRestore, maxAge])

  useEffect(() => {
    // pageshowイベントをリッスン
    // このイベントは通常のページロードとBFCache復元の両方で発火する
    window.addEventListener('pageshow', handlePageShow)

    return () => {
      window.removeEventListener('pageshow', handlePageShow)
    }
  }, [handlePageShow])
}

/**
 * PWA環境でのアプリ再開時にデータをリフレッシュするフック
 *
 * PWAでは、アプリがバックグラウンドから復帰した際に
 * 古いデータが表示される可能性がある。visibilitychangeイベントで検出する。
 *
 * @param onResume アプリが再開された際に呼び出されるコールバック
 * @param options.maxAge キャッシュの有効期限（ミリ秒）
 */
export function usePWAResumeRefresh(
  onResume: () => void,
  options: { maxAge?: number } = {}
) {
  const { maxAge = 5 * 60 * 1000 } = options // デフォルト5分
  const lastActiveTimeRef = useRef<number>(Date.now())
  const isRefreshingRef = useRef<boolean>(false)

  const handleVisibilityChange = useCallback(() => {
    if (document.visibilityState === 'visible') {
      const now = Date.now()
      const elapsed = now - lastActiveTimeRef.current

      // maxAgeを超えている場合のみリフレッシュを実行
      if (elapsed > maxAge && !isRefreshingRef.current) {
        isRefreshingRef.current = true
        onResume()
        lastActiveTimeRef.current = now
        // リフレッシュ完了後にフラグをリセット（debounce的な役割）
        setTimeout(() => {
          isRefreshingRef.current = false
        }, 1000)
      }
    } else {
      // hidden状態になった時間を記録
      lastActiveTimeRef.current = Date.now()
    }
  }, [onResume, maxAge])

  useEffect(() => {
    document.addEventListener('visibilitychange', handleVisibilityChange)

    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange)
    }
  }, [handleVisibilityChange])
}
