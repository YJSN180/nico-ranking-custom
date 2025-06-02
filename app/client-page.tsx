'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
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
  const [hasMore, setHasMore] = useState(true) // さらに読み込めるか
  const [loadingMore, setLoadingMore] = useState(false) // 追加読み込み中か
  
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
          setHasMore(state.hasMore !== false)
          
          // スクロール位置を復元
          setTimeout(() => {
            window.scrollTo(0, state.scrollPosition || 0)
          }, 100)
        }
      } catch (e) {
        // エラーは無視
      }
    }
  }, [initialGenre, initialPeriod, initialTag])
  
  // initialDataが変更されたときに状態をリセット
  useEffect(() => {
    setDisplayCount(100)
    setRankingData(initialData)
    setCurrentPage(1)
    setHasMore(true)
  }, [initialData])

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
    }
  }, [config, previousGenre, updatePreferences])

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

  // タグ別ランキングの追加読み込み
  const loadMoreItems = async () => {
    if (!config.tag || loadingMore || !hasMore) return
    
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
        setRankingData([...rankingData, ...adjustedData])
        setCurrentPage(currentPage + 1)
        setHasMore(data.length === 100) // 100件未満なら次はない
      } else {
        setHasMore(false)
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : '追加読み込みに失敗しました')
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
          
          {/* もっと見るボタン */}
          {displayCount < filteredItems.length && (
            <div style={{ textAlign: 'center', padding: '40px' }}>
              <button
                onClick={() => {
                  setDisplayCount(prev => Math.min(prev + 100, filteredItems.length))
                  saveStateToStorage()
                }}
                style={{
                  padding: '12px 32px',
                  fontSize: '16px',
                  background: '#667eea',
                  color: 'white',
                  border: 'none',
                  borderRadius: '8px',
                  cursor: 'pointer',
                  fontWeight: 'bold'
                }}
              >
                もっと見る（{displayCount} / {filteredItems.length}件）
              </button>
            </div>
          )}
          
          {/* タグ別ランキングの場合の追加読み込みボタン */}
          {config.tag && displayCount >= filteredItems.length && hasMore && (
            <div style={{ textAlign: 'center', padding: '40px' }}>
              <button
                onClick={loadMoreItems}
                disabled={loadingMore}
                style={{
                  padding: '12px 32px',
                  fontSize: '16px',
                  background: loadingMore ? '#ccc' : '#667eea',
                  color: '#fff',
                  border: 'none',
                  borderRadius: '8px',
                  cursor: loadingMore ? 'not-allowed' : 'pointer',
                  fontWeight: 'bold'
                }}
              >
                {loadingMore ? '読み込み中...' : 'さらに読み込む'}
              </button>
            </div>
          )}
        </>
      )}
    </>
  )
}