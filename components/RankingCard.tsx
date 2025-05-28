'use client'

import Image from 'next/image'
import { EnhancedRankingItem } from '@/types/enhanced-ranking'
import styles from './RankingCard.module.css'

interface RankingCardProps {
  item: EnhancedRankingItem
  isTop3: boolean
}

export function RankingCard({ item, isTop3 }: RankingCardProps) {
  const rankColors = ['#FFD700', '#C0C0C0', '#CD7F32'] // Gold, Silver, Bronze
  
  const cardClasses = [styles.rankingCard]
  if (isTop3) {
    cardClasses.push(styles.rankingCardTop3)
    if (item.rank === 1) cardClasses.push(styles.rankingCardTop3Gold)
    if (item.rank === 2) cardClasses.push(styles.rankingCardTop3Silver)
    if (item.rank === 3) cardClasses.push(styles.rankingCardTop3Bronze)
  }
  
  return (
    <div className={cardClasses.join(' ')}>
      <div className={styles.rankContainer}>
        <div 
          className={`${styles.rankNumber} ${isTop3 ? styles.rankNumberTop3 : ''}`}
          style={{ 
            backgroundColor: item.rank <= 3 ? rankColors[item.rank - 1] : '#666',
            color: item.rank <= 3 ? '#000' : '#fff'
          }}
        >
          {item.rank}
        </div>
      </div>
      
      <div className={styles.contentContainer}>
        <div className={styles.thumbnailContainer}>
          <Image
            src={item.thumbURL}
            alt={item.title}
            width={isTop3 ? 160 : 120}
            height={isTop3 ? 90 : 67}
            className={styles.thumbnail}
          />
          {item.duration && (
            <span className={styles.duration}>{item.duration}</span>
          )}
        </div>
        
        <div className={styles.infoContainer}>
          <h3 className={`${styles.title} ${isTop3 ? styles.titleTop3 : ''}`}>
            <a 
              href={`https://www.nicovideo.jp/watch/${item.id}`}
              target="_blank"
              rel="noopener noreferrer"
              className={styles.titleLink}
            >
              {item.title}
            </a>
          </h3>
          
          <div className={styles.uploaderInfo}>
            {item.uploader.icon && (
              <Image
                src={item.uploader.icon}
                alt={item.uploader.name}
                width={24}
                height={24}
                className={styles.uploaderIcon}
              />
            )}
            <span className={styles.uploaderName}>{item.uploader.name}</span>
            <span className={styles.uploadDate}>
              {new Date(item.uploadDate).toLocaleDateString('ja-JP')}
            </span>
          </div>
          
          <div className={styles.statsContainer}>
            <div className={styles.statItem}>
              <span className={styles.statIcon} data-testid="views-icon">👁</span>
              <span className={styles.statValue}>{item.views.toLocaleString()}</span>
            </div>
            <div className={styles.statItem}>
              <span className={styles.statIcon} data-testid="comments-icon">💬</span>
              <span className={styles.statValue}>{item.comments.toLocaleString()}</span>
            </div>
            <div className={styles.statItem}>
              <span className={styles.statIcon} data-testid="mylists-icon">📋</span>
              <span className={styles.statValue}>{item.mylists.toLocaleString()}</span>
            </div>
            <div className={styles.statItem}>
              <span className={styles.statIcon} data-testid="likes-icon">❤️</span>
              <span className={styles.statValue}>{item.likes.toLocaleString()}</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}