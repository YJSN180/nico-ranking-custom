'use client'

import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react'
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

// 表示件数の定数
const DISPLAY_LIMITS = {
  TAG: 300,      // タグ別ランキングは全300件表示
  GENRE: 500,    // ジャンル別ランキングは500件表示
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
  
  // 設定の管理
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
  const [currentPopularTags, setCurrentPopularTags] = useState<string[]>(() => {
    // 人気タグをlocalStorageから復元（ブラウザバック対応）
    const storageKey = `popular-tags-${config.genre}-${config.period}`
    const cached = localStorage.getItem(storageKey)
    if (cached) {
      try {
        const parsed = JSON.parse(cached)
        if (Array.isArray(parsed) && parsed.length > 0) {
          return parsed
        }
      } catch {
        // パースエラーは無視
      }
    }
    return popularTags
  })
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  
  // 人気タグのキャッシュ保存用
  const savePopularTagsToCache = useCallback((tags: string[], genre: string, period: string) => {
    if (tags && tags.length > 0) {
      const storageKey = `popular-tags-${genre}-${period}`
      localStorage.setItem(storageKey, JSON.stringify(tags))
    }
  }, [])
  
  // ユーザー設定の永続化
  const { updatePreferences } = useUserPreferences()
  
  // カスタムNGリスト
  const { filterItems } = useUserNGList()
  
  // モバイル検出
  const isMobile = useMobileDetect()
  
  // 初期表示時に人気タグがない場合は動的に取得
  useEffect(() => {
    if (!config.tag && config.genre !== 'all' && currentPopularTags.length === 0) {
      getPopularTags(config.genre as any, config.period as '24h' | 'hour')
        .then(tags => {
          if (tags && tags.length > 0) {
            setCurrentPopularTags(tags)
            savePopularTagsToCache(tags, config.genre, config.period)
          }
        })
        .catch(() => {
          // エラー時は何もしない
        })
    }
  }, []) // 初回のみ実行
  
  // リアルタイム統計更新を使用（3分ごとに自動更新）
  const REALTIME_UPDATE_INTERVAL = 3 * 60 * 1000 // 3分
  const { items: realtimeItems, isLoading: isUpdating, lastUpdated } = useRealtimeStats(
    rankingData,
    true,
    REALTIME_UPDATE_INTERVAL
  )
  
  // スクロール位置の保存（動画ページ遷移時）
  const saveScrollPosition = useCallback(() => {
    const storageKey = `ranking-scroll-${config.genre}-${config.period}-${config.tag || 'none'}`
    const scrollPosition = window.pageYOffset || document.documentElement.scrollTop
    sessionStorage.setItem(storageKey, scrollPosition.toString())
  }, [config])
  
  // リンククリックイベントのハンドリング
  useEffect(() => {
    const handleLinkClick = (e: MouseEvent) => {
      const target = e.target as HTMLElement
      const link = target.closest('a')
      
      // ニコニコ動画へのリンクの場合のみスクロール位置を保存
      if (link && (link.href.includes('nicovideo.jp') || link.href.includes('niconico.jp'))) {
        saveScrollPosition()
      }
    }
    
    document.addEventListener('click', handleLinkClick)
    return () => document.removeEventListener('click', handleLinkClick)
  }, [saveScrollPosition])
  
  // スクロール位置の復元
  useEffect(() => {
    const isFromNiconico = document.referrer && 
      (document.referrer.includes('nicovideo.jp') || document.referrer.includes('niconico.jp'))
    
    if (isFromNiconico) {
      const storageKey = `ranking-scroll-${initialGenre}-${initialPeriod}-${initialTag || 'none'}`
      const savedScrollPosition = sessionStorage.getItem(storageKey)
      
      if (savedScrollPosition) {
        const scrollPosition = parseInt(savedScrollPosition, 10)
        requestAnimationFrame(() => {
          window.scrollTo(0, scrollPosition)
        })
        sessionStorage.removeItem(storageKey)
      }
    }
  }, [initialGenre, initialPeriod, initialTag])
  
  // 設定変更時の処理
  const handleConfigChange = useCallback(async (newConfig: RankingConfig) => {
    // 変更がない場合は何もしない
    if (
      newConfig.genre === config.genre &&
      newConfig.period === config.period &&
      newConfig.tag === config.tag
    ) {
      return
    }
    
    setConfig(newConfig)
    setLoading(true)
    setError(null)
    
    // ローカルストレージに保存
    localStorage.setItem('ranking-config', JSON.stringify(newConfig))
    
    // URLを更新
    const params = new URLSearchParams()
    if (newConfig.genre !== 'all') params.set('genre', newConfig.genre)
    if (newConfig.period !== '24h') params.set('period', newConfig.period)
    if (newConfig.tag) params.set('tag', newConfig.tag)
    
    router.push(params.toString() ? `?${params.toString()}` : '/', { scroll: false })
    
    // ユーザー設定を更新
    updatePreferences({
      lastGenre: newConfig.genre,
      lastPeriod: newConfig.period,
    })
    
    try {
      const apiParams = new URLSearchParams({
        genre: newConfig.genre,
        period: newConfig.period,
      })
      if (newConfig.tag) {
        apiParams.append('tag', newConfig.tag)
      }
      
      const response = await fetch(`/api/ranking?${apiParams.toString()}`)
      if (!response.ok) throw new Error('Failed to fetch data')
      
      const data = await response.json()
      
      if (data.items && Array.isArray(data.items)) {
        setRankingData(data.items)
        
        // 人気タグの処理
        if (!newConfig.tag && newConfig.genre !== 'all') {
          if (data.popularTags && data.popularTags.length > 0) {
            // APIから人気タグが返ってきた場合
            setCurrentPopularTags(data.popularTags)
            savePopularTagsToCache(data.popularTags, newConfig.genre, newConfig.period)
          } else {
            // APIから人気タグが返ってこなかった場合、動的に取得
            try {
              const tags = await getPopularTags(newConfig.genre as any, newConfig.period as '24h' | 'hour')
              if (tags && tags.length > 0) {
                setCurrentPopularTags(tags)
                savePopularTagsToCache(tags, newConfig.genre, newConfig.period)
              }
            } catch {
              // エラー時はキャッシュから取得を試みる
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
        } else {
          // タグ指定時またはallジャンルの場合は空配列
          setCurrentPopularTags([])
        }
      } else if (Array.isArray(data)) {
        setRankingData(data)
        // 配列形式のレスポンスの場合も人気タグを動的に取得
        if (!newConfig.tag && newConfig.genre !== 'all') {
          try {
            const tags = await getPopularTags(newConfig.genre as any, newConfig.period as '24h' | 'hour')
            if (tags && tags.length > 0) {
              setCurrentPopularTags(tags)
              savePopularTagsToCache(tags, newConfig.genre, newConfig.period)
            }
          } catch {
            // エラー時は現在の値を維持
          }
        }
      } else {
        setRankingData([])
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'データの取得に失敗しました')
      setRankingData([])
    } finally {
      setLoading(false)
    }
  }, [config, router, updatePreferences, savePopularTagsToCache])
  
  // フィルタリングと順位再割り当て
  const displayItems = useMemo(() => {
    // まずrank順にソート（重要！）
    const sorted = [...realtimeItems].sort((a, b) => a.rank - b.rank)
    
    // NGフィルタを適用
    const filtered = filterItems(sorted)
    
    // 順位を再割り当て（連続番号）
    const reranked = filtered.map((item, index) => ({
      ...item,
      originalRank: item.rank,
      rank: index + 1
    }))
    
    // 表示件数を制限
    const limit = config.tag ? DISPLAY_LIMITS.TAG : DISPLAY_LIMITS.GENRE
    return reranked.slice(0, limit)
  }, [realtimeItems, filterItems, config.tag])
  
  // レンダリング
  return (
    <>
      <RankingSelector config={config} onConfigChange={handleConfigChange} />
      <TagSelector 
        config={config} 
        onConfigChange={handleConfigChange} 
        popularTags={currentPopularTags} 
      />
      
      {loading && (
        <div style={{ textAlign: 'center', padding: '40px' }}>
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
      
      {!loading && !error && displayItems.length === 0 && (
        <div style={{ textAlign: 'center', padding: '40px' }}>
          <div style={{ 
            fontSize: '16px', 
            color: 'var(--text-secondary)'
          }}>
            ランキングデータがありません
          </div>
        </div>
      )}
      
      {!loading && !error && displayItems.length > 0 && (
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
          
          {/* 表示件数情報 */}
          <div style={{
            padding: '8px 16px',
            fontSize: '14px',
            color: 'var(--text-secondary)',
            textAlign: 'right'
          }}>
            {displayItems.length}件表示中
            {config.tag && ` (タグ別ランキング: 最大${DISPLAY_LIMITS.TAG}件)`}
            {!config.tag && ` (ジャンル別ランキング: ${DISPLAY_LIMITS.GENRE}件表示)`}
          </div>
          
          {/* ランキングリスト */}
          <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
            {displayItems.map((item) => (
              <RankingItemComponent 
                key={item.id} 
                item={item} 
                isMobile={isMobile} 
              />
            ))}
          </ul>
        </>
      )}
    </>
  )
}