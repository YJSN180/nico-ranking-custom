'use client'

import { useEffect, useState, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import { notFound } from 'next/navigation'
import { BackLink } from '@/components/back-link'
import RankingItemResponsive from '@/components/ranking-item-responsive'
import { useCustomTagRankings } from '@/hooks/use-custom-tag-rankings'
import { filterByCustomTags } from '@/lib/filter-with-custom-tags'
import { GENRE_LABELS } from '@/types/ranking-config'
import type { CustomTagRanking } from '@/types/custom-tag-ranking'
import type { RankingItem } from '@/types/ranking'
import styles from './custom-ranking-detail.module.css'

interface CustomRankingDetailClientProps {
  id: string
}

export function CustomRankingDetailClient({ id }: CustomRankingDetailClientProps) {
  const router = useRouter()
  const { rankings, isLoading: rankingsLoading } = useCustomTagRankings()
  const [customRanking, setCustomRanking] = useState<CustomTagRanking | null>(null)
  const [rankingData, setRankingData] = useState<RankingItem[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // カスタムランキングを取得
  useEffect(() => {
    if (!rankingsLoading) {
      const found = rankings.find(r => r.id === id)
      if (found) {
        setCustomRanking(found)
      } else if (rankings.length > 0) {
        notFound()
      }
    }
  }, [id, rankings, rankingsLoading])

  // ランキングデータを取得
  useEffect(() => {
    if (!customRanking) return

    const fetchData = async () => {
      setIsLoading(true)
      setError(null)
      
      try {
        const response = await fetch(`/api/ranking?genre=${customRanking.genre}&period=${customRanking.period}`)
        if (!response.ok) {
          throw new Error('ランキングデータの取得に失敗しました')
        }
        
        const data = await response.json()
        setRankingData(data.items || [])
      } catch (err) {
        setError(err instanceof Error ? err.message : 'エラーが発生しました')
      } finally {
        setIsLoading(false)
      }
    }

    fetchData()
  }, [customRanking])

  // カスタムタグでフィルタリング
  const filteredRankingData = useMemo(() => {
    if (!customRanking || !rankingData || rankingData.length === 0) {
      return []
    }
    return filterByCustomTags(rankingData, customRanking.conditions)
  }, [rankingData, customRanking])

  // 条件の要約を生成
  const getConditionSummary = () => {
    if (!customRanking) return ''
    
    const parts: string[] = []
    
    if (customRanking.conditions.and.length > 0) {
      parts.push(`すべて含む: ${customRanking.conditions.and.join(', ')}`)
    }
    if (customRanking.conditions.or.length > 0) {
      parts.push(`いずれか含む: ${customRanking.conditions.or.join(', ')}`)
    }
    if (customRanking.conditions.not.length > 0) {
      parts.push(`含まない: ${customRanking.conditions.not.join(', ')}`)
    }
    
    return parts.join(' | ')
  }

  if (rankingsLoading || !customRanking) {
    return (
      <div className={styles.container}>
        <div className={styles.headerTop}>
          <BackLink />
        </div>
        <div className={styles.loading}>読み込み中...</div>
      </div>
    )
  }

  if (error) {
    return (
      <div className={styles.container}>
        <div className={styles.headerTop}>
          <BackLink />
        </div>
        <div className={styles.error}>
          <p>{error}</p>
          <button 
            onClick={() => window.location.reload()}
            className={styles.retryButton}
          >
            再試行
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className={styles.container}>
      <div className={styles.headerTop}>
        <BackLink />
      </div>

      <header className={styles.header}>
        <h1 className={styles.title}>{customRanking.name}</h1>
        
        <div className={styles.meta}>
          <span className={styles.genre}>{GENRE_LABELS[customRanking.genre]}</span>
          <span className={styles.period}>
            {customRanking.period === '24h' ? '24時間' : '毎時'}
          </span>
        </div>

        <p className={styles.conditions}>{getConditionSummary()}</p>
        
        <div className={styles.stats}>
          <span className={styles.statItem}>
            全{rankingData?.length || 0}件中 {filteredRankingData.length}件表示
          </span>
        </div>
      </header>

      {isLoading ? (
        <div className={styles.loading}>読み込み中...</div>
      ) : filteredRankingData.length === 0 ? (
        <div className={styles.emptyState}>
          <p className={styles.emptyMessage}>
            指定された条件に一致する動画がありません
          </p>
          <p className={styles.emptyHint}>
            条件を変更して再度お試しください
          </p>
          <button
            onClick={() => router.push('/custom-rankings')}
            className={styles.backButton}
          >
            カスタムランキング一覧に戻る
          </button>
        </div>
      ) : (
        <div className={styles.rankingList}>
          {filteredRankingData.map((item, index) => (
            <RankingItemResponsive
              key={item.id}
              item={{ ...item, rank: index + 1 }}
            />
          ))}
        </div>
      )}
    </div>
  )
}