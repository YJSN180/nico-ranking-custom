'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { RankingSelector } from '@/components/ranking-selector'
import { TagSelector } from '@/components/tag-selector'
import RankingItemComponent from '@/components/ranking-item'
import { useRealtimeStats } from '@/hooks/use-realtime-stats'
import { useUserPreferences } from '@/hooks/use-user-preferences'
import { useUserNGList } from '@/hooks/use-user-ng-list'
import type { RankingData } from '@/types/ranking'
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
  const [displayCount, setDisplayCount] = useState(100)
  const [currentPage, setCurrentPage] = useState(1)
  // タグ別ランキングの場合、初期データが100件未満ならhasMoreをfalseに初期化
  const [hasMore, setHasMore] = useState(() => {
    if (initialTag && initialData.length < 100) {
      return false
    }
    return true
  })
  const [loadingMore, setLoadingMore] = useState(false)
  
  // スクロール復元用のフラグ
  const [shouldRestoreScroll, setShouldRestoreScroll] = useState(false)
  const scrollPositionRef = useRef<number>(0)
  
  // ユーザー設定の永続化
  const { updatePreferences } = useUserPreferences()
  
  // カスタムNGリスト
  const { filterItems } = useUserNGList()
  
  // リアルタイム統計更新を使用（1分ごとに自動更新）
  const { items: realtimeItems, isLoading: isUpdating, lastUpdated } = useRealtimeStats(
    rankingData,
    true, // 常に有効
    60000 // 1分ごと
  )
  
  // sessionStorageから状態を復元
  useEffect(() => {
    const storageKey = `ranking-state-${initialGenre}-${initialPeriod}-${initialTag || 'none'}`
    const savedState = sessionStorage.getItem(storageKey)
    
    if (savedState) {
      try {
        const state = JSON.parse(savedState)
        // 保存されたデータがある場合は復元
        if (state.items && state.items.length > 0) {
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
      } catch (e) {
        // エラーは無視
      }
    }
  }, [initialGenre, initialPeriod, initialTag])
  
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
  useEffect(() => {
    // sessionStorageから復元した場合はリセットしない
    if (!shouldRestoreScroll) {
      setDisplayCount(100)
      setRankingData(initialData)
      setCurrentPage(1)
      // タグ別ランキングの場合、初期データが100件ちょうどならhasMore=true、それ以外はfalse
      if (config.tag) {
        setHasMore(initialData.length === 100)
      } else {
        // 通常のランキングは、初期データが100件以上ある場合のみhasMore=true
        setHasMore(initialData.length > 100)
      }
    }
  }, [initialData, config.tag, shouldRestoreScroll])

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
      setLoading(true)
      setError(null)
      setDisplayCount(100) // 新しいデータ取得時は100件にリセット
      setCurrentPage(1) // ページ番号をリセット
      setHasMore(true) // 追加読み込み可能状態にリセット
      setShouldRestoreScroll(false) // 新しいデータ取得時はスクロール復元しない
      
      try {
        const params = new URLSearchParams({
          period: config.period,
          genre: config.genre
        })
        
        if (config.tag) {
          params.append('tag', config.tag)
        }
        
        const response = await fetch(`/api/ranking?${params}`)
        
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
      } catch (err) {
        setError(err instanceof Error ? err.message : 'エラーが発生しました')
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
  }, [config, previousGenre, updatePreferences, router])

  // sessionStorageに状態を保存
  const saveStateToStorage = useCallback(() => {
    const storageKey = `ranking-state-${config.genre}-${config.period}-${config.tag || 'none'}`
    const state = {
      items: rankingData,
      displayCount,
      currentPage,
      hasMore,
      scrollPosition: window.scrollY,
      timestamp: Date.now()
    }
    sessionStorage.setItem(storageKey, JSON.stringify(state))
  }, [config, rankingData, displayCount, currentPage, hasMore])

  // スクロール時に状態を保存（デバウンス付き）
  useEffect(() => {
    let timeoutId: NodeJS.Timeout
    const handleScroll = () => {
      clearTimeout(timeoutId)
      timeoutId = setTimeout(saveStateToStorage, 300)
    }
    
    window.addEventListener('scroll', handleScroll)
    return () => {
      window.removeEventListener('scroll', handleScroll)
      clearTimeout(timeoutId)
    }
  }, [saveStateToStorage])

  // ページ離脱時にも状態を保存
  useEffect(() => {
    const handleBeforeUnload = () => {
      saveStateToStorage()
    }
    
    window.addEventListener('beforeunload', handleBeforeUnload)
    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload)
    }
  }, [saveStateToStorage])

  // タグ別ランキングの追加読み込み
  const MAX_TAG_RANKING_ITEMS = 500 // 安全のため500件まで
  
  const loadMoreItems = async () => {
    if (!config.tag || loadingMore || !hasMore) return
    
    // 最大件数チェック
    if (rankingData.length >= MAX_TAG_RANKING_ITEMS) {
      setHasMore(false)
      return
    }
    
    setLoadingMore(true)
    try {
      const params = new URLSearchParams({
        genre: config.genre,
        period: config.period,
        tag: config.tag,
        page: (currentPage + 1).toString()
      })
      
      const response = await fetch(`/api/ranking?${params.toString()}`)
      if (!response.ok) throw new Error('Failed to fetch')
      
      const data = await response.json()
      
      if (Array.isArray(data) && data.length > 0) {
        // ランク番号を調整
        const adjustedData = data.map((item, index) => ({
          ...item,
          rank: currentPage * 100 + index + 1
        }))
        const newRankingData = [...rankingData, ...adjustedData]
        setRankingData(newRankingData)
        setCurrentPage(currentPage + 1)
        setHasMore(data.length === 100) // 100件未満なら次はない
        // 新しく追加されたデータも表示するようdisplayCountを更新
        // 現在の表示件数 + 新しく追加された件数
        setDisplayCount(prev => prev + adjustedData.length)
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
  const displayItems = filteredItems.slice(0, displayCount)

  return (
    <>
      <RankingSelector config={config} onConfigChange={setConfig} />
      <TagSelector config={config} onConfigChange={setConfig} popularTags={currentPopularTags} />
      
      {loading && (
        <div style={{ textAlign: 'center', padding: '40px' }}>
          <div style={{ fontSize: '16px', color: '#666' }}>読み込み中...</div>
        </div>
      )}
      
      {error && (
        <div style={{ 
          background: '#fee', 
          border: '1px solid #fcc',
          borderRadius: '8px',
          padding: '16px',
          marginBottom: '16px',
          color: '#c00'
        }}>
          {error}
        </div>
      )}
      
      {!loading && !error && rankingData.length === 0 && (
        <div style={{ textAlign: 'center', padding: '40px' }}>
          <div style={{ fontSize: '16px', color: '#666' }}>
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
              color: '#666',
              visibility: isUpdating ? 'visible' : 'hidden'
            }}>
              統計情報を更新中...
            </div>
            
            {lastUpdated && (
              <div style={{ 
                fontSize: '11px',
                color: '#999'
              }}>
                最終更新: {new Date(lastUpdated).toLocaleTimeString('ja-JP')}
              </div>
            )}
          </div>
          
          {/* 通常のリスト表示 */}
          <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
            {displayItems.map((item) => (
              <RankingItemComponent key={item.id} item={item} />
            ))}
          </ul>
          
          {/* もっと見るボタン（既存データの表示または新規データの読み込み） */}
          {(displayCount < filteredItems.length || (config.tag && hasMore)) && (
            <div style={{ textAlign: 'center', padding: '40px' }}>
              <button
                onClick={() => {
                  if (displayCount < filteredItems.length) {
                    // 既存データから追加表示
                    setDisplayCount(prev => Math.min(prev + 100, filteredItems.length))
                    saveStateToStorage()
                  } else if (config.tag && hasMore) {
                    // タグ別ランキングで新規データを読み込み
                    loadMoreItems()
                  }
                }}
                disabled={loadingMore}
                style={{
                  padding: '12px 32px',
                  fontSize: '16px',
                  background: loadingMore ? '#ccc' : '#667eea',
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