'use client'

import { useState, useEffect } from 'react'
import Image from 'next/image'
import { ViewIcon, CommentIcon, MylistIcon, LikeIcon } from '@/components/icons'
import { RankingSelector } from '@/components/ranking-selector'
import { TagSelector } from '@/components/tag-selector'
import type { RankingData } from '@/types/ranking'
import type { RankingConfig } from '@/types/ranking-config'

function RankingItem({ item }: { item: RankingData[number] }) {
  // すべてのランキングで統一されたコンパクトな表示
  const rankColors: Record<number, string> = {
    1: '#FFD700', // Gold
    2: '#C0C0C0', // Silver
    3: '#CD7F32'  // Bronze
  }
  
  const getRankStyle = (rank: number) => {
    if (rank <= 3) {
      return {
        background: rankColors[rank] || '#f5f5f5',
        color: 'white',
        fontSize: '18px',
        fontWeight: '800' as const,
        minWidth: '40px',
        height: '40px'
      }
    }
    return {
      background: '#f5f5f5',
      color: '#333',
      fontSize: '14px',
      fontWeight: '700' as const,
      minWidth: '32px',
      height: '32px'
    }
  }

  return (
    <li style={{ 
      marginBottom: '8px',
      background: 'white',
      borderRadius: '8px',
      overflow: 'hidden',
      boxShadow: '0 1px 3px rgba(0, 0, 0, 0.1)',
      border: item.rank <= 3 ? `2px solid ${rankColors[item.rank]}` : '1px solid #e5e5e5'
    }}>
      <div style={{ padding: '12px' }}>
        <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
          <div style={{ 
            ...getRankStyle(item.rank),
            borderRadius: '6px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center'
          }}>
            {item.rank}
          </div>
          {item.thumbURL && (
            <Image
              src={item.thumbURL}
              alt={item.title}
              width={120}
              height={67}
              style={{ 
                objectFit: 'cover',
                borderRadius: '6px'
              }}
            />
          )}
          <div style={{ flex: 1 }}>
            <a
              href={`https://www.nicovideo.jp/watch/${item.id}`}
              target="_blank"
              rel="noopener noreferrer"
              style={{ 
                color: '#0066cc', 
                textDecoration: 'none',
                fontSize: '14px',
                fontWeight: '600',
                lineHeight: '1.4',
                display: 'block',
                marginBottom: '4px'
              }}
            >
              {item.title}
            </a>
            <div style={{ display: 'flex', gap: '16px', fontSize: '12px', flexWrap: 'wrap', alignItems: 'center' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '4px', color: '#666' }}>
                <ViewIcon style={{ width: '14px', height: '14px' }} />
                <span>{item.views.toLocaleString()} 回再生</span>
              </div>
              {item.comments !== undefined && (
                <div style={{ display: 'flex', alignItems: 'center', gap: '4px', color: '#666' }}>
                  <CommentIcon style={{ width: '14px', height: '14px' }} />
                  <span>{item.comments.toLocaleString()}</span>
                </div>
              )}
              {item.mylists !== undefined && (
                <div style={{ display: 'flex', alignItems: 'center', gap: '4px', color: '#666' }}>
                  <MylistIcon style={{ width: '14px', height: '14px' }} />
                  <span>{item.mylists.toLocaleString()}</span>
                </div>
              )}
              {item.likes !== undefined && (
                <div style={{ display: 'flex', alignItems: 'center', gap: '4px', color: '#666' }}>
                  <LikeIcon style={{ width: '14px', height: '14px' }} />
                  <span>{item.likes.toLocaleString()}</span>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </li>
  )
}

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
            <RankingItem key={item.id} item={item} />
          ))}
        </ul>
      )}
    </>
  )
}