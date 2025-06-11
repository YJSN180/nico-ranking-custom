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
    if (initialTag && initialData.length < 100) {
      return false
    }
    return true
  })
  const [loadingMore, setLoadingMore] = useState(false) // 追加読み込み中か
  const [isRestoring, setIsRestoring] = useState(false) // 復元中か
  const [restoreProgress, setRestoreProgress] = useState(0) // 復元進捗（0-100）
  
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
  
  // ストレージ管理の設定
  const STORAGE_CONFIG = {
    MAX_KEYS: 5, // 最大保存キー数
    USE_SESSION_STORAGE: false, // sessionStorageを使用しない
    MAX_AGE_MS: 30 * 60 * 1000, // 30分
  }
  
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
      console.error('Storage cleanup error:', error)
    }
  }, [config])
  
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
    // performance.navigationでブラウザバックを検出
    const isBackNavigation = window.performance && 
      window.performance.navigation && 
      window.performance.navigation.type === 2;
    
    // URLのshowパラメータから表示件数を復元
    const urlDisplayCount = parseInt(searchParams.get('show') || '100', 10)
    if (urlDisplayCount > 100 && urlDisplayCount <= 500) {
      setDisplayCount(urlDisplayCount)
    }
    
    // ブラウザバックの場合のみスクロール位置を復元
    if (isBackNavigation) {
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
    }, 5 * 60 * 1000)
    
    return () => clearInterval(interval)
  }, [cleanupOldStorage])

  // ブラウザバック時などの自動復元
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
        console.error('Failed to restore data:', error)
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

  // 外部サイトから戻った時の状態復元
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
        console.error('Failed to restore state:', error)
        localStorage.removeItem(storageKey)
      }
    }
  }, [config.genre, config.period, config.tag])
  
  // initialDataが変更されたときに状態をリセット
  // ただし、localStorage/sessionStorageから復元したデータがある場合はスキップ
  useEffect(() => {
    // 復元されたデータがある場合は、initialDataの変更を無視
    const storageKey = `ranking-state-${initialGenre}-${initialPeriod}-${initialTag || 'none'}`
    const hasRestoredData = sessionStorage.getItem(storageKey) || localStorage.getItem(storageKey)
    
    if (!hasRestoredData) {
      // URLからの初期表示件数を保持する
      setDisplayCount(Math.min(Math.max(100, initialDisplayCount), Math.min(500, initialData.length)))
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
        } else if (data && typeof data === 'object' && 'items' in data) {
          setRankingData(data.items)
          // APIレスポンスに人気タグが含まれている場合のみ更新
          if (data.popularTags && data.popularTags.length > 0) {
            setCurrentPopularTags(data.popularTags)
          }
          // 人気タグが空の場合は、別のuseEffectで動的に取得される
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

  // ジャンルやperiod変更時に人気タグを動的に更新
  useEffect(() => {
    // 初回レンダリング時でpropsに人気タグがある場合はそれを使用
    const isInitialRender = config.genre === initialGenre && config.period === initialPeriod
    if (isInitialRender && popularTags.length > 0) {
      setCurrentPopularTags(popularTags)
      return
    }
    
    // ジャンルやperiodが変更された場合、または初期propsが空の場合は動的に取得
    async function updatePopularTags() {
      try {
        const tags = await getPopularTags(config.genre, config.period)
        setCurrentPopularTags(tags)
      } catch (error) {
        // エラー時は空配列を設定
        setCurrentPopularTags([])
      }
    }
    
    updatePopularTags()
  }, [config.genre, config.period, initialGenre, initialPeriod, popularTags])

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
                console.error('Failed to restore data:', error)
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
                console.error('Restore failed:', err)
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
  }, [saveScrollPosition, displayCount, rankingData.length, hasMore, config, currentPage, isRestoring])

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
        
        // 500件に達したらhasMoreをfalseに
        if (newRankingData.length >= MAX_RANKING_ITEMS) {
          setHasMore(false)
        } else {
          setHasMore(hasMoreData)
        }
        // 新しく追加されたデータも表示するようdisplayCountを更新
        // NGフィルタ適用後の実際の追加件数を計算
        const prevFilteredCount = filterItems(rankingData).length
        const newFilteredCount = filterItems(newRankingData).length
        const actualAddedCount = newFilteredCount - prevFilteredCount
        const newDisplayCount = Math.min(displayCount + actualAddedCount, MAX_RANKING_ITEMS)
        setDisplayCount(newDisplayCount)
        
        // URLを更新
        updateURL(newDisplayCount)
        
        // 状態保存は削除（スクロール位置は動画クリック時のみ保存）
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
  
  // フィルタリング後に順位を振り直す（メモ化）
  const rerankedItems = React.useMemo(() => 
    filteredItems.map((item, index) => ({
      ...item,
      rank: index + 1
    })),
    [filteredItems]
  )
  
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
                    // 既存データから追加表示（ジャンル別ランキングの1-300位）
                    const newDisplayCount = Math.min(displayCount + 100, rerankedItems.length, MAX_RANKING_ITEMS)
                    setDisplayCount(newDisplayCount)
                    updateURL(newDisplayCount)
                    // 状態保存は削除（スクロール位置は動画クリック時のみ保存）
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