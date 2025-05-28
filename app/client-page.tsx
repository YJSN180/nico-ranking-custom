'use client'

import { useState, useEffect } from 'react'
import { RankingSelector } from '@/components/ranking-selector'
import { TagSelector } from '@/components/tag-selector'
import RankingItemComponent from '@/components/ranking-item'
import type { RankingData } from '@/types/ranking'
import type { RankingConfig } from '@/types/ranking-config'

interface ClientPageProps {
  initialData: RankingData
}

export default function ClientPage({ initialData }: ClientPageProps) {
  const [config, setConfig] = useState<RankingConfig>({
    period: '24h',
    genre: 'all'
  })
  const [rankingData, setRankingData] = useState<RankingData>(initialData)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

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
        setRankingData(data)
      } catch (err) {
        setError(err instanceof Error ? err.message : 'エラーが発生しました')
      } finally {
        setLoading(false)
      }
    }

    // 初回レンダリング時は実行しない（initialDataを使用）
    if (config.period !== '24h' || config.genre !== 'all' || config.tag) {
      fetchRanking()
    }
  }, [config])

  return (
    <>
      <RankingSelector config={config} onConfigChange={setConfig} />
      <TagSelector config={config} onConfigChange={setConfig} />
      
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