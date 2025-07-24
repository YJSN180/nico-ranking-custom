/**
 * カスタムランキングカードコンポーネント
 * 保存済みのカスタムランキングを将棋盤形式で表示
 */

import React from 'react'
import type { CustomTagRanking } from '@/types/custom-tag-ranking'
import { GENRE_LABELS } from '@/types/ranking-config'
import styles from './custom-ranking-card.module.css'

interface CustomRankingCardProps {
  ranking: CustomTagRanking
  onView: (ranking: CustomTagRanking) => void
  onEdit: (ranking: CustomTagRanking) => void
  onDelete: (ranking: CustomTagRanking) => void
}

export function CustomRankingCard({
  ranking,
  onView,
  onEdit,
  onDelete
}: CustomRankingCardProps) {
  // 条件の要約を生成
  const getConditionSummary = () => {
    const parts: string[] = []
    
    if (ranking.conditions.and.length > 0) {
      parts.push(`AND: ${ranking.conditions.and.join(', ')}`)
    }
    if (ranking.conditions.or.length > 0) {
      parts.push(`OR: ${ranking.conditions.or.join(', ')}`)
    }
    if (ranking.conditions.not.length > 0) {
      parts.push(`NOT: ${ranking.conditions.not.join(', ')}`)
    }
    
    return parts.join(' | ')
  }

  // 更新日時のフォーマット
  const formatDate = (timestamp: number) => {
    const date = new Date(timestamp)
    const now = new Date()
    const diff = now.getTime() - date.getTime()
    
    // 1時間以内
    if (diff < 60 * 60 * 1000) {
      const minutes = Math.floor(diff / (60 * 1000))
      return `${minutes}分前`
    }
    
    // 24時間以内
    if (diff < 24 * 60 * 60 * 1000) {
      const hours = Math.floor(diff / (60 * 60 * 1000))
      return `${hours}時間前`
    }
    
    // 7日以内
    if (diff < 7 * 24 * 60 * 60 * 1000) {
      const days = Math.floor(diff / (24 * 60 * 60 * 1000))
      return `${days}日前`
    }
    
    // それ以外は日付表示
    return date.toLocaleDateString('ja-JP')
  }

  return (
    <article className={styles.card}>
      <div className={styles.header}>
        <h3 className={styles.title}>{ranking.name}</h3>
        <div className={styles.meta}>
          <span className={styles.genre}>{GENRE_LABELS[ranking.genre]}</span>
          <span className={styles.period}>
            {ranking.period === '24h' ? '24時間' : '毎時'}
          </span>
        </div>
      </div>
      
      <div className={styles.conditions}>
        <p className={styles.conditionSummary}>{getConditionSummary()}</p>
      </div>
      
      <div className={styles.footer}>
        <time className={styles.date} dateTime={new Date(ranking.updatedAt).toISOString()}>
          {formatDate(ranking.updatedAt)}
        </time>
        
        <div className={styles.actions}>
          <button
            type="button"
            onClick={() => onView(ranking)}
            className={styles.viewButton}
            title="ランキングを表示"
          >
            表示
          </button>
          <button
            type="button"
            onClick={() => onEdit(ranking)}
            className={styles.editButton}
            title="ランキングを編集"
          >
            編集
          </button>
          <button
            type="button"
            onClick={() => onDelete(ranking)}
            className={styles.deleteButton}
            title="ランキングを削除"
          >
            削除
          </button>
        </div>
      </div>
    </article>
  )
}