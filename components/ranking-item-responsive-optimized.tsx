'use client'

import { memo, useState, useEffect } from 'react'
import { OptimizedImage } from './optimized-image'
import { formatRegisteredDate, isWithin24Hours } from '@/lib/date-utils'
import { formatNumberMobile, formatDuration } from '@/lib/format-utils'
import type { RankingItem } from '@/types/ranking'

interface RankingItemProps {
  item: RankingItem
}

// CSS-optimized version for better LCP performance
const RankingItemResponsiveOptimized = memo(function RankingItemResponsiveOptimized({ item }: RankingItemProps) {
  const rankColors: Record<number, string> = {
    1: 'var(--rank-gold)',
    2: 'var(--rank-silver)', 
    3: 'var(--rank-bronze)'
  }
  
  const isNew = isWithin24Hours(item.registeredAt)
  
  // ハイドレーションエラーを防ぐため、日付表示は初期値を固定
  // ハイドレーション後に実際の値に更新
  const [dateDisplay, setDateDisplay] = useState(() => formatRegisteredDate(item.registeredAt))
  
  useEffect(() => {
    // ハイドレーション後に日付を再計算
    setDateDisplay(formatRegisteredDate(item.registeredAt))
  }, [item.registeredAt])

  // Determine rank class
  let rankClass = 'ranking-item-responsive'
  if (item.rank === 1) rankClass += ' ranking-item-responsive--gold'
  else if (item.rank === 2) rankClass += ' ranking-item-responsive--silver'
  else if (item.rank === 3) rankClass += ' ranking-item-responsive--bronze'

  return (
    <li 
      data-testid="ranking-item"
      className={rankClass}
      onClick={(e) => {
        if ((e.target as HTMLElement).closest('a')) return;
        window.open(`https://www.nicovideo.jp/watch/${item.id}`, '_blank');
      }}
    >
      <div className="ranking-item-responsive__content">
        {/* Desktop rank */}
        <div 
          className="ranking-item-responsive__rank ranking-item-responsive__rank--desktop"
          style={{
            background: item.rank <= 3 ? rankColors[item.rank] : 'var(--surface-secondary)',
            color: item.rank <= 3 ? 'var(--button-text-active)' : 'var(--text-primary)',
          }}
        >
          {item.rank}
        </div>
        
        {/* Thumbnail */}
        {item.thumbURL && (
          <div className="ranking-item-responsive__thumbnail">
            <div 
              className="ranking-item-responsive__rank ranking-item-responsive__rank--mobile"
              style={{
                background: item.rank <= 3 ? rankColors[item.rank] : 'var(--surface-secondary)',
                color: item.rank <= 3 ? 'var(--button-text-active)' : 'var(--text-primary)',
              }}
            >
              {item.rank}
            </div>
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
            {item.duration && (
              <div className="ranking-item-responsive__duration">
                {formatDuration(item.duration)}
              </div>
            )}
          </div>
        )}
        
        {/* Content area */}
        <div className="ranking-item-responsive__details">
          <a
            href={`https://www.nicovideo.jp/watch/${item.id}`}
            target="_blank"
            rel="noopener noreferrer"
            className="ranking-item-responsive__title"
            data-testid="video-title"
          >
            {item.title}
          </a>
          
          <div className="ranking-item-responsive__author">
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
                onClick={(e) => e.stopPropagation()}
                className="ranking-item-responsive__author-link"
              >
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
                <span className="ranking-item-responsive__author-name">
                  {item.authorName || item.authorId}
                </span>
              </a>
            )}
            <span className="ranking-item-responsive__separator">·</span>
            <span 
              className="ranking-item-responsive__date"
              style={{ 
                color: isNew ? '#c53030' : 'var(--text-secondary)',
                fontWeight: isNew ? '600' : '400'
              }}
            >
              {dateDisplay}
            </span>
          </div>
          
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
            <span className="ranking-item-responsive__stat hidden sm:inline">
              📁 {formatNumberMobile(item.mylists || 0)}
            </span>
          </div>
        </div>
      </div>
    </li>
  )
}, (prevProps, nextProps) => {
  return (
    prevProps.item.id === nextProps.item.id &&
    prevProps.item.views === nextProps.item.views &&
    prevProps.item.comments === nextProps.item.comments &&
    prevProps.item.mylists === nextProps.item.mylists &&
    prevProps.item.likes === nextProps.item.likes
  )
})

export default RankingItemResponsiveOptimized