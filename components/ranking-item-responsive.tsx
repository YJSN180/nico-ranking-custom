'use client'

import { memo, useCallback } from 'react'
import { OptimizedImage } from './optimized-image'
import { formatRegisteredDate, isWithin24Hours } from '@/lib/date-utils'
import { formatNumberMobile, formatTimeAgo, formatTimeCompact, formatDuration } from '@/lib/format-utils'
import type { RankingItem } from '@/types/ranking'
import styles from './ranking-item-responsive.module.css'

interface RankingItemProps {
  item: RankingItem
}

// CSS-only レスポンシブ対応版ランキングアイテム
// Container Queriesとflexbox/gridを活用してCLSを完全に回避
const RankingItemResponsive = memo(function RankingItemResponsive({ item }: RankingItemProps) {
  const isNew = isWithin24Hours(item.registeredAt)
  const dateDisplay = formatRegisteredDate(item.registeredAt)

  // イベントハンドラーをメモ化
  const handleClick = useCallback((e: React.MouseEvent) => {
    // 投稿者リンクなどの子要素のクリックは除外
    if ((e.target as HTMLElement).closest('a')) return;
    window.open(`https://www.nicovideo.jp/watch/${item.id}`, '_blank');
  }, [item.id])

  const handleAuthorClick = useCallback((e: React.MouseEvent) => {
    e.stopPropagation()
  }, [])

  // クラス名を事前計算
  const rankingItemClass = [
    styles.rankingItem,
    item.rank === 1 && styles.rank1,
    item.rank === 2 && styles.rank2,
    item.rank === 3 && styles.rank3
  ].filter(Boolean).join(' ')

  const desktopRankClass = [
    styles.rank,
    styles.desktop,
    item.rank === 1 && styles.rank1,
    item.rank === 2 && styles.rank2,
    item.rank === 3 && styles.rank3
  ].filter(Boolean).join(' ')

  const mobileRankClass = [
    styles.rank,
    styles.mobile,
    item.rank === 1 && styles.rank1,
    item.rank === 2 && styles.rank2,
    item.rank === 3 && styles.rank3
  ].filter(Boolean).join(' ')

  const dateClass = [
    styles.date,
    isNew && styles.new
  ].filter(Boolean).join(' ')

  return (
    <li 
      data-testid="ranking-item"
      className={rankingItemClass}
      onClick={handleClick}
    >
      <div className={styles.content}>
        {/* デスクトップ用順位（モバイルでは非表示） */}
        <div className={desktopRankClass}>
          {item.rank}
        </div>
        
        {/* サムネイル */}
        {item.thumbURL && (
          <div className={styles.thumbnail}>
            {/* モバイル用順位オーバーレイ */}
            <div className={mobileRankClass}>
              {item.rank}
            </div>
            <a
              href={`https://www.nicovideo.jp/watch/${item.id}`}
              target="_blank"
              rel="noopener noreferrer"
            >
              <OptimizedImage
                src={item.thumbURL}
                alt={item.title}
                width={160}
                height={90}
                className={styles.thumbnailImage}
                loading={item.rank <= 3 ? undefined : "lazy"}
                priority={item.rank <= 3}
              />
            </a>
            {/* 再生時間オーバーレイ */}
            {item.duration && (
              <div className={styles.duration}>
                {formatDuration(item.duration)}
              </div>
            )}
          </div>
        )}
        
        {/* コンテンツエリア */}
        <div className={styles.details}>
          {/* タイトル */}
          <a
            href={`https://www.nicovideo.jp/watch/${item.id}`}
            target="_blank"
            rel="noopener noreferrer"
            className={styles.title}
            data-testid="video-title"
          >
            {item.title}
          </a>
          
          {/* 投稿者情報 */}
          <div className={styles.author}>
            {(item.authorName || item.authorId) && item.authorId && (
              <a
                href={item.authorId.startsWith('channel/') 
                  ? `https://ch.nicovideo.jp/${item.authorId.replace('channel/', '')}`
                  : item.authorId.startsWith('community/') 
                  ? `https://com.nicovideo.jp/${item.authorId.replace('community/', '')}`
                  : `https://www.nicovideo.jp/user/${item.authorId}`
                }
                target="_blank"
                rel="noopener noreferrer"
                onClick={handleAuthorClick}
                className={styles.authorLink}
              >
                {item.authorIcon && (
                  <OptimizedImage
                    src={item.authorIcon}
                    alt={item.authorName || ''}
                    width={20}
                    height={20}
                    className={styles.authorIcon}
                    loading="lazy"
                  />
                )}
                <span className={styles.authorName}>
                  {item.authorName || item.authorId}
                </span>
              </a>
            )}
            <span className={styles.separator}>·</span>
            <span className={dateClass}>
              {dateDisplay}
            </span>
          </div>
          
          {/* 統計情報 */}
          <div 
            className={styles.stats}
            data-testid="video-stats"
          >
            <span className={styles.stat}>
              ▶️ {formatNumberMobile(item.views)}
            </span>
            <span className={styles.stat}>
              💬 {formatNumberMobile(item.comments || 0)}
            </span>
            <span className={styles.stat}>
              ❤️ {formatNumberMobile(item.likes || 0)}
            </span>
            <span className={`${styles.stat} ${styles.desktopOnly}`}>
              📁 {formatNumberMobile(item.mylists || 0)}
            </span>
          </div>
        </div>
      </div>
    </li>
  )
}, (prevProps, nextProps) => {
  // 完全な比較関数 - すべてのプロパティを確認
  const prev = prevProps.item
  const next = nextProps.item
  
  return (
    prev.id === next.id &&
    prev.rank === next.rank &&
    prev.title === next.title &&
    prev.views === next.views &&
    prev.comments === next.comments &&
    prev.mylists === next.mylists &&
    prev.likes === next.likes &&
    prev.thumbURL === next.thumbURL &&
    prev.authorName === next.authorName &&
    prev.authorId === next.authorId &&
    prev.authorIcon === next.authorIcon &&
    prev.registeredAt === next.registeredAt &&
    prev.duration === next.duration
  )
})

export default RankingItemResponsive