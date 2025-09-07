'use client'

import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { RankingSelector } from '@/components/ranking-selector'
import RankingItemResponsive from '@/components/ranking-item-responsive'
import { VideoContextMenu } from '@/components/video-context-menu'
import { useUserPreferences } from '@/hooks/use-user-preferences'
import { generateNGListHash } from '@/lib/ng-list-hash'
import { filterWithExtendedNGList } from '@/lib/filter-with-extended-ng-list'
import { useCustomRankings } from '@/hooks/use-custom-rankings'
import { useDeviceType, getDeviceBasedLimit } from '@/hooks/use-device-type'
import { useDebouncedCallback } from '@/hooks/use-debounce'

// 直接インポート（まず動作確認）
import Pagination from '@/components/pagination'
import { TagSelector } from '@/components/tag-selector'
import { useUserNGListExtended } from '@/hooks/use-user-ng-list-extended'
import { useRankingData } from '@/hooks/use-ranking-data'
import { useGenreOrderV2 } from '@/hooks/use-genre-order-v2'
import { getPopularTagsClient } from '@/lib/popular-tags-client'
import { migrateLocalStorageData } from '@/lib/migrate-local-storage'
import { rankingCache } from '@/lib/ranking-cache'
import { applyCustomFilters } from '@/lib/custom-ranking-filter'
import type { RankingData, RankingItem } from '@/types/ranking'
import type { RankingConfig, RankingGenre, RankingPeriod } from '@/types/ranking-config'
import type { NGList } from '@/types/ng-list'
import type { ExtendedUserNGList } from '@/types/ng-list-extended'
import type { NGType } from '@/components/quick-ng-button'
import { useNavigationState } from '@/hooks/use-navigation-state'
import { TagDisplayProvider, useTagDisplay } from '@/contexts/tag-display-context'
import { serverLog } from '@/lib/server-log'
import { usePullToRefresh } from '@/hooks/use-pull-to-refresh'
import { useKeyboardShortcuts } from '@/hooks/use-keyboard-shortcuts'
import { PullToRefreshIndicator } from '@/components/pull-to-refresh-indicator'
import { TimeRangeFilter, filterByTimeRange, type TimeRangeValue } from '@/components/time-range-filter'
import './client-page.css'
import '@/components/ranking-item-responsive.css'

interface ClientPageProps {
  initialData: { items: RankingItem[], popularTags?: string[] }
  initialGenre?: string
  initialPeriod?: string
  initialTag?: string
  initialRanking?: string
  initialPage?: number
  popularTags?: string[]
}

