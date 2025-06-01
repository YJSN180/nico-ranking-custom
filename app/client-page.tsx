'use client'

import { useState, useEffect, useRef } from 'react'
import { RankingSelector } from '@/components/ranking-selector'
import { TagSelector } from '@/components/tag-selector'
import RankingItemComponent from '@/components/ranking-item'
import { useRealtimeStats } from '@/hooks/use-realtime-stats'
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
  popularTags = [],
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
  
  // リアルタイム統計更新を使用（1分ごとに自動更新）
  const { items: realtimeItems, isLoading: isUpdating, lastUpdated } = useRealtimeStats(
    rankingData,
    true, // 常に有効
    60000 // 1分ごと
  )

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
    }
  }, [config, previousGenre])

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
          
          <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
            {realtimeItems.map((item) => (
              <RankingItemComponent key={item.id} item={item} />
            ))}
          </ul>
        </>
      )}
    </>
  )
}