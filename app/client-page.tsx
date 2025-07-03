'use client'

import React, { useState, useEffect, useCallback, useMemo, useRef, lazy, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { RankingSelector } from '@/components/ranking-selector'
import RankingItemResponsive from '@/components/ranking-item-responsive'
import { useUserPreferences } from '@/hooks/use-user-preferences'
import { generateNGListHash } from '@/lib/ng-list-hash'

// 動的インポートでバンドルサイズを削減
const Pagination = lazy(() => import('@/components/pagination'))
const TagSelector = lazy(() => import('@/components/tag-selector').then(mod => ({ default: mod.TagSelector })))
import { useUserNGList } from '@/hooks/use-user-ng-list'
import { useRankingData } from '@/hooks/use-ranking-data'
import { getPopularTagsClient } from '@/lib/popular-tags-client'
import { migrateLocalStorageData } from '@/lib/migrate-local-storage'
import type { RankingData, RankingItem } from '@/types/ranking'
import type { RankingConfig, RankingGenre } from '@/types/ranking-config'
import type { NGList } from '@/types/ng-list'
import './client-page.css'
import '@/components/ranking-item-responsive.css'

interface ClientPageProps {
  initialData: { items: RankingItem[], popularTags?: string[] }
  totalItems: number
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
  totalItems,
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
    
    // URLパラメータがない場合のみ、sessionStorageから復元を試みる
    const hasUrlParams = urlParams.has('genre') || 
                        urlParams.has('period') || 
                        urlParams.has('tag') ||
                        urlParams.has('page')
    
    if (!hasUrlParams) {
      try {
        const savedState = sessionStorage.getItem('ranking-navigation-state')
        if (savedState) {
          const parsed = JSON.parse(savedState)
          // 30分以内のデータのみ復元（古いデータは無視）
          const thirtyMinutesAgo = Date.now() - (30 * 60 * 1000)
          if (parsed.savedAt && parsed.savedAt > thirtyMinutesAgo) {
            setShouldRestore(parsed)
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
  
  // スクロール位置の保存・復元ロジックは削除
  // 理由: 動画リンクは target="_blank" で別タブで開くため、
  // 元のタブのスクロール位置は自動的に保持される
  
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
  
  // ページ変更時の処理
  const handlePageChange = useCallback((page: number) => {
    if (page === currentPage) return
    
    setCurrentPage(page)
    
    // サーバーサイドページネーション: ページ遷移はリロードで行う
    const params = new URLSearchParams()
    if (config.genre !== 'all') params.set('genre', config.genre)
    if (config.period !== '24h') params.set('period', config.period)
    if (config.tag) params.set('tag', config.tag)
    if (page > 1) params.set('page', page.toString())
    
    // Next.js App Routerを使用してクライアントサイドでページ遷移
    // scroll: falseでスクロール位置を維持
    router.push(params.toString() ? `?${params.toString()}` : '/', { scroll: false })
  }, [currentPage, config])
  
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shouldRestore])
  
  // NGリスト適用時の処理は不要（ngListの変更で自動的に再計算される）

  // ページネーション処理 (NGフィルタリングはフック内で実行済み)
  const { displayItems, totalPages, totalItemsCount } = useMemo(() => {
    // サーバーサイドページネーション：totalItemsを使用して総ページ数を計算
    const calculatedTotalPages = Math.ceil(totalItems / ITEMS_PER_PAGE)
    
    // 現在のページのアイテムを取得（既にSSRで設定済み）
    const pageItems = rankingData
    
    // originalRankを追加（元のランク番号を保持）し、連続したランク番号を割り当て
    const result = pageItems.map((item, index) => {
      const startRank = (currentPage - 1) * ITEMS_PER_PAGE + 1
      return {
        ...item,
        originalRank: item.rank, // 既にランク順でソート済み
        rank: startRank + index // 連続した表示用ランク番号
      }
    })
    
    return {
      displayItems: result,
      totalPages: calculatedTotalPages,
      totalItemsCount: totalItems
    }
  }, [rankingData, totalItems, config.tag, currentPage])
  
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
      <>
        <div className="selectors-container">
        <RankingSelector config={config} onConfigChange={handleConfigChange} />
        <Suspense fallback={
          <div style={{ 
            minHeight: '100px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: 'var(--text-secondary)'
          }}>
            <span>タグを読み込み中...</span>
          </div>
        }>
          <TagSelector 
            config={config} 
            onConfigChange={handleConfigChange} 
            popularTags={currentPopularTags} 
          />
        </Suspense>
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
          
          {/* 上部ページネーション */}
          <Suspense fallback={
            <div style={{
              display: 'flex',
              justifyContent: 'center',
              padding: '20px 0',
              borderTop: '1px solid var(--border-color)',
              marginTop: '20px'
            }}>
              <div style={{ height: '40px' }} />
            </div>
          }>
            <Pagination
              currentPage={currentPage}
              totalPages={totalPages}
              totalItems={totalItemsCount}
              itemsPerPage={ITEMS_PER_PAGE}
              onPageChange={handlePageChange}
            />
          </Suspense>
          
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
          <ul key={ngListVersion} style={{ listStyle: 'none', padding: 0, margin: 0 }}>
            {finalDisplayItems.map((item) => (
              <RankingItemResponsive 
                key={item.id} 
                item={item}
              />
            ))}
          </ul>
          
          {/* 下部ページネーション */}
          <Suspense fallback={
            <div style={{
              display: 'flex',
              justifyContent: 'center',
              padding: '20px 0',
              borderTop: '1px solid var(--border-color)',
              marginTop: '20px'
            }}>
              <div style={{ height: '40px' }} />
            </div>
          }>
            <Pagination
              currentPage={currentPage}
              totalPages={totalPages}
              totalItems={totalItemsCount}
              itemsPerPage={ITEMS_PER_PAGE}
              onPageChange={handlePageChange}
            />
          </Suspense>
          
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
    </>
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