// ページネーション設定
const ITEMS_PER_PAGE = 100   // ページあたりの表示件数（DOM要素数削減のため）

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
        whiteSpace: 'nowrap',
        display: 'inline-flex',
        alignItems: 'center',
        height: '31px'
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
  initialRanking,
  initialPage = 1,
  popularTags = []
}: ClientPageProps) {
  const router = useRouter()
  const searchParams = useSearchParams()
  
  // ユーザー設定の永続化
  const { preferences, updatePreferences } = useUserPreferences()
  const { ngList, saveNGListDirectly } = useUserNGListExtended()
  const { visibleGenres } = useGenreOrderV2()
  const { rankings: customRankings, selectedRanking, selectRanking, isLoading: customRankingsLoading } = useCustomRankings()
  
  // PWA環境でのナビゲーション状態管理
  useNavigationState()
  
  // PWAリロード機能
  const { isPulling, pullDistance } = usePullToRefresh()
  useKeyboardShortcuts()
  
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
  
  // 新しく作成したカスタムランキングの一時保存（customRankings配列に反映されるまでの間）
  // Map構造で複数の作成中ランキングを管理（競合状態を防ぐ）
  const [newlyCreatedRankings, setNewlyCreatedRankings] = useState<Map<string, {
    id: string
    title: string
    conditions: any[]
    baseGenre: RankingGenre
  }>>(new Map())
  
  // 新規作成中フラグ（404エラーを防ぐため）
  const [isCreatingCustomRanking, setIsCreatingCustomRanking] = useState(false)
  
  // ランキングデータ管理フック
  const {
    rankingData,
    fullRankingData,
    currentPopularTags,
    loading,
    error,
    isRetrying,
    retryCount,
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
    ngListVersion,
    customRankings,
    newlyCreatedRankings
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
  
  // 時間範囲フィルター状態（localStorageから復元）
  const [timeRange, setTimeRange] = useState<TimeRangeValue>(() => {
    if (typeof window !== 'undefined') {
      try {
        const saved = localStorage.getItem('timeRangeFilter')
        if (saved && ['all', '24h', '1w', '1m', '6m', '1y'].includes(saved)) {
          return saved as TimeRangeValue
        }
      } catch (e) {
        // localStorage使用不可の場合は無視
      }
    }
    return 'all'
  })
  
  // カスタムランキング専用状態（即時表示用）
  const [isShowingCustomRanking, setIsShowingCustomRanking] = useState(false)
  const [customRankingDisplayData, setCustomRankingDisplayData] = useState<RankingItem[]>([])
  const [customRankingMetadata, setCustomRankingMetadata] = useState<{
    title: string
    conditions: any[]
    baseGenre: RankingGenre
  } | null>(null)
  
  
  // 新しく作成したカスタムランキングがcustomRankings配列に反映されたらクリア
  useEffect(() => {
    if (newlyCreatedRankings.size > 0) {
      const updatedMap = new Map(newlyCreatedRankings)
      let hasChanges = false
      
      // IndexedDBに保存されたランキングをMapから削除
      for (const [id, ranking] of newlyCreatedRankings) {
        if (customRankings.some((r: any) => r.id === id)) {
          updatedMap.delete(id)
          hasChanges = true
        }
      }
      
      if (hasChanges) {
        setNewlyCreatedRankings(updatedMap)
      }
    }
  }, [customRankings, newlyCreatedRankings])
  
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
    
    // SSRから渡されたrankingパラメータがある場合の処理は別のuseEffectで行う
    // (カスタムランキングの読み込み完了を待つため)
    
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
  
  // SSRから渡されたrankingパラメータがある場合、カスタムランキングの読み込み完了後に処理
  useEffect(() => {
    if (initialRanking && !customRankingsLoading) {
      selectRanking(initialRanking)
      // カスタムランキングのbaseGenreに切り替える
      const rankings = JSON.parse(localStorage.getItem('custom-rankings') || '{}')
      const selectedRanking = rankings.rankings?.find((r: any) => r.id === initialRanking)
      if (selectedRanking) {
        setConfig({ 
          ...config, 
          genre: selectedRanking.baseGenre, 
          tag: undefined 
        })
      }
    }
  }, [initialRanking, customRankingsLoading, selectRanking, config])
  
  
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
      const abortController = abortControllerRef.current
      const tagsAbortController = tagsAbortControllerRef.current
      
      if (abortController) {
        abortController.abort()
      }
      if (tagsAbortController) {
        tagsAbortController.abort()
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
  
  // スクロール位置の保存・復元は上記のuseEffectで実装済み
  // 外部リンク（ニコニコ動画）クリック時に状態を保存し、
  // ブラウザの戻るボタンで戻ってきた際に復元される
  
  // カスタムランキングの保留中の設定を保存
  const [pendingCustomConfig, setPendingCustomConfig] = useState<RankingConfig | null>(null)
  
  // 設定変更時の処理 (新しいフックを使用してシンプル化)
  const handleConfigChangeCore = useCallback(async (newConfig: RankingConfig, force = false) => {
    // 設定変更時は必ず前回のエラーをクリア
    setError(null)
    
    // Vercelログに設定変更情報を出力
    serverLog.info('handleConfigChange called', {
      newConfig,
      currentConfig: config,
      isInitialLoad,
      isShowingCustomRanking,
      customRankingsLoading,
      force
    })
    
    // 初回ロードの処理
    if (isInitialLoad) {
      // カスタムランキングの場合は必ずデータフェッチを実行
      if (newConfig.genre === 'custom') {
        // IndexedDBの読み込みが完了するまで待機
        if (customRankingsLoading) {
          serverLog.info('Initial load for custom ranking - waiting for IndexedDB', {
            newConfig,
            customRankingsLoading
          })
          // 保留中の設定として保存
          setPendingCustomConfig(newConfig)
          return
        }
        
        serverLog.info('Initial load for custom ranking - proceeding with data fetch', {
          newConfig,
          customRankingsCount: customRankings.length
        })
        setIsInitialLoad(false)
        // データフェッチに続行
      } else if (newConfig.genre === initialGenre && 
                 newConfig.period === initialPeriod && 
                 newConfig.tag === initialTag) {
        // 通常のジャンルで同じ設定の場合はSSRデータを使用
        serverLog.info('Initial load - using SSR data, skipping API fetch', {
          initialGenre,
          initialPeriod,
          initialTag,
          newConfigGenre: newConfig.genre
        })
        setIsInitialLoad(false)
        return
      } else {
        // 設定が異なる場合はデータフェッチを実行
        serverLog.info('Initial load with different config - proceeding with data fetch', {
          initialConfig: { genre: initialGenre, period: initialPeriod, tag: initialTag },
          newConfig
        })
        setIsInitialLoad(false)
        // データフェッチに続行
      }
    }
    
    // 変更がない場合は何もしない（強制更新でない限り）
    // タグの比較は undefined と空文字列を区別する必要がある
    const hasConfigChanged = force || 
      newConfig.genre !== config.genre ||
      newConfig.period !== config.period ||
      newConfig.tag !== config.tag
    
    // タグ変更の詳細ログ
    if (newConfig.tag !== config.tag) {
      serverLog.info('Tag change detected', {
        previousTag: config.tag || 'undefined',
        newTag: newConfig.tag || 'undefined',
        genre: newConfig.genre,
        period: newConfig.period
      })
    }
    
    if (!hasConfigChanged) {
      serverLog.info('No config change detected, skipping', {
        force,
        configComparison: {
          genre: { current: config.genre, new: newConfig.genre },
          period: { current: config.period, new: newConfig.period },
          tag: { current: config.tag, new: newConfig.tag }
        }
      })
      return
    }

    // カスタムランキング表示中で、同じカスタムランキングかつ同じ期間の場合は専用状態を維持
    if (isShowingCustomRanking && 
        newConfig.genre === 'custom' && 
        newConfig.tag?.startsWith('custom:') &&
        config.tag === newConfig.tag &&
        config.period === newConfig.period) {
      setConfig(newConfig)
      return // データ取得をスキップして専用状態を維持
    }

    // カスタムランキング以外への切り替え、または異なるカスタムランキングへの切り替え
    if (isShowingCustomRanking && 
        (newConfig.genre !== 'custom' || newConfig.tag !== config.tag)) {
      setIsShowingCustomRanking(false)
      setCustomRankingDisplayData([])
      setCustomRankingMetadata(null)
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
    
    const newUrl = params.toString() ? `?${params.toString()}` : '/'
    router.push(newUrl, { scroll: false })

    // 既存カスタムランキング選択時は即座にフィルタリング表示を試行（エラーハンドリング強化）
    if (newConfig.genre === 'custom' && newConfig.tag?.startsWith('custom:')) {
      try {
        const customId = newConfig.tag.replace('custom:', '')
        
        // カスタムランキングデータ検証
        if (!Array.isArray(customRankings)) {
          console.error('[ERROR] Custom rankings is not an array:', typeof customRankings)
        } else {
          const targetRanking = customRankings.find((r: any) => r && r.id === customId) || 
                                newlyCreatedRankings.get(customId) || null
          
          if (targetRanking && targetRanking.baseGenre && targetRanking.conditions?.length > 0) {
            // ランキングデータ検証
            if (!targetRanking.title || typeof targetRanking.title !== 'string') {
              console.warn('[WARN] Invalid ranking title:', targetRanking.title)
            }
            
            if (!Array.isArray(targetRanking.conditions)) {
              console.error('[ERROR] Invalid ranking conditions:', typeof targetRanking.conditions)
            } else {
              // 条件検証
              const validConditions = targetRanking.conditions.filter((condition: any) => 
                condition && 
                typeof condition.tag === 'string' && 
                condition.tag.trim() !== '' &&
                ['AND', 'OR', 'NOT'].includes(condition.operator)
              )

              if (validConditions.length === 0) {
                console.warn('[WARN] No valid conditions found for custom ranking:', customId)
              } else {
                // キャッシュからbaseGenreのデータを取得
                const cachedData = rankingCache.get(targetRanking.baseGenre, newConfig.period)
                
                if (cachedData && cachedData.data) {
                  // データ形式検証
                  if (!Array.isArray(cachedData.data)) {
                    console.error('[ERROR] Invalid cached data format for existing ranking:', typeof cachedData.data)
                  } else {
                    // 即座にフィルタリング表示
                    const filteredData = applyCustomFilters(cachedData.data, validConditions)
                    
                    // フィルタリング結果検証
                    if (!Array.isArray(filteredData)) {
                      console.error('[ERROR] Filtering returned invalid data for existing ranking:', typeof filteredData)
                    } else {
                      setIsShowingCustomRanking(true)
                      setCustomRankingDisplayData(filteredData)
                      setCustomRankingMetadata({
                        title: targetRanking.title || `Custom Ranking ${customId}`,
                        conditions: validConditions,
                        baseGenre: targetRanking.baseGenre
                      })
                      
                      return // データ取得をスキップ
                    }
                  }
                } else {
                  // No cached data for existing custom ranking
                }
              }
            }
          } else {
            // Custom ranking not found or invalid
          }
        }
      } catch (error) {
        console.error('[ERROR] Failed to process existing custom ranking selection:', error)
        // フォールバック: エラー時は専用状態をリセット
        setIsShowingCustomRanking(false)
        setCustomRankingDisplayData([])
        setCustomRankingMetadata(null)
      }
    }
    
    // カスタムランキング作成直後の場合の特別処理
    if (newConfig.genre === 'custom' && newConfig.tag?.startsWith('custom:')) {
      const customId = newConfig.tag.replace('custom:', '')
      
      // 新規作成されたランキングがまだ反映されていない可能性をチェック
      if (newlyCreatedRankings.has(customId)) {
        // eslint-disable-next-line no-console
        
        // 既にフィルタリング済みデータがある場合はスキップ
        if (isShowingCustomRanking && customRankingDisplayData.length > 0) {
          // eslint-disable-next-line no-console
          return
        }
        
        // データがない場合は、少し待ってから再試行
        setTimeout(() => {
          // eslint-disable-next-line no-console
          fetchRankingData(newConfig)
        }, 200)
        return
      }
    }
    
    // 既存のカスタムランキング専用状態のチェック
    // 新規作成時も含めて、すでに表示中のデータがある場合はスキップ
    if (isShowingCustomRanking && 
        newConfig.genre === 'custom' && 
        newConfig.tag?.startsWith('custom:') &&
        customRankingDisplayData.length > 0) {
      // 新規作成時または同じカスタムランキングの再選択時
      const customId = newConfig.tag.replace('custom:', '')
      if (newlyCreatedRankings.has(customId) || 
          (config.tag === newConfig.tag && config.period === newConfig.period)) {
        return
      }
    }
    
    // カスタムランキング作成中の場合でも、新規作成されたランキングの選択時はデータフェッチを実行
    if (isCreatingCustomRanking && newConfig.genre === 'custom' && newConfig.tag?.startsWith('custom:')) {
      const customId = newConfig.tag.replace('custom:', '')
      // 新規作成されたランキングでない場合のみスキップ
      if (!newlyCreatedRankings.has(customId)) {
        return
      }
    }
    
    // カスタムランキングが既に表示されている場合で、
    // 新規作成されたランキングを選択している場合はスキップ
    if (newConfig.genre === 'custom' && newConfig.tag?.startsWith('custom:')) {
      const customId = newConfig.tag.replace('custom:', '')
      if (newlyCreatedRankings.has(customId) && 
          isShowingCustomRanking && customRankingDisplayData.length > 0) {
        // 新規作成したランキングのデータが既に設定されているのでスキップ
        return
      }
    }
    
    // フックのfetchRankingData関数を使用してデータ取得
    try {
      await fetchRankingData(newConfig)
    } catch (error) {
      // エラーはフック内で処理済み
    }
  }, [config, router, updatePreferences, isInitialLoad, initialGenre, initialPeriod, initialTag, fetchRankingData, customRankings, newlyCreatedRankings, customRankingsLoading, setPendingCustomConfig, isCreatingCustomRanking, setError])
  // 注意: isShowingCustomRanking と customRankingDisplayData を依存関係から除外
  // 理由: カスタムランキング作成時の状態変更が handleConfigChange を不要に再実行させ、
  // fetchRankingData が空データで上書きしてしまう問題を防ぐため
  // eslint-disable-next-line react-hooks/exhaustive-deps
  
  // デバウンスされた設定変更ハンドラー（500ms遅延）
  const handleConfigChangeDebounced = useDebouncedCallback(handleConfigChangeCore, 500)
  
  // 即座に実行する必要がある場合とデバウンスを使い分けるラッパー
  const handleConfigChange = useCallback((newConfig: RankingConfig, force = false) => {
    if (force) {
      // 強制更新または初回ロード時は即座に実行
      handleConfigChangeCore(newConfig, force)
    } else {
      // 通常の設定変更はデバウンス
      handleConfigChangeDebounced(newConfig, false)
    }
  }, [handleConfigChangeCore, handleConfigChangeDebounced])
  
  // IndexedDBの読み込みが完了し、保留中の設定がある場合は実行
  if (!customRankingsLoading && pendingCustomConfig && isInitialLoad) {
    serverLog.info('IndexedDB loaded - executing pending custom ranking config', {
      pendingCustomConfig,
      customRankingsCount: customRankings.length
    })
    // 保留中の設定をクリアして実行
    const configToExecute = pendingCustomConfig
    setPendingCustomConfig(null)
    // 次のレンダリングサイクルで実行
    requestAnimationFrame(() => {
      handleConfigChange(configToExecute, true)
    })
  }
  
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
    // カスタムジャンルかつ選択されたランキングがある場合、rankingパラメータを追加
    if (config.genre === 'custom' && config.tag?.startsWith('custom:')) {
      const customId = config.tag.replace('custom:', '')
      params.set('ranking', customId)
    }
    
    // URLを更新するが、データの再取得は行わない
    // window.history.replaceStateを使用してブラウザ履歴に追加しない
    const newUrl = params.toString() ? `?${params.toString()}` : '/'
    window.history.replaceState(null, '', newUrl)
  }, [currentPage, config])
  
  // 時間範囲フィルター変更時の処理
  const handleTimeRangeChange = useCallback((value: TimeRangeValue) => {
    setTimeRange(value)
    setCurrentPage(1) // フィルター変更時は1ページ目にリセット
    
    // localStorageに保存
    try {
      localStorage.setItem('timeRangeFilter', value)
    } catch (e) {
      // localStorage使用不可の場合は無視
    }
  }, [])
  
  // QuickNG: NG追加処理
  const handleQuickNGAdd = useCallback((video: RankingItem, type: NGType, value: string | string[]) => {
    const stringValue = Array.isArray(value) ? value[0] : value
    const trimmedValue = stringValue?.trim()
    
    if (!trimmedValue) {
      // QuickNG: Empty value provided
      return
    }
    
    // 現在のNGリストをコピーして更新
    const updatedNGList: ExtendedUserNGList = {
      ...ngList,
      updatedAt: new Date().toISOString()
    }
    
    let wasAdded = false
    let displayValue = ''
    
    switch (type) {
      case 'videoId':
        if (!ngList.videoIds.includes(trimmedValue)) {
          updatedNGList.videoIds = [...ngList.videoIds, trimmedValue]
          updatedNGList.totalCount = ngList.totalCount + 1
          wasAdded = true
          displayValue = `動画ID: ${trimmedValue}`
        }
        break
        
      case 'title':
        // タイトルは完全一致として追加
        if (!ngList.videoTitles.exact.includes(trimmedValue)) {
          updatedNGList.videoTitles = {
            ...ngList.videoTitles,
            exact: [...ngList.videoTitles.exact, trimmedValue]
          }
          updatedNGList.totalCount = ngList.totalCount + 1
          wasAdded = true
          displayValue = `タイトル: ${trimmedValue}`
        }
        break
        
      case 'author':
        // 投稿者名は完全一致として追加
        if (!ngList.authorNames.exact.includes(trimmedValue)) {
          updatedNGList.authorNames = {
            ...ngList.authorNames,
            exact: [...ngList.authorNames.exact, trimmedValue]
          }
          updatedNGList.totalCount = ngList.totalCount + 1
          wasAdded = true
          displayValue = `投稿者名: ${trimmedValue}`
        }
        break
        
      case 'authorId':
        // 投稿者IDは別のリストに追加
        if (!ngList.authorIds.includes(trimmedValue)) {
          updatedNGList.authorIds = [...ngList.authorIds, trimmedValue]
          updatedNGList.totalCount = ngList.totalCount + 1
          wasAdded = true
          displayValue = `投稿者ID: ${trimmedValue}`
        }
        break
        
      default:
        // QuickNG: Unknown NG type
        return
    }
    
    if (wasAdded) {
      // NGリストを保存
      saveNGListDirectly(updatedNGList)
      
      // ユーザーフィードバック（簡易版）
      const message = `🚫 NGリストに追加しました: ${displayValue}`
      
      // 一時的な通知を表示（シンプルなアラート）
      // TODO: より良いトースト通知システムを実装予定
      if (window.confirm(`${message}\n\nOKをクリックして続行してください。`)) {
        // ユーザーが確認した場合の処理（特に何もしない）
      }
      
      // デバッグ情報（開発時のみ）
      if (process.env.NODE_ENV === 'development') {
        // eslint-disable-next-line no-console
        console.log('QuickNG: Added to NG list', {
          type,
          value: trimmedValue,
          video: { id: video.id, title: video.title, author: video.authorName },
          totalCount: updatedNGList.totalCount
        })
      }
    } else {
      // すでに追加済みの場合
      const existingMessage = `⚠️ すでにNGリストに登録済みです: ${displayValue}`
      alert(existingMessage)
    }
  }, [ngList, saveNGListDirectly])

  // カスタムランキング用データプリフェッチ
  const handlePrefetchData = useCallback(async (baseGenre: RankingGenre, period: string) => {
    try {
      // キャッシュに既にデータがある場合はスキップ
      const cachedData = rankingCache.get(baseGenre, period)
      if (cachedData && cachedData.data) {
        return
      }
      
      // fetchRankingDataを使ってデータを取得
      const tempConfig = { genre: baseGenre, period: period as RankingPeriod, tag: undefined }
      await fetchRankingData(tempConfig)
    } catch (error) {
      console.error('[ERROR] Failed to prefetch data:', error)
      throw error // エラーを上位に伝播
    }
  }, [fetchRankingData])
  
  // カスタムランキング作成時の即時フィルタリング（改修版 + エラーハンドリング強化）
  const handleCreateCustomRankingWithFilter = useCallback(async (
    rankingId: string, 
    baseGenre: RankingGenre, 
    conditions: any[], 
    title: string
  ) => {
    try {
      // 入力値検証
      if (!rankingId || !baseGenre || !title || !Array.isArray(conditions)) {
        console.error('[ERROR] Invalid parameters for custom ranking filter:', {
          rankingId: !!rankingId,
          baseGenre: !!baseGenre,
          title: !!title,
          conditionsValid: Array.isArray(conditions)
        })
        return
      }

      // フィルタリング条件検証（早期実行）
      const validConditions = conditions.filter(condition => 
        condition && 
        typeof condition.tag === 'string' && 
        condition.tag.trim() !== '' &&
        ['AND', 'OR', 'NOT'].includes(condition.operator)
      )

      // 作成中フラグを最初に設定（404エラーを防ぐため）
      setIsCreatingCustomRanking(true)
      
      // 新しく作成したランキング情報を保存（重要：onConfigChangeより前に実行）
      setNewlyCreatedRankings(prev => {
        const newMap = new Map(prev)
        newMap.set(rankingId, {
          id: rankingId,
          title,
          conditions: validConditions,
          baseGenre
        })
        return newMap
      })

      // まずデータを取得（エラーをキャッチして処理続行）
      const tempConfig = { ...config, genre: baseGenre }
      try {
        await fetchRankingData(tempConfig)
      } catch (fetchError) {
        // データ取得エラーはログに記録するが、処理は続行（キャッシュデータを試す）
        console.warn('[WARN] Failed to fetch data for custom ranking, will try cache:', fetchError)
      }
      
      // 取得したデータをキャッシュから取得
      const cachedData = rankingCache.get(baseGenre, config.period)
      
      if (cachedData && cachedData.data && conditions.length > 0) {
        // データ形式検証
        if (!Array.isArray(cachedData.data)) {
          console.error('[ERROR] Invalid cached data format:', typeof cachedData.data)
          return
        }

        if (validConditions.length === 0) {
          console.warn('[WARN] No valid filtering conditions found')
          return
        }

        // キャッシュデータに対してフィルタリングを適用
        const filteredData = applyCustomFilters(cachedData.data, validConditions)
        
        // フィルタリング結果検証
        if (!Array.isArray(filteredData)) {
          console.error('[ERROR] Filtering returned invalid data:', typeof filteredData)
          return
        }

        // カスタムランキング専用状態に即座に設定（useRankingDataとは独立）
        setIsShowingCustomRanking(true)
        setCustomRankingDisplayData(filteredData)
        setCustomRankingMetadata({
          title,
          conditions: validConditions,
          baseGenre
        })
      } else {
        // Cannot apply immediate filtering
      }
    } catch (error) {
      console.error('[ERROR] Failed to apply custom ranking filter:', error)
      // フォールバック: エラー時は専用状態をリセット
      setIsShowingCustomRanking(false)
      setCustomRankingDisplayData([])
      setCustomRankingMetadata(null)
    } finally {
      // 作成中フラグを少し遅延してクリア（onConfigChangeの処理が完了するまで待つ）
      setTimeout(() => {
        setIsCreatingCustomRanking(false)
      }, 100)
    }
  }, [config, fetchRankingData])
  
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

  // クライアントサイドページネーション処理 (同期的なNGフィルタリング + 時間範囲フィルタリング)
  const { displayItems, totalPages, totalItemsCount, totalBeforeTimeFilter } = useMemo(() => {
    // データソースを決定（カスタムランキング表示中は専用データを使用）
    const sourceData = isShowingCustomRanking ? customRankingDisplayData : fullRankingData
    
    // NGフィルタリングを適用
    const { filteredItems } = filterWithExtendedNGList(sourceData, ngList)
    const totalBeforeTime = filteredItems.length
    
    // 時間範囲フィルタリングを適用
    const timeFilteredItems = filterByTimeRange(filteredItems, timeRange)
    const totalCount = timeFilteredItems.length
    
    // 総ページ数を計算
    const calculatedTotalPages = Math.ceil(totalCount / ITEMS_PER_PAGE)
    
    // 現在のページのアイテムを抽出
    const startIndex = (currentPage - 1) * ITEMS_PER_PAGE
    const endIndex = startIndex + ITEMS_PER_PAGE
    const pageItems = timeFilteredItems.slice(startIndex, endIndex)
    
    // ページ内のアイテムをそのまま返す（rankは既にfilterWithNGListで再計算済み）
    const result = pageItems
    
    return {
      displayItems: result,
      totalPages: calculatedTotalPages,
      totalItemsCount: totalCount,
      totalBeforeTimeFilter: totalBeforeTime
    }
  }, [fullRankingData, ngList, currentPage, isShowingCustomRanking, customRankingDisplayData, timeRange])
  
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
        <PullToRefreshIndicator isPulling={isPulling} pullDistance={pullDistance} />
        <div className="selectors-container">
        <RankingSelector 
          config={config} 
          onConfigChange={handleConfigChange}
          customRankings={customRankings} 
        />
        <TagSelector 
          config={config} 
          onConfigChange={handleConfigChange} 
          popularTags={currentPopularTags}
          onCreateCustomRankingWithFilter={handleCreateCustomRankingWithFilter}
          onPrefetchData={handlePrefetchData}
          currentPeriod={config.period}
        />
        <div className="filter-buttons-container">
          <TagToggleButton />
          <TimeRangeFilter
            value={timeRange}
            onChange={handleTimeRangeChange}
            totalCount={totalBeforeTimeFilter}
            filteredCount={totalItemsCount}
          />
        </div>
      </div>
      
      {loading && (
        <div className="loading-container">
          <div style={{ 
            fontSize: '16px', 
            color: 'var(--text-secondary)',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: '12px'
          }}>
            <div>読み込み中...</div>
            {isRetrying && (
              <div style={{ fontSize: '14px' }}>
                再試行中 ({retryCount}/3)
              </div>
            )}
          </div>
        </div>
      )}
      
      {error && !loading && (
        <div style={{ textAlign: 'center', padding: '40px' }}>
          <div style={{ 
            fontSize: '16px', 
            color: 'var(--error-color)',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: '8px'
          }}>
            <div>{typeof error === 'string' ? error : JSON.stringify(error)}</div>
            {error.includes('制限') && (
              <div style={{ 
                fontSize: '14px', 
                color: 'var(--text-secondary)',
                marginTop: '8px'
              }}>
                しばらく待ってから再度お試しください
              </div>
            )}
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
              : config.genre === 'custom' && !config.tag
                ? 'カスタムランキングを作成するか、既存のカスタムランキングを選択してください'
              : config.tag 
                ? 'このタグの動画が見つかりません' 
                : 'ランキングデータがありません'}
          </div>
          {config.tag && visibleGenres.length > 0 && config.genre !== 'custom' && (
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
                    onQuickNGAdd={handleQuickNGAdd}
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
    // Rendering error in ClientPage
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