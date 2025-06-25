'use client'

import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { RankingSelector } from '@/components/ranking-selector'
import { TagSelector } from '@/components/tag-selector'
import RankingItemResponsive from '@/components/ranking-item-responsive'
import Pagination from '@/components/pagination'
import { useUserPreferences } from '@/hooks/use-user-preferences'
import { useUserNGList } from '@/hooks/use-user-ng-list'
import { getPopularTagsClient } from '@/lib/popular-tags-client'
import { migrateLocalStorageData } from '@/lib/migrate-local-storage'
import { rankingCache } from '@/lib/ranking-cache'
import { requestThrottle } from '@/lib/request-throttle'
import { filterWithNGList } from '@/lib/filter-with-ng-list'
import type { RankingData, RankingItem } from '@/types/ranking'
import type { RankingConfig, RankingGenre } from '@/types/ranking-config'
import type { NGList } from '@/types/ng-list'
import './client-page.css'
import '@/components/ranking-item-responsive.css'

interface ClientPageProps {
  initialData: { items: RankingItem[], popularTags?: string[] }
  allRankingData?: RankingItem[]
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

export default function ClientPage({ 
  initialData, 
  allRankingData,
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
  const { ngList } = useUserNGList()
  
  // NGリストのバージョンを追跡（更新時に強制再レンダリング）
  const ngListVersion = useMemo(() => {
    // ngListオブジェクト全体をJSON文字列化してハッシュ値として使用
    return JSON.stringify(ngList)
  }, [ngList])
  
  // 設定の管理（初期値はURLパラメータから）
  const [config, setConfig] = useState<RankingConfig>(() => {
    return {
      period: initialPeriod as '24h' | 'hour',
      genre: initialGenre as RankingGenre,
      tag: initialTag
    }
  })
  
  // ページ状態の管理
  const [currentPage, setCurrentPage] = useState(() => {
    // URLパラメータから初期ページを取得
    if (typeof window !== 'undefined') {
      const urlParams = new URLSearchParams(window.location.search)
      const pageParam = urlParams.get('page')
      if (pageParam) {
        const pageNum = parseInt(pageParam, 10)
        return Math.max(1, pageNum)
      }
    }
    return initialPage
  })
  
  const [rankingData, setRankingData] = useState<RankingItem[]>(initialData.items || initialData as any)
  const [fullRankingData, setFullRankingData] = useState<RankingItem[]>(
    allRankingData || initialData.items || initialData as any
  )
  const [currentPopularTags, setCurrentPopularTags] = useState<string[]>(() => {
    // サーバーサイドでは localStorage を使用しない
    if (typeof window === 'undefined') {
      return popularTags
    }
    
    // 人気タグをlocalStorageから復元（ブラウザバック対応）
    const storageKey = `popular-tags-${initialGenre}-${initialPeriod}`
    try {
      const cached = localStorage.getItem(storageKey)
      if (cached) {
        const parsed = JSON.parse(cached)
        if (Array.isArray(parsed) && parsed.length > 0) {
          return parsed
        }
      }
    } catch {
      // パースエラーは無視
    }
    return popularTags
  })
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  
  // リクエストキャンセル用のAbortController
  const abortControllerRef = useRef<AbortController | null>(null)
  // 人気タグ取得用のAbortController
  const tagsAbortControllerRef = useRef<AbortController | null>(null)
  
  // 人気タグのキャッシュ保存用
  const savePopularTagsToCache = useCallback((tags: string[], genre: string, period: string) => {
    if (tags && tags.length > 0) {
      const storageKey = `popular-tags-${genre}-${period}`
      try {
        localStorage.setItem(storageKey, JSON.stringify(tags))
      } catch (error) {
        // ストレージエラーは無視
      }
    }
  }, [])
  
  // CSS-onlyレスポンシブ対応により、JSでのモバイル検出は不要
  
  // 初回マウント時にデータ移行を実行
  useEffect(() => {
    migrateLocalStorageData()
  }, [])
  
  // ページ離脱時に現在の設定をsessionStorageに保存
  useEffect(() => {
    const saveCurrentState = () => {
      const stateToSave = {
        genre: config.genre,
        period: config.period,
        tag: config.tag,
        page: currentPage,
        popularTags: currentPopularTags,
        savedAt: Date.now()
      }
      sessionStorage.setItem('ranking-navigation-state', JSON.stringify(stateToSave))
    }
    
    // ページ離脱時に保存
    window.addEventListener('beforeunload', saveCurrentState)
    
    // 内部リンククリック時にも保存
    const handleInternalNavigation = (e: MouseEvent) => {
      const target = e.target as HTMLElement
      const link = target.closest('a')
      
      // 内部リンク（メニューページ）の場合のみ状態を保存
      if (link && link.href && !link.href.includes('nicovideo.jp') && !link.href.includes('niconico.jp')) {
        const url = new URL(link.href)
        if (url.origin === window.location.origin && url.pathname !== '/') {
          saveCurrentState()
        }
      }
    }
    
    document.addEventListener('click', handleInternalNavigation)
    
    return () => {
      window.removeEventListener('beforeunload', saveCurrentState)
      document.removeEventListener('click', handleInternalNavigation)
    }
  }, [config, currentPopularTags, currentPage])
  
  // sessionStorageから復元する設定を管理
  const [shouldRestore, setShouldRestore] = useState(() => {
    // サーバーサイドでは復元しない
    if (typeof window === 'undefined') return null
    
    // URLパラメータがない場合のみ、sessionStorageから復元を試みる
    const hasUrlParams = new URLSearchParams(window.location.search).has('genre') || 
                        new URLSearchParams(window.location.search).has('period') || 
                        new URLSearchParams(window.location.search).has('tag') ||
                        new URLSearchParams(window.location.search).has('page')
    
    if (!hasUrlParams && typeof window !== 'undefined') {
      try {
        const savedState = sessionStorage.getItem('ranking-navigation-state')
        if (savedState) {
          const parsed = JSON.parse(savedState)
          // 30分以内のデータのみ復元（古いデータは無視）
          const thirtyMinutesAgo = Date.now() - (30 * 60 * 1000)
          if (parsed.savedAt && parsed.savedAt > thirtyMinutesAgo) {
            return parsed
          }
        }
      } catch {
        // エラーは無視
      }
    }
    return null
  })
  
  // 初期表示時に人気タグがない場合は動的に取得
  useEffect(() => {
    // 人気タグ取得用のAbortController
    const controller = new AbortController()
    
    if (!config.tag && config.genre !== 'all' && currentPopularTags.length === 0) {
      getPopularTagsClient(config.genre, config.period, controller.signal)
        .then(tags => {
          if (!controller.signal.aborted && tags && tags.length > 0) {
            setCurrentPopularTags(tags)
            savePopularTagsToCache(tags, config.genre, config.period)
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
  
  // スクロール位置の保存・復元ロジックは削除
  // 理由: 動画リンクは target="_blank" で別タブで開くため、
  // 元のタブのスクロール位置は自動的に保持される
  
  // 設定変更時の処理
  const handleConfigChange = useCallback(async (newConfig: RankingConfig, force = false) => {
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
    setLoading(true)
    setError(null)
    
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
    // 設定変更時はページ1にリセット
    setCurrentPage(1)
    
    router.push(params.toString() ? `?${params.toString()}` : '/', { scroll: false })
    
    // 前のリクエストをキャンセル
    if (abortControllerRef.current) {
      abortControllerRef.current.abort()
    }
    if (tagsAbortControllerRef.current) {
      tagsAbortControllerRef.current.abort()
    }
    
    // 新しいAbortControllerを作成
    const controller = new AbortController()
    abortControllerRef.current = controller
    
    // 人気タグ取得用のAbortControllerも新規作成
    const tagsController = new AbortController()
    tagsAbortControllerRef.current = tagsController
    
    // Check client-side cache first
    const cached = rankingCache.get(newConfig.genre, newConfig.period, newConfig.tag)
    if (cached) {
      // 全データを保存
      setFullRankingData(cached.data)
      
      // 現在のページのアイテムのみを表示データとして設定
      const startIndex = (currentPage - 1) * ITEMS_PER_PAGE
      const endIndex = startIndex + ITEMS_PER_PAGE
      setRankingData(cached.data.slice(startIndex, endIndex))
      
      if (cached.popularTags && !newConfig.tag && newConfig.genre !== 'all') {
        setCurrentPopularTags(cached.popularTags)
      }
      setLoading(false)
      return
    }
    
    try {
      const apiParams = new URLSearchParams({
        genre: newConfig.genre,
        period: newConfig.period,
      })
      if (newConfig.tag) {
        apiParams.append('tag', newConfig.tag)
      }
      
      // Use fallback mechanism to handle rate limits
      const { APIFallback } = await import('@/lib/api-fallback')
      
      // Apply client-side rate limiting
      await requestThrottle.throttle('ranking-api')
      
      const response = await APIFallback.fetchWithFallback(apiParams, controller.signal)
      
      if (!response.ok) {
        // より詳細なエラーメッセージ
        if (response.status === 429) {
          throw new Error('リクエストが多すぎます。少し待ってから再度お試しください。')
        } else if (response.status >= 500) {
          // 500エラーでも続行を試みる
          console.error(`[Client] Server error ${response.status}, attempting to parse response`)
          // レスポンスボディを確認
          try {
            const errorText = await response.text()
            console.error(`[Client] Error response body:`, errorText)
            // JSONとしてパースを試みる
            const errorData = JSON.parse(errorText)
            if (errorData.error) {
              throw new Error(errorData.error)
            }
          } catch (e) {
            // パースエラーの場合はデフォルトメッセージ
            throw new Error(`サーバーエラーが発生しました (${response.status})`)
          }
        } else if (response.status === 404 && newConfig.tag) {
          // タグが見つからない場合は、タグなしの状態に自動遷移
          // タグなしの設定で再度リクエスト
          const taglessConfig = { ...newConfig, tag: undefined }
          handleConfigChange(taglessConfig)
          return // 現在の処理を終了
        } else if (response.status >= 400) {
          throw new Error(`データの取得に失敗しました (${response.status})`)
        }
      }
      
      // レスポンスのパース
      // 本番環境でWorkerがContent-Encoding: gzipを設定している場合、
      // ブラウザが自動的に解凍するので通常のJSONパースでOK
      const data = await response.json()
      
      if (data.items && Array.isArray(data.items)) {
        // 全データを保存
        setFullRankingData(data.items)
        
        // 現在のページのアイテムのみを表示データとして設定
        const startIndex = (currentPage - 1) * ITEMS_PER_PAGE
        const endIndex = startIndex + ITEMS_PER_PAGE
        setRankingData(data.items.slice(startIndex, endIndex))
        
        // Cache the data
        rankingCache.set(
          newConfig.genre, 
          newConfig.period, 
          data.items, 
          data.popularTags || currentPopularTags,
          newConfig.tag
        )
        
        // 人気タグの処理
        if (!newConfig.tag && newConfig.genre !== 'all') {
          if (data.popularTags && data.popularTags.length > 0) {
            // APIから人気タグが返ってきた場合
            setCurrentPopularTags(data.popularTags)
            savePopularTagsToCache(data.popularTags, newConfig.genre, newConfig.period)
          } else {
            // APIから人気タグが返ってこなかった場合、動的に取得
            try {
              const tags = await getPopularTagsClient(newConfig.genre, newConfig.period, tagsController.signal)
              if (!tagsController.signal.aborted && tags && tags.length > 0) {
                setCurrentPopularTags(tags)
                savePopularTagsToCache(tags, newConfig.genre, newConfig.period)
              }
            } catch {
              // エラー時はキャッシュから取得を試みる
              if (typeof window !== 'undefined') {
                const storageKey = `popular-tags-${newConfig.genre}-${newConfig.period}`
                const cached = localStorage.getItem(storageKey)
                if (cached) {
                  try {
                    const parsed = JSON.parse(cached)
                    if (Array.isArray(parsed) && parsed.length > 0) {
                      setCurrentPopularTags(parsed)
                    }
                  } catch {
                    // パースエラーは無視
                  }
                }
              }
            }
          }
        } else if (newConfig.genre === 'all') {
          // allジャンルの場合のみ空配列
          setCurrentPopularTags([])
        } else if (newConfig.tag) {
          // タグ指定時でも人気タグが空の場合は取得を試みる（allジャンルは上で処理済み）
          if (currentPopularTags.length === 0) {
            try {
              const tags = await getPopularTagsClient(newConfig.genre, newConfig.period, tagsController.signal)
              if (!tagsController.signal.aborted && tags && tags.length > 0) {
                setCurrentPopularTags(tags)
                savePopularTagsToCache(tags, newConfig.genre, newConfig.period)
              }
            } catch {
              // エラー時はキャッシュから取得
              if (typeof window !== 'undefined') {
                const storageKey = `popular-tags-${newConfig.genre}-${newConfig.period}`
                const cached = localStorage.getItem(storageKey)
                if (cached) {
                  try {
                    const parsed = JSON.parse(cached)
                    if (Array.isArray(parsed) && parsed.length > 0) {
                      setCurrentPopularTags(parsed)
                    }
                  } catch {
                    // パースエラーは無視
                  }
                }
              }
            }
          }
          // 人気タグが既にある場合は維持
        }
      } else if (Array.isArray(data)) {
        // 全データを保存
        setFullRankingData(data)
        
        // 現在のページのアイテムのみを表示データとして設定
        const startIndex = (currentPage - 1) * ITEMS_PER_PAGE
        const endIndex = startIndex + ITEMS_PER_PAGE
        setRankingData(data.slice(startIndex, endIndex))
        
        // Cache the data (array format)
        rankingCache.set(
          newConfig.genre, 
          newConfig.period, 
          data,
          currentPopularTags,
          newConfig.tag
        )
        
        // 配列形式のレスポンスの場合も人気タグを動的に取得
        if (newConfig.genre !== 'all') {
          // タグ指定の有無に関わらず、人気タグが空の場合は取得
          if (currentPopularTags.length === 0) {
            try {
              const tags = await getPopularTagsClient(newConfig.genre, newConfig.period, tagsController.signal)
              if (!tagsController.signal.aborted && tags && tags.length > 0) {
                setCurrentPopularTags(tags)
                savePopularTagsToCache(tags, newConfig.genre, newConfig.period)
              }
            } catch {
              // エラー時は現在の値を維持
            }
          }
        }
      } else {
        setFullRankingData([])
        setRankingData([])
      }
    } catch (err: any) {
      // AbortErrorは無視（前のリクエストがキャンセルされた場合）
      if (err.name === 'AbortError') {
        return
      }
      
      setError(err instanceof Error ? err.message : 'データの取得に失敗しました')
      setFullRankingData([])
      setRankingData([])
    } finally {
      // AbortErrorの場合はローディング状態を維持
      if (abortControllerRef.current?.signal.aborted !== true) {
        setLoading(false)
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [config, router, updatePreferences, savePopularTagsToCache])
  
  // ページ変更時の処理
  const handlePageChange = useCallback((page: number) => {
    if (page === currentPage) return
    
    setCurrentPage(page)
    
    // フルデータから現在のページのアイテムを抽出
    if (fullRankingData.length > 0) {
      const startIndex = (page - 1) * ITEMS_PER_PAGE
      const endIndex = startIndex + ITEMS_PER_PAGE
      setRankingData(fullRankingData.slice(startIndex, endIndex))
    }
    
    // URLを更新（ページパラメータを追加）
    const params = new URLSearchParams()
    if (config.genre !== 'all') params.set('genre', config.genre)
    if (config.period !== '24h') params.set('period', config.period)
    if (config.tag) params.set('tag', config.tag)
    if (page > 1) params.set('page', page.toString())
    
    router.push(params.toString() ? `?${params.toString()}` : '/', { scroll: false })
  }, [currentPage, config, router, fullRankingData])
  
  // sessionStorageから設定を復元
  useEffect(() => {
    if (shouldRestore) {
      const restoredConfig: RankingConfig = {
        genre: shouldRestore.genre || 'all',
        period: shouldRestore.period || '24h',
        tag: shouldRestore.tag
      }
      
      // 保存された設定が現在の設定と異なる場合のみ更新
      if (
        restoredConfig.genre !== config.genre ||
        restoredConfig.period !== config.period ||
        restoredConfig.tag !== config.tag
      ) {
        // 人気タグも復元
        if (shouldRestore.popularTags && Array.isArray(shouldRestore.popularTags)) {
          setCurrentPopularTags(shouldRestore.popularTags)
        }
        
        // ページ状態も復元
        if (shouldRestore.page && shouldRestore.page > 1) {
          setCurrentPage(shouldRestore.page)
        }
        
        // URLを更新（ブラウザの履歴に追加しない）
        const params = new URLSearchParams()
        if (restoredConfig.genre !== 'all') params.set('genre', restoredConfig.genre)
        if (restoredConfig.period !== '24h') params.set('period', restoredConfig.period)
        if (restoredConfig.tag) params.set('tag', restoredConfig.tag)
        if (shouldRestore.page && shouldRestore.page > 1) params.set('page', shouldRestore.page.toString())
        
        const newUrl = params.toString() ? `?${params.toString()}` : '/'
        window.history.replaceState(null, '', newUrl)
        
        // handleConfigChangeを使用してデータも取得
        handleConfigChange(restoredConfig)
        
        // 復元後は削除
        sessionStorage.removeItem('ranking-navigation-state')
        setShouldRestore(null)
      }
    }
  }, [shouldRestore, config, handleConfigChange])
  
  // NGリスト適用時の処理は不要（ngListの変更で自動的に再計算される）

  // フィルタリングとページネーション
  const { displayItems, totalPages, totalItems } = useMemo(() => {
    // 取得件数の上限
    const limit = config.tag ? DISPLAY_LIMITS.TAG : DISPLAY_LIMITS.GENRE
    
    // UserNGListをNGList形式に変換（useUserNGListフック内のconvertToNGListロジックを展開）
    const ngListForFilter: NGList = {
      videoIds: ngList.videoIds,
      videoTitles: ngList.videoTitles,
      authorIds: ngList.authorIds,
      authorNames: ngList.authorNames,
      derivedVideoIds: [] // クライアント側では派生IDは使用しない
    }
    
    // フルデータに対してフィルタリングを適用
    const { filteredItems } = filterWithNGList(fullRankingData, ngListForFilter)
    
    // 全取得件数を制限
    const allItems = filteredItems.slice(0, limit)
    
    // タグ別ランキングの場合はページネーションなしで全件表示
    let pageItems: RankingItem[]
    let calculatedTotalPages: number
    
    if (config.tag) {
      // タグ別ランキングは全300件を表示
      pageItems = allItems
      calculatedTotalPages = 1
    } else {
      // ジャンル別ランキングは通常のページネーション
      const startIndex = (currentPage - 1) * ITEMS_PER_PAGE
      const endIndex = startIndex + ITEMS_PER_PAGE
      pageItems = allItems.slice(startIndex, endIndex)
      calculatedTotalPages = Math.ceil(allItems.length / ITEMS_PER_PAGE)
    }
    
    // originalRankを追加（元のランク番号を保持）
    const result = pageItems.map(item => ({
      ...item,
      originalRank: fullRankingData.find(original => original.id === item.id)?.rank || item.rank
    }))
    
    return {
      displayItems: result,
      totalPages: calculatedTotalPages,
      totalItems: allItems.length
    }
  }, [fullRankingData, config.tag, ngList, currentPage])
  
  // リアルタイム統計更新を無効化
  // 理由: KVのバッチ読み取りはキーごとに課金されるため、
  // 100ユーザーで1時間あたり150,000回の読み取りが発生し、
  // 無料枠（100,000回/日）を40分で超過してしまう
  const finalDisplayItems = displayItems
  const isUpdating = false
  const lastUpdated = null
  
  // レンダリング
  return (
    <>
      <div className="selectors-container">
        <RankingSelector config={config} onConfigChange={handleConfigChange} />
        <TagSelector 
          config={config} 
          onConfigChange={handleConfigChange} 
          popularTags={currentPopularTags} 
        />
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
            エラー: {error}
          </div>
        </div>
      )}
      
      {!loading && !error && finalDisplayItems.length === 0 && (
        <div style={{ textAlign: 'center', padding: '40px' }}>
          <div style={{ 
            fontSize: '16px', 
            color: 'var(--text-secondary)',
            marginBottom: '20px'
          }}>
            {config.tag ? 'このタグの動画が見つかりません' : 'ランキングデータがありません'}
          </div>
          {config.tag && (
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
      
      {!loading && !error && finalDisplayItems.length > 0 && (
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
          
          {/* 上部ページネーション（タグ別ランキングでは非表示） */}
          {!config.tag ? (
            <Pagination
              currentPage={currentPage}
              totalPages={totalPages}
              totalItems={totalItems}
              itemsPerPage={ITEMS_PER_PAGE}
              onPageChange={handlePageChange}
            />
          ) : (
            /* タグ別ランキングの件数表示 */
            <div style={{
              display: 'flex',
              justifyContent: 'center',
              padding: '20px 0',
              borderTop: '1px solid var(--border-color)',
              marginTop: '20px'
            }}>
              <div style={{
                fontSize: '14px',
                color: 'var(--text-secondary)',
                textAlign: 'center'
              }}>
                {totalItems}件表示
              </div>
            </div>
          )}
          
          {/* ランキングリスト */}
          <ul key={ngListVersion} style={{ listStyle: 'none', padding: 0, margin: 0 }}>
            {finalDisplayItems.map((item) => (
              <RankingItemResponsive 
                key={item.id} 
                item={item}
              />
            ))}
          </ul>
          
          {/* 下部ページネーション（タグ別ランキングでは非表示） */}
          {!config.tag && (
            <Pagination
              currentPage={currentPage}
              totalPages={totalPages}
              totalItems={totalItems}
              itemsPerPage={ITEMS_PER_PAGE}
              onPageChange={handlePageChange}
            />
          )}
        </>
      )}
    </>
  )
}