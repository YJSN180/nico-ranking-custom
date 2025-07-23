'use client'

import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { RankingSelector } from '@/components/ranking-selector'
import RankingItemResponsive from '@/components/ranking-item-responsive'
import { VideoContextMenu } from '@/components/video-context-menu'
import { useUserPreferences } from '@/hooks/use-user-preferences'
import { generateNGListHash } from '@/lib/ng-list-hash'
import { filterWithExtendedNGList } from '@/lib/filter-with-extended-ng-list'

// 直接インポート（まず動作確認）
import Pagination from '@/components/pagination'
import { TagSelector } from '@/components/tag-selector'
import { useUserNGListExtended } from '@/hooks/use-user-ng-list-extended'
import { useRankingData } from '@/hooks/use-ranking-data'
import { useGenreOrderV2 } from '@/hooks/use-genre-order-v2'
import { getPopularTagsClient } from '@/lib/popular-tags-client'
import { migrateLocalStorageData } from '@/lib/migrate-local-storage'
import type { RankingData, RankingItem } from '@/types/ranking'
import type { RankingConfig, RankingGenre } from '@/types/ranking-config'
import type { NGList } from '@/types/ng-list'
import { useNavigationState } from '@/hooks/use-navigation-state'
import { TagDisplayProvider, useTagDisplay } from '@/contexts/tag-display-context'
import './client-page.css'
import '@/components/ranking-item-responsive.css'

interface ClientPageProps {
  initialData: { items: RankingItem[], popularTags?: string[] }
  initialGenre?: string
  initialPeriod?: string
  initialTag?: string
  initialPage?: number
  popularTags?: string[]
}

// ページネーション設定
const ITEMS_PER_PAGE = 100   // ページあたりの表示件数（DOM要素数削減のため）
const DISPLAY_LIMITS = {
  TAG: 300,      // タグ別ランキングは全300件取得
  GENRE: 500,    // ジャンル別ランキングは500件取得
}

// PWAモードかどうかを検出
const isPWA = () => {
  return window.matchMedia('(display-mode: standalone)').matches ||
         (window.navigator as any).standalone === true ||
         document.referrer.includes('android-app://') // Androidの場合
}

// タグ表示トグルボタンコンポーネント
function TagToggleButton() {
  const { showTags, toggleTags } = useTagDisplay()
  
  return (
    <button
      data-testid="tag-toggle-button"
      onClick={toggleTags}
      style={{
        padding: '6px 12px',
        fontSize: '12px',
        backgroundColor: showTags ? 'var(--primary-color)' : 'var(--surface-secondary)',
        color: showTags ? 'white' : 'var(--text-primary)',
        border: '1px solid var(--border-color)',
        borderRadius: '4px',
        cursor: 'pointer',
        transition: 'all 0.2s',
        fontWeight: '500',
        whiteSpace: 'nowrap'
      }}
      onMouseEnter={(e) => {
        if (!showTags) {
          e.currentTarget.style.backgroundColor = 'var(--surface-hover)'
        }
      }}
      onMouseLeave={(e) => {
        if (!showTags) {
          e.currentTarget.style.backgroundColor = 'var(--surface-secondary)'
        }
      }}
    >
      🏷️ タグ{showTags ? '非表示' : '表示'}
    </button>
  )
}

