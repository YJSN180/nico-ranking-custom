'use client'

import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { RankingSelector } from '@/components/ranking-selector'
import { TagSelector } from '@/components/tag-selector'
import RankingItemComponent from '@/components/ranking-item'
import { useRealtimeStats } from '@/hooks/use-realtime-stats'
import { useUserPreferences } from '@/hooks/use-user-preferences'
import { useUserNGList } from '@/hooks/use-user-ng-list'
import { useMobileDetect } from '@/hooks/use-mobile-detect'
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
  
  const [config, setConfig] = useState<RankingConfig>(() => {
    // ローカルストレージから前回の設定を復元
    const savedConfig = localStorage.getItem('ranking-config')
    if (savedConfig) {
      try {
        const parsed = JSON.parse(savedConfig)
        return {
          period: parsed.period || initialPeriod as '24h' | 'hour',
          genre: parsed.genre || initialGenre as RankingGenre,
          tag: parsed.tag || initialTag
        }
      } catch {
        // パースエラーの場合はデフォルト値を使用
      }
    }
    return {
      period: initialPeriod as '24h' | 'hour',
      genre: initialGenre as RankingGenre,
      tag: initialTag
    }
  })
  const [rankingData, setRankingData] = useState<RankingData>(initialData)
  const [currentPopularTags, setCurrentPopularTags] = useState<string[]>(popularTags)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  
  // 人気タグのキャッシュ（ジャンル/期間別）
  const popularTagsCacheRef = useRef<Map<string, { tags: string[], timestamp: number }>>(new Map())
  // URLから初期表示件数を取得
  const initialDisplayCount = parseInt(searchParams.get('show') || '100', 10)
  const [displayCount, setDisplayCount] = useState(Math.min(Math.max(100, initialDisplayCount), 500)) // 初期表示
  const [currentPage, setCurrentPage] = useState(1) // 現在のページ数
  // タグ別ランキングの場合、初期データが100件未満ならhasMoreをfalseに初期化
  // すべてのランキングで500件以上の場合もhasMoreをfalseに
  const [hasMore, setHasMore] = useState(() => {
    if (initialData.length >= 500) {
      return false
    }
    if (initialTag) {
      // タグ別ランキングは100件ちょうどならもっとある可能性がある
      return initialData.length === 100
    }
    // 通常のランキングは100件以上あればもっとある（100件ちょうどでも可能性あり）
    return initialData.length >= 100
  })
  const [loadingMore, setLoadingMore] = useState(false) // 追加読み込み中か
  const [isRestoring, setIsRestoring] = useState(false) // 復元中か
  const [restoreProgress, setRestoreProgress] = useState(0) // 復元進捗（0-100）
  
  // ユーザーNGフィルタ後の順位管理
  const [totalDisplayedCount, setTotalDisplayedCount] = useState(0) // これまでに表示した動画の総数
  const [cumulativeFilteredCount, setCumulativeFilteredCount] = useState(0) // 累積でフィルタされた動画数
  
  // スクロール復元用のフラグ
  const [shouldRestoreScroll, setShouldRestoreScroll] = useState(false)
  const scrollPositionRef = useRef<number>(0)
  const abortControllerRef = useRef<AbortController | null>(null)
  const popularTagsAbortRef = useRef<AbortController | null>(null)
  
  // ユーザー設定の永続化
  const { updatePreferences } = useUserPreferences()
  
  // カスタムNGリスト
  const { filterItems } = useUserNGList()
  
  // モバイル検出
  const isMobile = useMobileDetect()
  
  // ストレージ管理の設定（定数として定義）
  const STORAGE_CONFIG = useMemo(() => ({
    MAX_KEYS: 5, // 最大保存キー数
    USE_SESSION_STORAGE: false, // sessionStorageを使用しない
    MAX_AGE_MS: 30 * 60 * 1000, // 30分
  }), [])
  
  // ストレージのクリーンアップ（改善版）
  const cleanupOldStorage = useCallback(() => {
    try {
      const now = Date.now()
      const currentKey = `ranking-state-${config.genre}-${config.period}-${config.tag || 'none'}`
      
      // localStorageのクリーンアップ
      const rankingKeys: Array<{ key: string; timestamp: number }> = []
      
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i)
        if (key?.startsWith('ranking-state-')) {
          try {
            const data = JSON.parse(localStorage.getItem(key) || '{}')
            rankingKeys.push({ key, timestamp: data.timestamp || 0 })
          } catch {
            // パースエラーのキーは即削除
            localStorage.removeItem(key)
          }
        }
      }
      
      // 現在のキーを除いて、古い順にソート
      const otherKeys = rankingKeys
        .filter(item => item.key !== currentKey)
        .sort((a, b) => b.timestamp - a.timestamp)
      
      // 古いキーを削除（MAX_KEYS - 1個を超える分）
      const keysToRemove = otherKeys.slice(STORAGE_CONFIG.MAX_KEYS - 1)
      
      // 30分以上古いキーも削除対象に追加
      otherKeys.forEach(item => {
        if (now - item.timestamp > STORAGE_CONFIG.MAX_AGE_MS && 
            !keysToRemove.find(k => k.key === item.key)) {
          keysToRemove.push(item)
        }
      })
      
      // 一括削除
      keysToRemove.forEach(item => localStorage.removeItem(item.key))
      
      // sessionStorageは使用しない（クリアのみ）
      if (!STORAGE_CONFIG.USE_SESSION_STORAGE) {
        sessionStorage.clear()
      }
    } catch (error) {
      // Storage cleanup error - silent fail
    }
  }, [config, STORAGE_CONFIG.MAX_KEYS, STORAGE_CONFIG.MAX_AGE_MS, STORAGE_CONFIG.USE_SESSION_STORAGE])
  
  // リアルタイム統計更新を使用（3分ごとに自動更新 - メモリ負荷軽減）
  const REALTIME_UPDATE_INTERVAL = 3 * 60 * 1000 // 3分
  const { items: realtimeItems, isLoading: isUpdating, lastUpdated } = useRealtimeStats(
    rankingData,
    true, // 常に有効
    REALTIME_UPDATE_INTERVAL
  )
  
  // URLの更新（履歴を汚さない）
  const updateURL = useCallback((newDisplayCount: number) => {
    const params = new URLSearchParams(searchParams.toString())
    if (newDisplayCount > 100) {
      params.set('show', newDisplayCount.toString())
    } else {
      params.delete('show')
    }
    const newURL = params.toString() ? `?${params.toString()}` : window.location.pathname
    window.history.replaceState({}, '', newURL)
  }, [searchParams])

  // 動画ページから戻った時のみスクロール位置を復元
  useEffect(() => {
    // ニコニコ動画からの戻り時のみ復元（タグ変更時は復元しない）
    const isFromNiconico = document.referrer && 
      (document.referrer.includes('nicovideo.jp') || document.referrer.includes('niconico.jp'));
    
    const isBackNavigation = window.performance && 
      window.performance.navigation && 
      window.performance.navigation.type === 2;
    
    // URLのshowパラメータから表示件数を復元
    const urlDisplayCount = parseInt(searchParams.get('show') || '100', 10)
    if (urlDisplayCount > 100 && urlDisplayCount <= 500) {
      setDisplayCount(urlDisplayCount)
    }
    
    // ニコニコ動画からの戻り時のみスクロール位置を復元
    if (isBackNavigation && isFromNiconico) {
      const storageKey = `ranking-scroll-${initialGenre}-${initialPeriod}-${initialTag || 'none'}`
      const savedScrollPosition = sessionStorage.getItem(storageKey)
      
      if (savedScrollPosition) {
        const scrollPosition = parseInt(savedScrollPosition, 10)
        scrollPositionRef.current = scrollPosition
        setShouldRestoreScroll(true)
        
        // 復元後は削除
        setTimeout(() => {
          sessionStorage.removeItem(storageKey)
        }, 1000)
      }
    }
  }, [initialGenre, initialPeriod, initialTag, searchParams])
  
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
      let retryCount = 0
      const maxRetries = 20 // 最大20回まで再試行
      
      const checkAndRestore = () => {
        const items = document.querySelectorAll('[data-testid="ranking-item"]')
        if (items.length >= Math.min(displayCount, rankingData.length)) {
          restoreScroll()
        } else if (retryCount < maxRetries) {
          // まだレンダリングされていない場合は再試行
          retryCount++
          requestAnimationFrame(checkAndRestore)
        } else {
          // 最大リトライ回数に達したら、現在のスクロール位置で復元
          restoreScroll()
        }
      }
      
      checkAndRestore()
    }
  }, [shouldRestoreScroll, displayCount, rankingData.length])

  // コンポーネントマウント時にクリーンアップを実行
  useEffect(() => {
    // 初回レンダリング時にクリーンアップ
    cleanupOldStorage()
    
    // 5分ごとに定期的にクリーンアップ
    const interval = setInterval(() => {
      cleanupOldStorage()
      
      // 人気タグキャッシュのクリーンアップ（5分以上古いものを削除）
      const now = Date.now()
      const cacheEntries = Array.from(popularTagsCacheRef.current.entries())
      for (const [key, value] of cacheEntries) {
        if (now - value.timestamp > 5 * 60 * 1000) {
          popularTagsCacheRef.current.delete(key)
        }
      }
    }, 5 * 60 * 1000)
    
    return () => clearInterval(interval)
  }, [cleanupOldStorage])

  // ブラウザバック時などの自動復元（削除）
  // この処理は不要なので削除
  /*
  useEffect(() => {
    const restoreToPosition = async (targetCount: number) => {
      // すでに必要なデータがある場合はスキップ
      if (rankingData.length >= targetCount) {
        setDisplayCount(targetCount)
        return
      }

      setIsRestoring(true)
      setRestoreProgress(0)

      try {
        // 必要なページ数を計算
        const currentDataLength = rankingData.length
        const neededPages = Math.ceil((targetCount - currentDataLength) / 100)
        let accumulatedDataLength = currentDataLength
        
        for (let i = 0; i < neededPages; i++) {
          if (!hasMore) break

          // ページ番号の計算
          let pageNumber: number
          if (config.tag) {
            pageNumber = currentPage + i + 1
          } else {
            pageNumber = Math.floor((currentDataLength + i * 100) / 100) + 1
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
          
          let items: RankingItem[]
          let hasMoreData: boolean
          
          if (data.items && Array.isArray(data.items)) {
            items = data.items
            hasMoreData = data.hasMore ?? false
          } else if (Array.isArray(data)) {
            items = data
            hasMoreData = data.length === 100
          } else {
            break
          }

          if (items.length > 0) {
            accumulatedDataLength += items.length
            setRankingData(prev => [...prev, ...items])
            setHasMore(hasMoreData)
            if (config.tag) {
              setCurrentPage(pageNumber)
            }
          }

          // 進捗を更新
          const progress = Math.min(100, ((i + 1) / neededPages) * 100)
          setRestoreProgress(progress)
        }

        setDisplayCount(Math.min(targetCount, accumulatedDataLength))
      } catch (error) {
        // Failed to restore data - silent fail
      } finally {
        setIsRestoring(false)
        setRestoreProgress(0)
      }
    }

    // URLのshowパラメータまたは保存された状態から復元が必要か判断
    const targetCount = initialDisplayCount
    if (targetCount > 100 && rankingData.length < targetCount && !isRestoring) {
      restoreToPosition(targetCount)
    }
  }, [initialDisplayCount, rankingData.length, hasMore, config, currentPage, isRestoring])
  */

  // 設定が変更されたときにlocalStorageに保存
  useEffect(() => {
    try {
      localStorage.setItem('ranking-config', JSON.stringify(config))
    } catch (error) {
      // Storage quota exceeded - gracefully degrade
      console.warn('Could not save ranking config to localStorage:', error)
    }
  }, [config])
  
  // 外部サイトから戻った時の状態復元（削除）
  /*
  useEffect(() => {
    const storageKey = `ranking-state-${config.genre}-${config.period}-${config.tag || 'none'}`
    const savedState = localStorage.getItem(storageKey)
    
    if (savedState) {
      try {
        const state = JSON.parse(savedState)
        const now = Date.now()
        
        // 1時間以内のデータのみ復元
        if (state.timestamp && now - state.timestamp < 60 * 60 * 1000) {
          // 保存されたデータを復元
          if (state.items && Array.isArray(state.items) && state.items.length > 0) {
            setRankingData(state.items)
            setDisplayCount(state.displayCount || state.items.length)
            setCurrentPage(state.currentPage || Math.ceil(state.items.length / 100))
            setHasMore(state.hasMore ?? true)
            
            // スクロール位置の復元
            if (state.scrollPosition && state.scrollPosition > 0) {
              scrollPositionRef.current = state.scrollPosition
              setShouldRestoreScroll(true)
            }
          }
        } else {
          // 古いデータは削除
          localStorage.removeItem(storageKey)
        }
      } catch (error) {
        // Failed to restore state - silent fail
        localStorage.removeItem(storageKey)
      }
    }
  }, [config.genre, config.period, config.tag])
  */
  
  // initialDataが変更されたときに状態をリセット
  // ただし、localStorage/sessionStorageから復元したデータがある場合はスキップ
  useEffect(() => {
    // 復元されたデータがある場合は、initialDataの変更を無視
    const storageKey = `ranking-state-${initialGenre}-${initialPeriod}-${initialTag || 'none'}`
    const hasRestoredData = sessionStorage.getItem(storageKey) || localStorage.getItem(storageKey)
    
    if (!hasRestoredData) {
      // URLからの初期表示件数を保持する
      setDisplayCount(Math.min(Math.max(100, initialDisplayCount), Math.min(1000, initialData.length)))
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
  }, [initialData, config.tag, initialGenre, initialPeriod, initialTag, initialDisplayCount])

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
      // 累積数もリセット
      setTotalDisplayedCount(0)
      setCumulativeFilteredCount(0)
      
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
          // 配列形式の場合、人気タグは別のuseEffectで動的に取得される
          // 初期データのフィルタ数を計算
          const filtered = filterItems(data)
          const filteredCount = data.length - filtered.length
          setCumulativeFilteredCount(filteredCount)
          setTotalDisplayedCount(filtered.length)
        } else if (data && typeof data === 'object' && 'items' in data) {
          setRankingData(data.items)
          // 初期データのフィルタ数を計算
          const filtered = filterItems(data.items)
          const filteredCount = data.items.length - filtered.length
          setCumulativeFilteredCount(filteredCount)
          setTotalDisplayedCount(filtered.length)
          // APIレスポンスに人気タグが含まれている場合は更新
          // 空配列の場合は更新せず、現在の人気タグを維持
          if ('popularTags' in data && Array.isArray(data.popularTags) && data.popularTags.length > 0) {
            setCurrentPopularTags(data.popularTags)
            // キャッシュに保存（5分間有効）
            const cacheKey = `${config.genre}-${config.period}`
            popularTagsCacheRef.current.set(cacheKey, {
              tags: data.popularTags,
              timestamp: Date.now()
            })
          } else {
            // APIレスポンスに人気タグがない、または空の場合はキャッシュから復元を試みる
            const cacheKey = `${config.genre}-${config.period}`
            const cached = popularTagsCacheRef.current.get(cacheKey)
            if (cached && Date.now() - cached.timestamp < 5 * 60 * 1000) { // 5分以内
              setCurrentPopularTags(cached.tags)
            }
          }
          // 人気タグがAPIレスポンスに含まれていない、または空配列の場合は、
          // 別のuseEffectで動的に取得される
        } else {
          setRankingData([])
          // エラー時でも人気タグの動的取得は別のuseEffectで行われる
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

  // 初期データのフィルタ数を計算して累積数を初期化
  useEffect(() => {
    const filteredInitial = filterItems(initialData)
    const filteredCount = initialData.length - filteredInitial.length
    setCumulativeFilteredCount(filteredCount)
    setTotalDisplayedCount(filteredInitial.length)
  }, [initialData, filterItems]) // 初期データまたはフィルタ関数が変わったとき

  // ジャンルやperiod変更時に人気タグを動的に更新
  useEffect(() => {
    // 初回レンダリング時でpropsに人気タグがある場合はそれを使用
    const isInitialRender = config.genre === initialGenre && config.period === initialPeriod
    if (isInitialRender && popularTags.length > 0) {
      setCurrentPopularTags(popularTags)
      // 初期タグもキャッシュに保存
      const cacheKey = `${config.genre}-${config.period}`
      popularTagsCacheRef.current.set(cacheKey, {
        tags: popularTags,
        timestamp: Date.now()
      })
      return
    }
    
    // メインのfetchRankingで人気タグが取得されなかった場合のみ、
    // 別途APIから取得を試みる
    async function updatePopularTags() {
      // まずキャッシュをチェック
      const cacheKey = `${config.genre}-${config.period}`
      const cached = popularTagsCacheRef.current.get(cacheKey)
      if (cached && Date.now() - cached.timestamp < 5 * 60 * 1000) { // 5分以内
        setCurrentPopularTags(cached.tags)
        return
      }
      
      // 前回のリクエストをキャンセル
      if (popularTagsAbortRef.current) {
        popularTagsAbortRef.current.abort()
      }
      
      // 新しいAbortControllerを作成
      const controller = new AbortController()
      popularTagsAbortRef.current = controller
      
      try {
        // APIから人気タグを取得（クライアントサイドではKVに直接アクセスできないため）
        const params = new URLSearchParams({
          genre: config.genre,
          period: config.period
        })
        
        const response = await fetch(`/api/ranking?${params}`, {
          signal: controller.signal
        })
        
        if (response.ok) {
          const data = await response.json()
          
          // APIレスポンスに人気タグが含まれている場合は更新
          if (data && typeof data === 'object' && 'popularTags' in data && Array.isArray(data.popularTags)) {
            if (data.popularTags.length > 0) {
              setCurrentPopularTags(data.popularTags)
              // キャッシュに保存
              const cacheKey = `${config.genre}-${config.period}`
              popularTagsCacheRef.current.set(cacheKey, {
                tags: data.popularTags,
                timestamp: Date.now()
              })
            }
            return
          }
        }
        
        // 取得できなかった場合は現在の人気タグを維持（空配列にしない）
        // これにより、一時的な取得失敗で人気タグが消えることを防ぐ
      } catch (error: any) {
        // AbortErrorは無視
        if (error.name !== 'AbortError') {
          // エラー時も現在の人気タグを維持（空配列にしない）
          // Failed to update popular tags - error is handled by maintaining current tags
        }
      }
    }
    
    // ジャンルまたはperiodが変更された場合は必ず更新
    // 初回レンダリング時でもpropsに人気タグがない場合は取得を試みる
    // ただし、メインのfetchRankingが実行中の場合は少し遅延させる
    if (config.genre !== initialGenre || 
        config.period !== initialPeriod || 
        (isInitialRender && popularTags.length === 0)) {
      // メインのfetchRankingの結果を待つため、少し遅延を入れる
      const timeoutId = setTimeout(() => {
        // currentPopularTagsが空配列の場合のみ更新を試みる
        if (currentPopularTags.length === 0) {
          updatePopularTags()
        }
      }, 500)
      
      return () => {
        clearTimeout(timeoutId)
        // クリーンアップ時にリクエストをキャンセル
        if (popularTagsAbortRef.current) {
          popularTagsAbortRef.current.abort()
        }
      }
    }
  }, [config.genre, config.period, initialGenre, initialPeriod, popularTags, currentPopularTags])

  // 動画クリック時にスクロール位置を保存
  const saveScrollPosition = useCallback(() => {
    const storageKey = `ranking-scroll-${config.genre}-${config.period}-${config.tag || 'none'}`
    sessionStorage.setItem(storageKey, String(window.scrollY))
  }, [config])

  // スクロール時の状態保存は削除（動画クリック時のみ保存するため）

  // ページ離脱時やリンククリック時に状態を保存
  useEffect(() => {
    // scrollRestorationはデフォルトのautoのままにする
    // 必要な時だけ一時的にmanualに設定する
    
    const handleBeforeUnload = () => {
      // ページ離脱時は何もしない（スクロール位置は保存しない）
    }
    
    const handleSaveRankingState = () => {
      // 動画クリック時のみスクロール位置を保存
      saveScrollPosition()
    }
    
    // ブラウザの戻るボタン検知
    const handlePopState = () => {
      // ニコニコ動画からの戻りでない場合は何もしない
      const isFromNiconico = document.referrer && 
        (document.referrer.includes('nicovideo.jp') || document.referrer.includes('niconico.jp'))
      
      if (!isFromNiconico) {
        return
      }
      
      // ニコニコ動画から戻った場合のみ、保存されたスクロール位置を復元
      const storageKey = `ranking-scroll-${config.genre}-${config.period}-${config.tag || 'none'}`
      const savedScrollPosition = sessionStorage.getItem(storageKey)
      
      if (savedScrollPosition) {
        const scrollPosition = parseInt(savedScrollPosition, 10)
        // スクロール位置を復元
        requestAnimationFrame(() => {
          window.scrollTo(0, scrollPosition)
          sessionStorage.removeItem(storageKey)
        })
      }
      
      /*
      // 以下の自動復元処理は削除
      const params = new URLSearchParams(window.location.search)
      const showCount = parseInt(params.get('show') || '100', 10)
      
      // URLパラメータに基づいて表示件数を調整する必要がある場合のみ処理
      if (showCount > 100 && showCount !== displayCount) {
        // requestAnimationFrameで非同期化して、スクロールロックを防ぐ
        requestAnimationFrame(() => {
          // URLのshowパラメータが変更された場合、その位置まで復元
          const targetCount = Math.min(Math.max(100, showCount), 500)
          if (targetCount > rankingData.length && !isRestoring) {
            // データが不足している場合は自動復元
            const restoreToPosition = async (target: number) => {
              // 復元中でもスクロールを妨げないように
              setIsRestoring(true)
              setRestoreProgress(0)

              try {
                const currentDataLength = rankingData.length
                const neededPages = Math.ceil((target - currentDataLength) / 100)
                
                for (let i = 0; i < neededPages; i++) {
                  if (!hasMore) break

                  let pageNumber: number
                  if (config.tag) {
                    pageNumber = currentPage + i + 1
                  } else {
                    pageNumber = Math.floor((currentDataLength + i * 100) / 100) + 1
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
                  
                  let items: RankingItem[]
                  let hasMoreData: boolean
                  
                  if (data.items && Array.isArray(data.items)) {
                    items = data.items
                    hasMoreData = data.hasMore ?? false
                  } else if (Array.isArray(data)) {
                    items = data
                    hasMoreData = data.length === 100
                  } else {
                    break
                  }

                  if (items.length > 0) {
                    setRankingData(prev => {
                      const newData = [...prev, ...items]
                      // 500件に達したらhasMoreをfalseに
                      if (newData.length >= 500) {
                        setHasMore(false)
                      } else {
                        setHasMore(hasMoreData)
                      }
                      return newData
                    })
                    if (config.tag) {
                      setCurrentPage(pageNumber)
                    }
                  }

                  const progress = Math.min(100, ((i + 1) / neededPages) * 100)
                  setRestoreProgress(progress)
                }

                // データの実際の長さを追跡
                setRankingData(prev => {
                  setDisplayCount(Math.min(target, prev.length))
                  return prev
                })
              } catch (error) {
                // Failed to restore data - silent fail
                // エラー時も確実にリセット
                setIsRestoring(false)
                setRestoreProgress(0)
              } finally {
                setIsRestoring(false)
                setRestoreProgress(0)
              }
            }
            
            // 非同期で実行（メインスレッドをブロックしない）
            // スクロール復元の前だけ一時的にmanualに設定
            if ('scrollRestoration' in window.history) {
              window.history.scrollRestoration = 'manual'
            }
            
            restoreToPosition(targetCount)
              .catch(err => {
                // Restore failed - silent fail
                setIsRestoring(false)
                setRestoreProgress(0)
              })
              .finally(() => {
                // 復元処理が完了したらautoに戻す
                if ('scrollRestoration' in window.history) {
                  window.history.scrollRestoration = 'auto'
                }
              })
          } else {
            // データが十分ある場合は表示件数を更新するだけ
            setDisplayCount(Math.min(targetCount, rankingData.length))
          }
        })
      } else if (showCount === 100 && displayCount > 100) {
        // URLにshowパラメータがない場合（通常のページ遷移）、100件表示に戻す
        setDisplayCount(100)
      }
      */
    }
    
    window.addEventListener('beforeunload', handleBeforeUnload)
    window.addEventListener('saveRankingState', handleSaveRankingState)
    window.addEventListener('popstate', handlePopState)
    
    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload)
      window.removeEventListener('saveRankingState', handleSaveRankingState)
      window.removeEventListener('popstate', handlePopState)
      
      // クリーンアップ時にも念のためautoに戻す
      if ('scrollRestoration' in window.history) {
        window.history.scrollRestoration = 'auto'
      }
    }
  }, [saveScrollPosition, config])

  // ランキングの追加読み込み（タグ別、ジャンル別共通）
  const MAX_RANKING_ITEMS = 1000 // すべてのランキングで1000件まで
  
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
        // ジャンル別: データ長から計算（500件まではキャッシュ、501件目からpage=6）
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
        // FIX: 重複を防ぐため、既存のIDセットを作成
        const existingIds = new Set(rankingData.map(item => item.id))
        
        // 重複していない新しいアイテムのみを追加
        const newItems = items.filter(item => !existingIds.has(item.id))
        
        if (newItems.length > 0) {
          // 新しいデータを追加してソート
          const combinedData = [...rankingData, ...newItems]
          const sortedData = combinedData.sort((a, b) => a.rank - b.rank)
          setRankingData(sortedData)
          
          // currentPageはタグ別の場合のみ更新
          if (config.tag) {
            setCurrentPage(currentPage + 1)
          }
          
          // 最大件数チェック
          if (sortedData.length >= MAX_RANKING_ITEMS) {
            setHasMore(false)
          } else {
            setHasMore(hasMoreData)
          }
          
          // 新しく追加されたデータも表示するようdisplayCountを更新
          // シンプルに100件増やす（NGフィルタは表示時に適用されるので考慮不要）
          const newDisplayCount = Math.min(displayCount + 100, sortedData.length, MAX_RANKING_ITEMS)
          setDisplayCount(newDisplayCount)
          
          // 新しいページのフィルタ数を計算して累積数を更新
          const filteredNewItems = filterItems(newItems)
          const newFilteredCount = newItems.length - filteredNewItems.length
          setCumulativeFilteredCount(prev => prev + newFilteredCount)
          setTotalDisplayedCount(prev => prev + filteredNewItems.length)
          
          // URLを更新
          updateURL(newDisplayCount)
        } else {
          // すべて重複していた場合は、それ以上データがない
          setHasMore(false)
        }
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
  
  // フィルタリング後の順位調整
  // ユーザーのカスタムNGフィルタ適用後の順位処理
  const rerankedItems = React.useMemo(() => {
    // 元のランク番号でソート（これは正しい順序を保持するために重要）
    const sorted = [...filteredItems].sort((a, b) => a.rank - b.rank)
    
    // 現在のページに表示されているアイテムの開始順位を計算
    // displayCountから逆算して、現在表示中のデータの開始位置を特定
    const currentPageStartIndex = Math.max(0, displayCount - 100)
    const itemsBeforeCurrentPage = sorted.slice(0, currentPageStartIndex)
    const currentPageItems = sorted.slice(currentPageStartIndex)
    
    // 現在のページより前に表示されたアイテム数を計算
    const previousPagesDisplayedCount = itemsBeforeCurrentPage.length
    
    // 元の順位を保持しつつ、表示用の連続順位も提供
    return sorted.map((item, index) => ({
      ...item,
      // 元の rank を originalRank として保存
      originalRank: item.rank,
      // 表示用の連続順位（累積表示数を考慮）
      rank: index + 1
    }))
  }, [filteredItems, displayCount])
  
  // 表示アイテムの計算もメモ化
  const displayItems = React.useMemo(() => 
    rerankedItems.slice(0, displayCount),
    [rerankedItems, displayCount]
  )

  return (
    <>
      <RankingSelector config={config} onConfigChange={setConfig} />
      <TagSelector config={config} onConfigChange={setConfig} popularTags={currentPopularTags} />
      
      {/* 復元中のプログレスバー */}
      {isRestoring && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          zIndex: 1000,
          background: 'var(--surface-color)',
          borderBottom: '1px solid var(--border-color)',
          padding: '16px',
          boxShadow: 'var(--shadow-md)'
        }}>
          <div style={{
            maxWidth: '600px',
            margin: '0 auto',
            textAlign: 'center'
          }}>
            <div style={{
              fontSize: '14px',
              color: 'var(--text-primary)',
              marginBottom: '8px'
            }}>
              前回の表示位置を復元中...
            </div>
            <div style={{
              width: '100%',
              height: '4px',
              background: 'var(--border-color)',
              borderRadius: '2px',
              overflow: 'hidden'
            }}>
              <div style={{
                width: `${restoreProgress}%`,
                height: '100%',
                background: 'var(--primary-color)',
                transition: 'width 0.3s ease'
              }} />
            </div>
          </div>
        </div>
      )}
      
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
          {(displayCount < rerankedItems.length || hasMore) && displayCount < MAX_RANKING_ITEMS && (
            <div style={{ textAlign: 'center', padding: '40px' }}>
              <button
                onClick={() => {
                  if (displayCount < rerankedItems.length) {
                    // 既存データから追加表示（ジャンル別ランキングの1-500位）
                    const newDisplayCount = Math.min(displayCount + 100, rerankedItems.length, MAX_RANKING_ITEMS)
                    setDisplayCount(newDisplayCount)
                    updateURL(newDisplayCount)
                    // 状態保存は削除（スクロール位置は動画クリック時のみ保存）
                  } else if (hasMore) {
                    // 新規データを読み込み（タグ別 or ジャンル別501位以降）
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