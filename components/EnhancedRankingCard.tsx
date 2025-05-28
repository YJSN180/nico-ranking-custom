import Image from 'next/image'
import { EnhancedRankingItem } from '@/types/enhanced-ranking'
import styles from '@/app/page.module.css'

interface RankingCardProps {
  item: EnhancedRankingItem
  className?: string
}

export function EnhancedRankingCard({ item, className = '' }: RankingCardProps) {
  const isTop3 = item.rank <= 3
  const rankColors = ['#FFD700', '#C0C0C0', '#CD7F32'] // Gold, Silver, Bronze
  
  const cardClasses = [
    styles.rankingCard,
    isTop3 ? styles.topRankCard : '',
    isTop3 ? styles[`rank${item.rank}`] : '',
    className
  ].filter(Boolean).join(' ')

  const formatNumber = (num: number) => {
    if (num >= 10000) {
      return `${(num / 10000).toFixed(1)}万`
    }
    return num.toLocaleString()
  }

  const formatDate = (dateString: string) => {
    const date = new Date(dateString)
    const now = new Date()
    const diffDays = Math.floor((now.getTime() - date.getTime()) / (1000 * 60 * 60 * 24))
    
    if (diffDays === 0) return '今日'
    if (diffDays === 1) return '昨日'
    if (diffDays < 7) return `${diffDays}日前`
    return date.toLocaleDateString('ja-JP', { month: 'short', day: 'numeric' })
  }

  return (
    <li className={cardClasses}>
      <div className={styles.cardHeader}>
        <div className={`${styles.rankBadge} ${isTop3 ? styles.topRankBadge : ''}`}>
          {item.rank}
        </div>
        {item.thumbURL && (
          <Image
            src={item.thumbURL}
            alt={item.title}
            width={120}
            height={68}
            className={styles.thumbnail}
            style={{ 
              objectFit: 'cover'
            }}
          />
        )}
        <div className={styles.cardContent}>
          <a
            href={`https://www.nicovideo.jp/watch/${item.id}`}
            target="_blank"
            rel="noopener noreferrer"
            className={styles.videoTitle}
          >
            {item.title}
          </a>
        </div>
      </div>

      <div className={styles.metadataGrid}>
        <div className={styles.metadataItem}>
          <span className={styles.metadataIcon}>👁️</span>
          <span>{formatNumber(item.views)} 回再生</span>
        </div>
        <div className={styles.metadataItem}>
          <span className={styles.metadataIcon}>💬</span>
          <span>{formatNumber(item.comments)} コメント</span>
        </div>
        <div className={styles.metadataItem}>
          <span className={styles.metadataIcon}>⭐</span>
          <span>{formatNumber(item.mylists)} マイリスト</span>
        </div>
        <div className={styles.metadataItem}>
          <span className={styles.metadataIcon}>👍</span>
          <span>{formatNumber(item.likes)} いいね</span>
        </div>
      </div>

      <div className={styles.uploaderInfo}>
        <div className={styles.uploaderAvatar}>
          {item.uploader.name.charAt(item.uploader.name.length - 1)}
        </div>
        <span className={styles.uploaderName}>{item.uploader.name}</span>
        <span style={{ marginLeft: 'auto', fontSize: '0.8rem', color: '#999' }}>
          {formatDate(item.uploadDate)}
        </span>
      </div>
    </li>
  )
}