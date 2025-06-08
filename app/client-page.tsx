'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { RankingSelector } from '@/components/ranking-selector'
import { TagSelector } from '@/components/tag-selector'
import RankingItemComponent from '@/components/ranking-item'
import { useRealtimeStats } from '@/hooks/use-realtime-stats'
import { useUserPreferences } from '@/hooks/use-user-preferences'
import { useUserNGList } from '@/hooks/use-user-ng-list'
import { useMobileDetect } from '@/hooks/use-mobile-detect'
import { getPopularTags } from '@/lib/popular-tags'
import type { RankingData, RankingItem } from '@/types/ranking'
import type { RankingConfig, RankingGenre } from '@/types/ranking-config'

interface ClientPageProps {
  initialData: RankingData
  initialGenre?: string
  initialPeriod?: string
  initialTag?: string
  popularTags?: string[]
}

export default function ClientPage({ 
  initialData, 
  initialGenre = 'all', 
  initialPeriod = '24h', 
  initialTag, 
  popularTags = []
}: ClientPageProps) {
  const router = useRouter()
  const searchParams = useSearchParams()
  
  const [config, setConfig] = useState<RankingConfig>({
    period: initialPeriod as '24h' | 'hour',
    genre: initialGenre as RankingGenre,
    tag: initialTag
  })
  const [rankingData, setRankingData] = useState<RankingData>(initialData)
  const [currentPopularTags, setCurrentPopularTags] = useState<string[]>(popularTags)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [displayCount, setDisplayCount] = useState(100) // 初期表示を100件に
  const [currentPage, setCurrentPage] = useState(1) // 現在のページ数
  // タグ別ランキングの場合、初期データが100件未満ならhasMoreをfalseに初期化
  const [hasMore, setHasMore] = useState(() => {
    if (initialTag && initialData.length < 100) {
      return false
    }
    return true
  })
  const [loadingMore, setLoadingMore] = useState(false) // 追加読み込み中か
  
  // スクロール復元用のフラグ
  const [shouldRestoreScroll, setShouldRestoreScroll] = useState(false)
  const scrollPositionRef = useRef<number>(0)
  const abortControllerRef = useRef<AbortController | null>(null)
  
  // ユーザー設定の永続化
  const { updatePreferences } = useUserPreferences()
  
  // カスタムNGリスト
  const { filterItems } = useUserNGList()
  
  // モバイル検出
  const isMobile = useMobileDetect()
  
  // ストレージのクリーンアップ
  const cleanupOldStorage = useCallback(() => {
    try {
      const now = Date.now()
      const oneHourAgo = now - 60 * 60 * 1000
      
      // localStorageのクリーンアップ
      const keysToRemove: string[] = []
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i)
        if (key?.startsWith('ranking-state-')) {
          try {
            const data = JSON.parse(localStorage.getItem(key) || '{}')
            if (data.timestamp && data.timestamp < oneHourAgo) {
              keysToRemove.push(key)
            }
          } catch {
            // パースエラーの場合も削除
            keysToRemove.push(key)
          }
        }
      }
      
      // 一括削除
      keysToRemove.forEach(key => localStorage.removeItem(key))
      
      // sessionStorageもクリア（念のため）
      sessionStorage.clear()
    } catch (error) {
      // エラーは静かに無視
    }
  }, [])
  
  // リアルタイム統計更新を使用（1分ごとに自動更新）
  const { items: realtimeItems, isLoading: isUpdating, lastUpdated } = useRealtimeStats(
    rankingData,
    true, // 常に有効
    60000 // 1分ごと
  )
  
  // sessionStorageとlocalStorageから状態を復元
  useEffect(() => {
    const storageKey = `ranking-state-${initialGenre}-${initialPeriod}-${initialTag || 'none'}`
    
    // まずsessionStorageを確認
    let savedState = sessionStorage.getItem(storageKey)
    
    // sessionStorageになければlocalStorageを確認（外部サイトから戻った場合用）
    if (!savedState) {
      savedState = localStorage.getItem(storageKey)
      // localStorageから復元した場合は、sessionStorageにもコピー
      if (savedState) {
        sessionStorage.setItem(storageKey, savedState)
      }
    }
    
    if (savedState) {
      try {
        const state = JSON.parse(savedState)
        // 1時間以内のデータのみ復元（古いデータは使わない）
        if (state.timestamp && Date.now() - state.timestamp < 3600000) {
          // 新しいデータ構造（dataVersion = 1）の場合
          if (state.dataVersion === 1) {
            // 表示設定のみ復元（データは初期データを使用）
            setDisplayCount(state.displayCount || 100)
            setCurrentPage(state.currentPage || 1)
            setHasMore(state.hasMore ?? true)
            
            // スクロール位置を保存してフラグを立てる
            scrollPositionRef.current = state.scrollPosition || 0
            setShouldRestoreScroll(true)
          } else if (state.items && state.items.length > 0) {
            // 旧データ構造（後方互換性のため）
            setRankingData(state.items)
            setDisplayCount(state.displayCount || 100)
            setCurrentPage(state.currentPage || 1)
            // hasMoreの復元: 明示的にfalseの場合のみfalse、それ以外はデータ長で判断
            if (state.hasMore === false) {
              setHasMore(false)
            } else if (initialTag) {
              // タグ別ランキングの場合は、データ長で判断
              setHasMore(state.items.length >= 100)
            } else {
              setHasMore(true)
            }
            
            // スクロール位置を保存してフラグを立てる
            scrollPositionRef.current = state.scrollPosition || 0
            setShouldRestoreScroll(true)
          }
        } else {
          // 古いデータは削除
          localStorage.removeItem(storageKey)
        }
      } catch (e) {
        // エラーは無視
      }
    }
    
    // 復元が完了したら、一度だけクリーンアップ
    // （次回の復元で古いデータを使わないように）
    return () => {
      // コンポーネントがアンマウントされる時ではなく、
      // 復元が成功した後に削除するためのフラグを設定
      if (savedState && shouldRestoreScroll) {
        // 少し遅延を入れて、復元処理が完了してから削除
        setTimeout(() => {
          sessionStorage.removeItem(storageKey)
          // localStorageは1時間の有効期限があるので残しておく
        }, 1000)
      }
    }
  }, [initialGenre, initialPeriod, initialTag, shouldRestoreScroll])
  
  // DOM更新後にスクロール位置を復元
  useEffect(() => {
    if (shouldRestoreScroll && scrollPositionRef.current > 0) {
      // requestAnimationFrameを使ってレンダリング完了を待つ
      const restoreScroll = () => {
        requestAnimationFrame(() => {
          // さらにsetTimeoutで確実にDOM更新を待つ
          setTimeout(() => {
            window.scrollTo(0, scrollPositionRef.current)
            setShouldRestoreScroll(false)
          }, 0)
        })
      }
      
      // displayCountに応じたアイテム数がレンダリングされるのを待つ
      const checkAndRestore = () => {
        const items = document.querySelectorAll('[data-testid="ranking-item"]')
        if (items.length >= Math.min(displayCount, rankingData.length)) {
          restoreScroll()
        } else {
          // まだレンダリングされていない場合は再試行
          requestAnimationFrame(checkAndRestore)
        }
      }
      
      checkAndRestore()
    }
  }, [shouldRestoreScroll, displayCount, rankingData.length])
  
  // initialDataが変更されたときに状態をリセット
  // ただし、localStorage/sessionStorageから復元したデータがある場合はスキップ
  useEffect(() => {
    // 復元されたデータがある場合は、initialDataの変更を無視
    const storageKey = `ranking-state-${initialGenre}-${initialPeriod}-${initialTag || 'none'}`
    const hasRestoredData = sessionStorage.getItem(storageKey) || localStorage.getItem(storageKey)
    
    if (!hasRestoredData) {
      setDisplayCount(100)
      setRankingData(initialData)
      setCurrentPage(1)
      // タグ別ランキングの場合、初期データが100件ちょうどなら潜在的にもっとあるかもしれない
      // 実際のhasMoreはAPIレスポンスで決まる
      if (config.tag) {
        setHasMore(initialData.length === 100)
      } else {
        // 通常のランキングは、初期データが100件以上ある場合のみhasMore=true
        setHasMore(initialData.length > 100)
      }
    }
  }, [initialData, config.tag, initialGenre, initialPeriod, initialTag])

  // ジャンルが変更されたときのみ人気タグをリセット
  const [previousGenre, setPreviousGenre] = useState(config.genre)
  
  // 前回の設定を記録（useRefで即座に反映）
  const prevConfigRef = useRef<RankingConfig>({
    period: initialPeriod as '24h' | 'hour',
    genre: initialGenre as RankingGenre,
    tag: initialTag
  })

  useEffect(() => {
    const fetchRanking = async () => {
      // 前回のリクエストをキャンセル
      if (abortControllerRef.current) {
        abortControllerRef.current.abort()
      }
      
      // 新しいAbortControllerを作成
      const controller = new AbortController()
      abortControllerRef.current = controller
      
      setLoading(true)
      setError(null)
      setDisplayCount(100) // 新しいデータ取得時は100件にリセット
      setCurrentPage(1) // ページ番号をリセット
      setHasMore(true) // 追加読み込み可能状態にリセット
      setShouldRestoreScroll(false) // 新しいデータ取得時はスクロール復元しない
      
      // ジャンル/タグ切り替え時にストレージをクリーンアップ
      cleanupOldStorage()
      
      try {
        const params = new URLSearchParams({
          period: config.period,
          genre: config.genre
        })
        
        if (config.tag) {
          params.append('tag', config.tag)
        }
        
        const response = await fetch(`/api/ranking?${params}`, {
          signal: controller.signal
        })
        
        if (!response.ok) {
          throw new Error('ランキングの取得に失敗しました')
        }
        
        const data = await response.json()
        
        // APIがオブジェクト形式（{ items, popularTags }）または配列形式を返す可能性がある
        if (Array.isArray(data)) {
          setRankingData(data)
          // タグ選択時は人気タグを更新しない
          if (previousGenre !== config.genre || !config.tag) {
            setCurrentPopularTags([])
          }
        } else if (data && typeof data === 'object' && 'items' in data) {
          setRankingData(data.items)
          // ジャンルが変更された場合、またはタグが選択されていない場合のみ人気タグを更新
          if (previousGenre !== config.genre || !config.tag) {
            setCurrentPopularTags(data.popularTags || [])
          }
        } else {
          setRankingData([])
          if (previousGenre !== config.genre || !config.tag) {
            setCurrentPopularTags([])
          }
        }
        
        // ジャンルを記録
        if (previousGenre !== config.genre) {
          setPreviousGenre(config.genre)
        }
      } catch (err: any) {
        // AbortErrorは無視
        if (err.name !== 'AbortError') {
          setError(err instanceof Error ? err.message : 'エラーが発生しました')
        }
      } finally {
        setLoading(false)
      }
    }

    // 前回の設定から変更があった場合に実行（初期値との比較ではなく）
    const prevConfig = prevConfigRef.current
    const hasChanged = config.period !== prevConfig.period || 
                      config.genre !== prevConfig.genre || 
                      config.tag !== prevConfig.tag
    
    if (hasChanged) {
      fetchRanking()
      prevConfigRef.current = config // 現在の設定を前回の設定として記録
      
      // ユーザー設定を保存
      updatePreferences({
        lastGenre: config.genre,
        lastPeriod: config.period,
        lastTag: config.tag,
      })
      
      // URLを更新（ブラウザの履歴に残す）
      const newParams = new URLSearchParams()
      if (config.genre !== 'all') newParams.set('genre', config.genre)
      if (config.period !== '24h') newParams.set('period', config.period)
      if (config.tag) newParams.set('tag', config.tag)
      
      const newUrl = newParams.toString() ? `?${newParams.toString()}` : '/'
      router.push(newUrl, { scroll: false })
    }
  }, [config, previousGenre, updatePreferences, router, currentPopularTags, cleanupOldStorage])

  // ジャンルやperiod変更時に人気タグを動的に更新
  useEffect(() => {
    // 初回レンダリング時はスキップ（propsの値を使用）
    if (config.genre === initialGenre && config.period === initialPeriod) {
      return
    }
    
    async function updatePopularTags() {
      if (config.genre !== 'all') {
        try {
          const tags = await getPopularTags(config.genre, config.period)
          setCurrentPopularTags(tags)
        } catch (error) {
          // エラー時は空配列を設定
          setCurrentPopularTags([])
        }
      } else {
        setCurrentPopularTags([])
      }
    }
    
    updatePopularTags()
  }, [config.genre, config.period, initialGenre, initialPeriod])

  // localStorageに状態を保存（sessionStorageは使用しない）
  const saveStateToStorage = useCallback(() => {
    try {
      const storageKey = `ranking-state-${config.genre}-${config.period}-${config.tag || 'none'}`
      
      // スクロール位置と表示設定のみを保存（IDリストは保存しない）
      const lightState = {
        displayCount,
        currentPage,
        hasMore,
        scrollPosition: window.scrollY,
        timestamp: Date.now(),
        dataVersion: 2 // データ構造のバージョンを更新
      }
      
      const stateString = JSON.stringify(lightState)
      
      // サイズチェック（10KB以下に制限）
      if (stateString.length > 10 * 1024) {
        return
      }
      
      // localStorageのみに保存
      localStorage.setItem(storageKey, stateString)
    } catch (error) {
      // エラーは静かに無視
    }
  }, [config, displayCount, currentPage, hasMore])

  // スクロール時に状態を保存（デバウンス付き）
  useEffect(() => {
    let timeoutId: NodeJS.Timeout
    const handleScroll = () => {
      clearTimeout(timeoutId)
      // より長いデバウンス時間と、スクロール量チェックを追加
      timeoutId = setTimeout(() => {
        const scrollDiff = Math.abs(window.scrollY - (scrollPositionRef.current || 0))
        // 100px以上スクロールした場合のみ保存
        if (scrollDiff > 100) {
          scrollPositionRef.current = window.scrollY
          saveStateToStorage()
        }
      }, 1000) // 300ms → 1000msに増加
    }
    
    window.addEventListener('scroll', handleScroll, { passive: true })
    return () => {
      window.removeEventListener('scroll', handleScroll)
      clearTimeout(timeoutId)
    }
  }, [saveStateToStorage])

  // ページ離脱時やリンククリック時に状態を保存
  useEffect(() => {
    const handleBeforeUnload = () => {
      saveStateToStorage()
    }
    
    const handleSaveRankingState = () => {
      saveStateToStorage()
    }
    
    window.addEventListener('beforeunload', handleBeforeUnload)
    window.addEventListener('saveRankingState', handleSaveRankingState)
    
    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload)
      window.removeEventListener('saveRankingState', handleSaveRankingState)
    }
  }, [saveStateToStorage])

  // ランキングの追加読み込み（タグ別、ジャンル別共通）
  const MAX_RANKING_ITEMS = 500 // すべてのランキングで500件まで
  
  const loadMoreItems = async () => {
    if (loadingMore || !hasMore) return
    
    // 最大件数チェック
    if (rankingData.length >= MAX_RANKING_ITEMS) {
      setHasMore(false)
      return
    }
    
    setLoadingMore(true)
    try {
      // ページ番号の計算（タグ別とジャンル別で異なる）
      let pageNumber: number
      if (config.tag) {
        // タグ別: currentPageを使用
        pageNumber = currentPage + 1
      } else {
        // ジャンル別: データ長から計算（300件まではキャッシュ、301件目からpage=4）
        pageNumber = Math.floor(rankingData.length / 100) + 1
      }
      
      const params = new URLSearchParams({
        genre: config.genre,
        period: config.period
      })
      
      if (config.tag) {
        params.append('tag', config.tag)
      }
      params.append('page', pageNumber.toString())
      
      const response = await fetch(`/api/ranking?${params.toString()}`)
      if (!response.ok) throw new Error('Failed to fetch')
      
      const data = await response.json()
      
      // 新しいAPIレスポンス形式に対応
      let items: RankingItem[]
      let hasMoreData: boolean
      
      if (data.items && Array.isArray(data.items)) {
        // 新しい形式: { items, hasMore, totalCached }
        items = data.items
        hasMoreData = data.hasMore ?? false
      } else if (Array.isArray(data)) {
        // 旧形式: 配列
        items = data
        hasMoreData = data.length === 100
      } else {
        // データがない場合
        setHasMore(false)
        return
      }
      
      if (items.length > 0) {
        // 新しいデータをそのまま追加（順位はNGフィルタ後に再計算される）
        const newRankingData = [...rankingData, ...items]
        setRankingData(newRankingData)
        
        // currentPageはタグ別の場合のみ更新
        if (config.tag) {
          setCurrentPage(currentPage + 1)
        }
        
        setHasMore(hasMoreData)
        // 新しく追加されたデータも表示するようdisplayCountを更新
        // NGフィルタ適用後の実際の追加件数を計算
        const prevFilteredCount = filterItems(rankingData).length
        const newFilteredCount = filterItems(newRankingData).length
        const actualAddedCount = newFilteredCount - prevFilteredCount
        setDisplayCount(prev => prev + actualAddedCount)
      } else {
        // データがない場合は、それ以上データがないだけなのでhasMoreをfalseに
        setHasMore(false)
        // エラーメッセージは表示しない
        return
      }
    } catch (err) {
      // より具体的なエラーメッセージ
      if (err instanceof Error && err.message === 'Failed to fetch') {
        setError('データの取得に失敗しました。しばらく経ってから再度お試しください。')
      } else {
        setError(err instanceof Error ? err.message : '予期しないエラーが発生しました')
      }
    } finally {
      setLoadingMore(false)
    }
  }

  // カスタムNGフィルタを適用してから表示するアイテムを取得
  const filteredItems = filterItems(realtimeItems)
  
  // フィルタリング後に順位を振り直す
  const rerankedItems = filteredItems.map((item, index) => ({
    ...item,
    rank: index + 1
  }))
  
  const displayItems = rerankedItems.slice(0, displayCount)

  return (
    <>
      <RankingSelector config={config} onConfigChange={setConfig} />
      <TagSelector config={config} onConfigChange={setConfig} popularTags={currentPopularTags} />
      
      {loading && (
        <div style={{ textAlign: 'center', padding: '40px' }}>
          <div style={{ 
            fontSize: '16px', 
            color: 'var(--text-secondary)',
            userSelect: 'none',
            WebkitUserSelect: 'none',
            MozUserSelect: 'none',
            msUserSelect: 'none'
          }}>読み込み中...</div>
        </div>
      )}
      
      {error && (
        <div style={{ 
          background: 'var(--error-bg)', 
          border: '1px solid var(--error-color)',
          borderRadius: '8px',
          padding: '16px',
          marginBottom: '16px',
          color: 'var(--error-color)'
        }}>
          {error}
        </div>
      )}
      
      {!loading && !error && rankingData.length === 0 && (
        <div style={{ textAlign: 'center', padding: '40px' }}>
          <div style={{ 
            fontSize: '16px', 
            color: 'var(--text-secondary)',
            userSelect: 'none',
            WebkitUserSelect: 'none',
            MozUserSelect: 'none',
            msUserSelect: 'none'
          }}>
            ランキングデータがありません
          </div>
        </div>
      )}
      
      {!loading && !error && rankingData.length > 0 && (
        <>
          {/* リアルタイム更新インジケーター（固定高さ） */}
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
              visibility: isUpdating ? 'visible' : 'hidden',
              userSelect: 'none',
              WebkitUserSelect: 'none',
              MozUserSelect: 'none',
              msUserSelect: 'none'
            }}>
              統計情報を更新中...
            </div>
            
            {lastUpdated && (
              <div style={{ 
                fontSize: '11px',
                color: 'var(--text-muted)',
                userSelect: 'none',
                WebkitUserSelect: 'none',
                MozUserSelect: 'none',
                msUserSelect: 'none'
              }}>
                最終更新: {new Date(lastUpdated).toLocaleTimeString('ja-JP')}
              </div>
            )}
          </div>
          
          {/* 通常のリスト表示 */}
          <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
            {displayItems.map((item) => (
              <RankingItemComponent key={item.id} item={item} isMobile={isMobile} />
            ))}
          </ul>
          
          {/* もっと見るボタン（既存データの表示または新規データの読み込み） */}
          {(displayCount < rerankedItems.length || hasMore) && (
            <div style={{ textAlign: 'center', padding: '40px' }}>
              <button
                onClick={() => {
                  if (displayCount < rerankedItems.length) {
                    // 既存データから追加表示（ジャンル別ランキングの1-300位）
                    setDisplayCount(prev => Math.min(prev + 100, rerankedItems.length))
                    saveStateToStorage()
                  } else if (hasMore) {
                    // 新規データを読み込み（タグ別 or ジャンル別301位以降）
                    loadMoreItems()
                  }
                }}
                disabled={loadingMore}
                style={{
                  padding: '12px 32px',
                  fontSize: '16px',
                  background: loadingMore ? 'var(--text-muted)' : 'var(--primary-color)',
                  color: 'white',
                  border: 'none',
                  borderRadius: '8px',
                  cursor: loadingMore ? 'not-allowed' : 'pointer',
                  fontWeight: 'bold'
                }}
              >
                {loadingMore ? '読み込み中...' : 'もっと見る'}
              </button>
            </div>
          )}
        </>
      )}
    </>
  )
}