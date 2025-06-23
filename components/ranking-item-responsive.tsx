'use client'

import { memo } from 'react'
import { OptimizedImage } from './optimized-image'
import { formatRegisteredDate, isWithin24Hours } from '@/lib/date-utils'
import { formatNumberMobile, formatTimeAgo, formatTimeCompact } from '@/lib/format-utils'
import type { RankingItem } from '@/types/ranking'

interface RankingItemProps {
  item: RankingItem
}

// CSS-only レスポンシブ対応版ランキングアイテム
// Container Queriesとflexbox/gridを活用してCLSを完全に回避
const RankingItemResponsive = memo(function RankingItemResponsive({ item }: RankingItemProps) {
  const rankColors: Record<number, string> = {
    1: 'var(--rank-gold)',
    2: 'var(--rank-silver)', 
    3: 'var(--rank-bronze)'
  }
  
  const isNew = isWithin24Hours(item.registeredAt)
  const dateDisplay = formatRegisteredDate(item.registeredAt)

  return (
    <li 
      data-testid="ranking-item"
      className="ranking-item-responsive"
      style={{
        // Container Queries用のcontainment設定
        containerType: 'inline-size',
        background: 'var(--surface-color)',
        borderRadius: '8px',
        overflow: 'hidden',
        boxShadow: 'var(--shadow-md)',
        border: item.rank <= 3 ? `2px solid ${rankColors[item.rank]}` : '1px solid var(--border-color)',
        marginBottom: '8px'
      }}
    >
      <div className="ranking-item-responsive__content">
        {/* 順位 */}
        <div 
          className="ranking-item-responsive__rank"
          style={{
            background: item.rank <= 3 ? rankColors[item.rank] : 'var(--surface-secondary)',
            color: item.rank <= 3 ? 'var(--button-text-active)' : 'var(--text-primary)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            borderRadius: '6px',
            fontWeight: '700',
            userSelect: 'none'
          }}
        >
          {item.rank}
        </div>
        
        {/* サムネイル */}
        {item.thumbURL && (
          <div className="ranking-item-responsive__thumbnail">
            <a
              href={`https://www.nicovideo.jp/watch/${item.id}`}
              target="_blank"
              rel="noopener noreferrer"
              style={{ display: 'block', cursor: 'pointer' }}
            >
              <OptimizedImage
                src={item.thumbURL}
                alt={item.title}
                width={160}
                height={90}
                style={{ 
                  objectFit: 'cover',
                  borderRadius: '4px',
                  width: '100%',
                  height: 'auto',
                  aspectRatio: '16 / 9'
                }}
                loading={item.rank <= 3 ? undefined : "lazy"}
                priority={item.rank <= 3}
              />
            </a>
          </div>
        )}
        
        {/* コンテンツエリア */}
        <div className="ranking-item-responsive__details">
          {/* タイトル */}
          <a
            href={`https://www.nicovideo.jp/watch/${item.id}`}
            target="_blank"
            rel="noopener noreferrer"
            className="ranking-item-responsive__title"
            data-testid="video-title"
          >
            {item.title}
          </a>
          
          {/* 投稿者情報 */}
          <div className="ranking-item-responsive__author">
            {item.authorIcon && (
              <OptimizedImage
                src={item.authorIcon}
                alt={item.authorName || ''}
                width={20}
                height={20}
                style={{ 
                  borderRadius: '50%',
                  border: '1px solid var(--border-color)',
                  flexShrink: 0
                }}
                loading="lazy"
              />
            )}
            {(item.authorName || item.authorId) && (
              <span className="ranking-item-responsive__author-name">
                {item.authorName || item.authorId}
              </span>
            )}
            <span className="ranking-item-responsive__separator">·</span>
            <span 
              className="ranking-item-responsive__date"
              style={{ 
                color: isNew ? '#e74c3c' : 'var(--text-muted)',
                fontWeight: isNew ? '600' : '400'
              }}
            >
              {dateDisplay}
            </span>
          </div>
          
          {/* 統計情報 */}
          <div 
            className="ranking-item-responsive__stats"
            data-testid="video-stats"
          >
            <span className="ranking-item-responsive__stat">
              ▶️ {formatNumberMobile(item.views)}
            </span>
            <span className="ranking-item-responsive__stat">
              💬 {formatNumberMobile(item.comments || 0)}
            </span>
            <span className="ranking-item-responsive__stat">
              ❤️ {formatNumberMobile(item.likes || 0)}
            </span>
            <span className="ranking-item-responsive__stat ranking-item-responsive__stat--desktop-only">
              📁 {formatNumberMobile(item.mylists || 0)}
            </span>
          </div>
        </div>
      </div>
    </li>
  )
}, (prevProps, nextProps) => {
  // メモ化の比較関数
  return (
    prevProps.item.id === nextProps.item.id &&
    prevProps.item.views === nextProps.item.views &&
    prevProps.item.comments === nextProps.item.comments &&
    prevProps.item.mylists === nextProps.item.mylists &&
    prevProps.item.likes === nextProps.item.likes
  )
})

export default RankingItemResponsive