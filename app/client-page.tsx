'use client'

import { useState, useEffect } from 'react'
import { RankingSelector } from '@/components/ranking-selector'
import { TagSelector } from '@/components/tag-selector'
import RankingItemComponent from '@/components/ranking-item'
import type { RankingData } from '@/types/ranking'
import type { RankingConfig, RankingGenre } from '@/types/ranking-config'

interface ClientPageProps {
  initialData: RankingData
  initialGenre?: string
  initialTag?: string
  popularTags?: string[]
}

export default function ClientPage({ initialData, initialGenre = 'all', initialTag, popularTags = [] }: ClientPageProps) {
  const [config, setConfig] = useState<RankingConfig>({
    period: '24h',
    genre: initialGenre as RankingGenre,
    tag: initialTag
  })
  const [rankingData, setRankingData] = useState<RankingData>(initialData)
  const [currentPopularTags, setCurrentPopularTags] = useState<string[]>(popularTags)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // ジャンルが変更されたときのみ人気タグをリセット
  const [previousGenre, setPreviousGenre] = useState(config.genre)
  
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

    // 初期値から変更があった場合のみ実行
    const hasChanged = config.period !== '24h' || config.genre !== initialGenre || config.tag !== initialTag
    if (hasChanged) {
      fetchRanking()
    }
  }, [config, initialGenre, initialTag, previousGenre])

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
        <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
          {rankingData.map((item) => (
            <RankingItemComponent key={item.id} item={item} />
          ))}
        </ul>
      )}
    </>
  )
}