export default function ClientPage({ 
  initialData, 
  initialGenre = 'all', 
  initialPeriod = '24h', 
  initialTag, 
  initialPage = 1,
  popularTags = []
}: ClientPageProps) {
  const router = useRouter()
  const searchParams = useSearchParams()
  
  // ユーザー設定の永続化
  const { preferences, updatePreferences } = useUserPreferences()
  const { ngList } = useUserNGListExtended()
  const { visibleGenres } = useGenreOrderV2()
  
  // PWA環境でのナビゲーション状態管理
  useNavigationState()
  
  // 選択中のジャンルが非表示になった場合、最初の表示可能なジャンルに切り替える
  useEffect(() => {
    if (visibleGenres.length > 0 && !visibleGenres.includes(config.genre)) {
      // 現在のジャンルが非表示になった場合、最初の表示可能なジャンルに切り替え
      handleConfigChange({ ...config, genre: visibleGenres[0], tag: undefined })
    }
  }, [visibleGenres]) // eslint-disable-line react-hooks/exhaustive-deps
  
  // NGリストのバージョンを追跡（更新時に強制再レンダリング）
  const ngListVersion = useMemo(() => {
    // 軽量なハッシュ関数を使用（JSON.stringifyよりも高速）
    return generateNGListHash(ngList).toString()
  }, [ngList])
  
  // ランキングデータ管理フック
  const {
    rankingData,
    fullRankingData,
    currentPopularTags,
    loading,
    error,
    fetchRankingData,
    setCurrentPopularTags,
    setRankingData,
    setFullRankingData,
    setError,
    abortControllerRef,
    tagsAbortControllerRef,
    isFallbackInitiatedRef
  } = useRankingData({
    initialData,
    ngList,
    ngListVersion
  })
  
  // 設定の管理（初期値はURLパラメータから）
  const [config, setConfig] = useState<RankingConfig>(() => {
    return {
      period: initialPeriod as '24h' | 'hour',
      genre: initialGenre as RankingGenre,
      tag: initialTag
    }
  })
  
  // 初回ロードを追跡（二重リクエスト防止用）
  const [isInitialLoad, setIsInitialLoad] = useState(true)
  
  // ページ状態の管理
  const [currentPage, setCurrentPage] = useState(initialPage)
  
  // 外部ナビゲーション中の状態管理（UX制御）
  const [isNavigating, setIsNavigating] = useState(false)
  
  
  // CSS-onlyレスポンシブ対応により、JSでのモバイル検出は不要
  
  // 初回マウント時にデータ移行を実行
  useEffect(() => {
    migrateLocalStorageData()
  }, [])
  
  // ページ離脱時に現在の設定をlocalStorageに保存（PWA対応）
  useEffect(() => {
    const saveCurrentState = () => {
      const stateToSave = {
        genre: config.genre,
        period: config.period,
        tag: config.tag,
        page: currentPage,
        popularTags: currentPopularTags,
        scrollPosition: window.pageYOffset || document.documentElement.scrollTop || 0,
        savedAt: Date.now()
      }
      // PWAでも動作するようにlocalStorageを使用
      localStorage.setItem('ranking-navigation-state', JSON.stringify(stateToSave))
      
      // PWAモードでストレージ永続化をリクエスト（iOS WebKit対応）
      if (isPWA() && 'storage' in navigator && 'persist' in navigator.storage) {
        navigator.storage.persist().catch(() => {
          // エラーは無視（対応していないブラウザの場合）
        })
      }
    }
    
    // ページ離脱時に保存
    window.addEventListener('beforeunload', saveCurrentState)
    
    // PWA環境での追加イベント対応
    window.addEventListener('pagehide', saveCurrentState)
    
    // iOSでのPWA対応
    window.addEventListener('blur', () => {
      // PWAモードでアプリが非アクティブになった時に保存
      if (isPWA()) {
        saveCurrentState()
      }
    })
    
    // 外部リンククリック時に状態を保存
    const handleExternalNavigation = (e: MouseEvent) => {
      const target = e.target as HTMLElement
      const link = target.closest('a')
      
      // 外部リンク（ニコニコ動画など）の場合に状態を保存
      if (link && link.href && (link.href.includes('nicovideo.jp') || link.href.includes('niconico.jp') || link.href.includes('ch.nicovideo.jp') || link.href.includes('com.nicovideo.jp'))) {
        saveCurrentState()
        setIsNavigating(true)
      }
      
      // 内部リンク（メニューページ）の場合も状態を保存
      if (link && link.href && !link.href.includes('nicovideo.jp') && !link.href.includes('niconico.jp')) {
        const url = new URL(link.href)
        if (url.origin === window.location.origin && url.pathname !== '/') {
          saveCurrentState()
        }
      }
    }
    
    document.addEventListener('click', handleExternalNavigation)
    
    // ページフォーカス状態の監視（外部サイトから戻ってきた際の検出）
    const handleVisibilityChange = () => {
      if (!document.hidden) {
        // ページが再びアクティブになった場合、ナビゲーション状態をリセット
        setIsNavigating(false)
      }
    }
    
    const handleFocus = () => {
      // ページがフォーカスを取り戻した場合、ナビゲーション状態をリセット
      setIsNavigating(false)
    }
    
    document.addEventListener('visibilitychange', handleVisibilityChange)
    window.addEventListener('focus', handleFocus)
    
    return () => {
      window.removeEventListener('beforeunload', saveCurrentState)
      window.removeEventListener('pagehide', saveCurrentState)
      window.removeEventListener('blur', saveCurrentState)
      document.removeEventListener('click', handleExternalNavigation)
      document.removeEventListener('visibilitychange', handleVisibilityChange)
      window.removeEventListener('focus', handleFocus)
    }
  }, [config, currentPopularTags, currentPage])
  
  // localStorageから復元する設定を管理
  const [shouldRestore, setShouldRestore] = useState(null)
  
  // クライアント側の初期化処理
  useEffect(() => {
    // URLパラメータから初期ページを取得
    const urlParams = new URLSearchParams(window.location.search)
    const pageParam = urlParams.get('page')
    if (pageParam) {
      const pageNum = parseInt(pageParam, 10)
      setCurrentPage(Math.max(1, pageNum))
    }
    
    // 初回レンダリング時はSSRのデータを使用するため、追加のAPI呼び出しを避ける
    // これにより二重リクエストを防ぐ
    
    // 人気タグをlocalStorageから復元（ブラウザバック対応）
    const storageKey = `popular-tags-${initialGenre}-${initialPeriod}`
    try {
      const cached = localStorage.getItem(storageKey)
      if (cached) {
        const parsed = JSON.parse(cached)
        if (Array.isArray(parsed) && parsed.length > 0) {
          setCurrentPopularTags(parsed)
        }
      }
    } catch {
      // パースエラーは無視
    }
    
    // URLパラメータがない場合のみ、localStorageから復元を試みる（PWA対応）
    const hasUrlParams = urlParams.has('genre') || 
                        urlParams.has('period') || 
                        urlParams.has('tag') ||
                        urlParams.has('page')
    
    // PWAモードでは常に復元を試みる（URLパラメータがあっても）
    const shouldAttemptRestore = !hasUrlParams || isPWA()
    
    if (shouldAttemptRestore) {
      try {
        const savedState = localStorage.getItem('ranking-navigation-state')
        if (savedState) {
          const parsed = JSON.parse(savedState)
          // PWAモードでは7日間のデータを復元（通常は30分）
          const expirationTime = isPWA() ? (7 * 24 * 60 * 60 * 1000) : (30 * 60 * 1000)
          const expirationThreshold = Date.now() - expirationTime
          if (parsed.savedAt && parsed.savedAt > expirationThreshold) {
            // PWAモードでURLパラメータがある場合は、保存された状態を優先
            if (isPWA() && hasUrlParams) {
              // URLパラメータよりも保存された状態を優先
              setShouldRestore(parsed)
            } else if (!hasUrlParams) {
              // 通常のブラウザモードでURLパラメータがない場合
              setShouldRestore(parsed)
            }
          } else {
            // 期限切れのデータを削除
            localStorage.removeItem('ranking-navigation-state')
          }
        }
      } catch {
        // エラーは無視
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
  
  // 初期表示時に人気タグがない場合は動的に取得
  useEffect(() => {
    // 人気タグ取得用のAbortController
    const controller = new AbortController()
    
    if (!config.tag && config.genre !== 'all' && currentPopularTags.length === 0) {
      getPopularTagsClient(config.genre, config.period, controller.signal)
        .then(tags => {
          if (!controller.signal.aborted && tags && tags.length > 0) {
            setCurrentPopularTags(tags)
          }
        })
        .catch(() => {
          // エラー時は何もしない（AbortErrorも含む）
        })
    }
    
    return () => {
      controller.abort()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []) // 初回のみ実行
  
  // NGフィルタリング前のアイテム（リアルタイム統計は後で適用）
  // const itemsWithTags = rankingData // 使用されなくなったため削除
  
  // コンポーネントのアンマウント時にリクエストをキャンセル
  useEffect(() => {
    return () => {
      if (abortControllerRef.current) {
        abortControllerRef.current.abort()
      }
      if (tagsAbortControllerRef.current) {
        tagsAbortControllerRef.current.abort()
      }
    }
  }, [])
  
  // スクロール位置の保存・復元は上記のuseEffectで実装済み
  // 外部リンク（ニコニコ動画）クリック時に状態を保存し、
  // ブラウザの戻るボタンで戻ってきた際に復元される
  
  // 設定変更時の処理 (新しいフックを使用してシンプル化)
  const handleConfigChange = useCallback(async (newConfig: RankingConfig, force = false) => {
    // 初回ロードの場合はSSRのデータをそのまま使用
    if (isInitialLoad && 
        newConfig.genre === initialGenre && 
        newConfig.period === initialPeriod && 
        newConfig.tag === initialTag) {
      setIsInitialLoad(false)
      return
    }
    
    // 変更がない場合は何もしない（強制更新でない限り）
    if (
      !force &&
      newConfig.genre === config.genre &&
      newConfig.period === config.period &&
      newConfig.tag === config.tag
    ) {
      return
    }
    
    setConfig(newConfig)
    setCurrentPage(1) // 設定変更時はページ1にリセット
    
    // ユーザー設定を更新（useUserPreferencesで自動的にlocalStorageに保存される）
    updatePreferences({
      lastGenre: newConfig.genre,
      lastPeriod: newConfig.period,
      lastTag: newConfig.tag
    })
    
    // URLを更新
    const params = new URLSearchParams()
    if (newConfig.genre !== 'all') params.set('genre', newConfig.genre)
    if (newConfig.period !== '24h') params.set('period', newConfig.period)
    if (newConfig.tag) params.set('tag', newConfig.tag)
    
    router.push(params.toString() ? `?${params.toString()}` : '/', { scroll: false })
    
    // フックのfetchRankingData関数を使用してデータ取得
    try {
      await fetchRankingData(newConfig)
    } catch (error) {
      // エラーはフック内で処理済み
    }
  }, [config, router, updatePreferences, isInitialLoad, initialGenre, initialPeriod, initialTag, fetchRankingData])
  
  // ページ変更時の処理（クライアントサイドページネーション）
  const handlePageChange = useCallback((page: number) => {
    if (page === currentPage) return
    
    setCurrentPage(page)
    
    // クライアントサイドページネーション: URLのみ更新（データ再取得なし）
    const params = new URLSearchParams()
    if (config.genre !== 'all') params.set('genre', config.genre)
    if (config.period !== '24h') params.set('period', config.period)
    if (config.tag) params.set('tag', config.tag)
    if (page > 1) params.set('page', page.toString())
    
    // URLを更新するが、データの再取得は行わない
    // window.history.replaceStateを使用してブラウザ履歴に追加しない
    const newUrl = params.toString() ? `?${params.toString()}` : '/'
    window.history.replaceState(null, '', newUrl)
  }, [currentPage, config])
  
  // localStorageから設定を復元（フォールバック戦略付き）
  useEffect(() => {
    if (shouldRestore) {
      // デバッグ情報（開発時のみ）
      if (process.env.NODE_ENV === 'development') {
        // eslint-disable-next-line no-console
        console.log('[PWA Session Restore] Attempting to restore:', {
          isPWA: isPWA(),
          savedState: shouldRestore,
          currentConfig: config
        })
      }
      
      // フォールバック戦略：無効な状態の段階的復元
      let finalConfig: RankingConfig = {
        genre: shouldRestore.genre || 'all',
        period: shouldRestore.period || '24h',
        tag: shouldRestore.tag
      }
      let finalPage = shouldRestore.page || 1
      let scrollPosition = shouldRestore.scrollPosition || 0
      
      // バリデーション1: タグが現在の人気タグに存在するかチェック
      if (finalConfig.tag && shouldRestore.popularTags && Array.isArray(shouldRestore.popularTags)) {
        const tagExists = shouldRestore.popularTags.includes(finalConfig.tag)
        if (!tagExists) {
          // フォールバック: 同じジャンルの「すべて」動画に遷移
          finalConfig.tag = undefined
          finalPage = 1
          scrollPosition = 0
          // Tag not found, falling back to "all" videos
        }
      }
      
      // バリデーション2: ページ数の妥当性チェック（データが利用可能な場合）
      if (finalPage > 1 && fullRankingData.length > 0) {
        const { filteredItems } = filterWithExtendedNGList(fullRankingData, ngList)
        const maxPages = Math.ceil(filteredItems.length / ITEMS_PER_PAGE)
        if (finalPage > maxPages) {
          // フォールバック: 無効なページの場合は同じタグの1ページ目に遷移
          finalPage = 1
          scrollPosition = 0
          // Invalid page number, falling back to page 1
        }
      }
      
      // バリデーション3: スクロール位置の妥当性チェック
      if (scrollPosition > 0 && finalPage === 1) {
        // ページが変更された場合はスクロール位置をリセット
        if (finalPage !== (shouldRestore.page || 1) || finalConfig.tag !== shouldRestore.tag) {
          scrollPosition = 0
          // Page or tag changed, resetting scroll position
        }
      }
      
      // 保存された設定が現在の設定と異なる場合のみ更新
      if (
        finalConfig.genre !== config.genre ||
        finalConfig.period !== config.period ||
        finalConfig.tag !== config.tag
      ) {
        // デバッグ情報（開発時のみ）
        if (process.env.NODE_ENV === 'development') {
          // eslint-disable-next-line no-console
          console.log('[PWA Session Restore] Restoring to:', finalConfig)
        }
        
        // 人気タグも復元（フォールバック後のタグが有効な場合のみ）
        if (shouldRestore.popularTags && Array.isArray(shouldRestore.popularTags)) {
          setCurrentPopularTags(shouldRestore.popularTags)
        }
        
        // ページ状態を復元
        if (finalPage > 1) {
          setCurrentPage(finalPage)
        }
        
        // スクロール位置を復元（バリデーション済み）
        if (scrollPosition > 0) {
          setTimeout(() => {
            window.scrollTo(0, scrollPosition)
          }, 100)
        }
        
        // URLを更新（ブラウザの履歴に追加しない）
        const params = new URLSearchParams()
        if (finalConfig.genre !== 'all') params.set('genre', finalConfig.genre)
        if (finalConfig.period !== '24h') params.set('period', finalConfig.period)
        if (finalConfig.tag) params.set('tag', finalConfig.tag)
        if (finalPage > 1) params.set('page', finalPage.toString())
        
        const newUrl = params.toString() ? `?${params.toString()}` : '/'
        window.history.replaceState(null, '', newUrl)
        
        // handleConfigChangeを使用してデータも取得
        handleConfigChange(finalConfig)
        
        // 復元後は削除
        localStorage.removeItem('ranking-navigation-state')
        setShouldRestore(null)
      } else {
        // 同じ設定の場合でも、スクロール位置は復元
        if (scrollPosition > 0) {
          setTimeout(() => {
            window.scrollTo(0, scrollPosition)
          }, 100)
        }
        // 不要なデータは削除
        localStorage.removeItem('ranking-navigation-state')
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shouldRestore])
  
  // NGリスト適用時の処理は不要（ngListの変更で自動的に再計算される）

  // クライアントサイドページネーション処理 (同期的なNGフィルタリング)
  const { displayItems, totalPages, totalItemsCount } = useMemo(() => {
    // fullRankingDataに対して直接フィルタリングを適用（即座に反映）
    const { filteredItems } = filterWithExtendedNGList(fullRankingData, ngList)
    const totalCount = filteredItems.length
    
    // 総ページ数を計算
    const calculatedTotalPages = Math.ceil(totalCount / ITEMS_PER_PAGE)
    
    // 現在のページのアイテムを抽出
    const startIndex = (currentPage - 1) * ITEMS_PER_PAGE
    const endIndex = startIndex + ITEMS_PER_PAGE
    const pageItems = filteredItems.slice(startIndex, endIndex)
    
    // ページ内のアイテムをそのまま返す（rankは既にfilterWithNGListで再計算済み）
    const result = pageItems
    
    return {
      displayItems: result,
      totalPages: calculatedTotalPages,
      totalItemsCount: totalCount
    }
  }, [fullRankingData, ngList, ngListVersion, currentPage, config.period])
  
  // リアルタイム統計更新を無効化
  // 理由: KVのバッチ読み取りはキーごとに課金されるため、
  // 100ユーザーで1時間あたり150,000回の読み取りが発生し、
  // 無料枠（100,000回/日）を40分で超過してしまう
  const finalDisplayItems = displayItems
  const isUpdating = false
  const lastUpdated = null
  
  // レンダリング
  try {
    return (
      <TagDisplayProvider>
        <div className="selectors-container">
        <RankingSelector config={config} onConfigChange={handleConfigChange} />
        <TagSelector 
          config={config} 
          onConfigChange={handleConfigChange} 
          popularTags={currentPopularTags} 
        />
        <TagToggleButton />
      </div>
      
      {loading && (
        <div className="loading-container">
          <div style={{ 
            fontSize: '16px', 
            color: 'var(--text-secondary)'
          }}>
            読み込み中...
          </div>
        </div>
      )}
      
      {error && (
        <div style={{ textAlign: 'center', padding: '40px' }}>
          <div style={{ 
            fontSize: '16px', 
            color: 'var(--error-color)'
          }}>
            エラー: {typeof error === 'string' ? error : JSON.stringify(error)}
          </div>
        </div>
      )}
      
      {!loading && !error && (finalDisplayItems.length === 0 || visibleGenres.length === 0) && (
        <div style={{ textAlign: 'center', padding: '40px' }}>
          <div style={{ 
            fontSize: '16px', 
            color: 'var(--text-secondary)',
            marginBottom: '20px'
          }}>
            {visibleGenres.length === 0 
              ? '表示する動画がありません' 
              : config.tag 
                ? 'このタグの動画が見つかりません' 
                : 'ランキングデータがありません'}
          </div>
          {config.tag && visibleGenres.length > 0 && (
            <button
              onClick={() => handleConfigChange({ ...config, tag: undefined })}
              style={{
                padding: '10px 20px',
                fontSize: '14px',
                backgroundColor: 'var(--primary-color)',
                color: 'white',
                border: 'none',
                borderRadius: '4px',
                cursor: 'pointer'
              }}
            >
              ジャンル別ランキングに戻る
            </button>
          )}
        </div>
      )}
      
      {!loading && !error && finalDisplayItems.length > 0 && visibleGenres.length > 0 && (
        <>
          {/* リアルタイム更新インジケーター */}
          <div style={{
            height: '28px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '0 8px',
            marginBottom: '8px'
          }}>
            <div style={{ 
              fontSize: '12px',
              color: 'var(--text-secondary)',
              visibility: isUpdating ? 'visible' : 'hidden'
            }}>
              統計情報を更新中...
            </div>
            
            {lastUpdated && (
              <div style={{ 
                fontSize: '11px',
                color: 'var(--text-muted)'
              }}>
                最終更新: {new Date(lastUpdated).toLocaleTimeString('ja-JP')}
              </div>
            )}
          </div>
          
          {/* 上部ページネーション */}
          <Pagination
            currentPage={currentPage}
            totalPages={totalPages}
            totalItems={totalItemsCount}
            itemsPerPage={ITEMS_PER_PAGE}
            onPageChange={handlePageChange}
          />
          
          {/* 件数表示（ページネーションなしの場合） */}
          {totalPages <= 1 && totalItemsCount > 0 && (
            <div style={{
              textAlign: 'center',
              padding: '10px 0',
              fontSize: '14px',
              color: 'var(--text-secondary)',
              borderTop: '1px solid var(--border-color)',
              marginTop: '20px'
            }}>
              全 {totalItemsCount} 件
            </div>
          )}
          
          {/* ランキングリスト */}
          <ul key={`${ngListVersion}-${config.period}`} style={{ listStyle: 'none', padding: 0, margin: 0 }}>
            {finalDisplayItems.map((item) => (
              <li key={item.id} style={{ listStyle: 'none', padding: 0, margin: 0 }}>
                <VideoContextMenu video={item}>
                  <RankingItemResponsive 
                    item={item}
                    disabled={isNavigating}
                  />
                </VideoContextMenu>
              </li>
            ))}
          </ul>
          
          {/* 下部ページネーション */}
          <Pagination
            currentPage={currentPage}
            totalPages={totalPages}
            totalItems={totalItemsCount}
            itemsPerPage={ITEMS_PER_PAGE}
            onPageChange={handlePageChange}
          />
          
          {/* 件数表示（ページネーションなしの場合） */}
          {totalPages <= 1 && totalItemsCount > 0 && (
            <div style={{
              textAlign: 'center',
              padding: '10px 0',
              fontSize: '14px',
              color: 'var(--text-secondary)',
              borderTop: '1px solid var(--border-color)',
              marginTop: '20px'
            }}>
              全 {totalItemsCount} 件
            </div>
          )}
        </>
      )}
      </TagDisplayProvider>
  )
  } catch (error) {
    console.error('Rendering error in ClientPage:', error)
    return (
      <div style={{ textAlign: 'center', padding: '40px' }}>
        <div style={{ fontSize: '16px', color: 'var(--error-color)' }}>
          レンダリングエラーが発生しました
        </div>
        <pre style={{ marginTop: '20px', fontSize: '12px', color: 'var(--text-secondary)' }}>
          {error instanceof Error ? error.message : JSON.stringify(error)}
        </pre>
      </div>
    )
  }
}