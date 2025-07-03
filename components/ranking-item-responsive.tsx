'use client'

import { memo, useRef, useEffect } from 'react'
import { OptimizedImage } from './optimized-image'
import { MylistButton } from './mylist-button'
import { formatRegisteredDate, isWithin24Hours } from '@/lib/date-utils'
import { formatNumberMobile, formatTimeAgo, formatTimeCompact, formatDuration } from '@/lib/format-utils'
import type { RankingItem } from '@/types/ranking'

interface RankingItemProps {
  item: RankingItem
}

// CSS-only レスポンシブ対応版ランキングアイテム
// Media Queriesとflexbox/gridを活用してCLSを完全に回避
// パフォーマンス最適化: Container Query → Media Query移行完了
const RankingItemResponsive = memo(function RankingItemResponsive({ item }: RankingItemProps) {
  const rankColors: Record<number, string> = {
    1: 'var(--rank-gold)',
    2: 'var(--rank-silver)', 
    3: 'var(--rank-bronze)'
  }
  
  const isNew = isWithin24Hours(item.registeredAt)
  const dateDisplay = formatRegisteredDate(item.registeredAt)

  // ホバー状態をリセットする関数を外部に公開するために、data属性を使用
  const resetHoverState = (element: HTMLElement | null) => {
    if (element) {
      element.style.backgroundColor = 'var(--surface-color)';
    }
  }
  
  // 動画クリック時に動画ページを開く
  const handleVideoClick = () => {
    window.open(`https://www.nicovideo.jp/watch/${item.id}`, '_blank')
  }

  return (
    <li 
      data-testid="ranking-item"
      data-video-id={item.id}
      className="ranking-item-responsive"
      style={{
        // Media Query最適化: containerTypeを削除（Container Query → Media Query移行完了）
        background: 'var(--surface-color)',
        borderRadius: '8px',
        overflow: 'hidden',
        boxShadow: 'var(--shadow-md)',
        border: item.rank <= 3 ? `2px solid ${rankColors[item.rank]}` : '1px solid var(--border-color)',
        marginBottom: '8px',
        cursor: 'pointer',
        transition: 'background-color 0.2s',
        position: 'relative'
      }}
      onClick={(e) => {
        // 投稿者リンクやボタンなどの子要素のクリックは除外
        const target = e.target as HTMLElement;
        if (target.closest('a') || target.closest('button')) return;
        handleVideoClick();
      }}
      onMouseEnter={(e) => {
        // タッチデバイスではホバー効果を適用しない
        if ('ontouchstart' in window) return;
        e.currentTarget.style.backgroundColor = 'var(--surface-hover)';
      }}
      onMouseLeave={(e) => {
        // タッチデバイスではホバー効果を適用しない
        if ('ontouchstart' in window) return;
        e.currentTarget.style.backgroundColor = 'var(--surface-color)';
      }}
      onTouchEnd={(e) => {
        // タッチ終了時に背景色をリセット
        const element = e.currentTarget;
        setTimeout(() => {
          if (element) {
            element.style.backgroundColor = 'var(--surface-color)';
          }
        }, 100);
      }}
    >
      <div className="ranking-item-responsive__content">
        {/* デスクトップ用順位（モバイルでは非表示） */}
        <div 
          className="ranking-item-responsive__rank ranking-item-responsive__rank--desktop"
          style={{
            background: item.rank <= 3 ? rankColors[item.rank] : 'var(--surface-secondary)',
            color: item.rank <= 3 ? 'var(--button-text-active)' : 'var(--text-primary)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            borderRadius: '6px',
            fontWeight: '700',
            userSelect: 'none',
            // モバイルではオーバーレイ用の背景色を設定（CSSで上書きされる）
            '--mobile-rank-bg': item.rank <= 3 ? rankColors[item.rank] : 'var(--surface-secondary)',
            '--mobile-rank-color': item.rank <= 3 ? 'var(--button-text-active)' : 'var(--text-primary)'
          } as React.CSSProperties & { '--mobile-rank-bg': string; '--mobile-rank-color': string }}
        >
          {item.rank}
        </div>
        
        {/* サムネイル */}
        {item.thumbURL && (
          <div className="ranking-item-responsive__thumbnail">
            {/* モバイル用順位オーバーレイ */}
            <div 
              className="ranking-item-responsive__rank ranking-item-responsive__rank--mobile"
              style={{
                background: item.rank <= 3 ? rankColors[item.rank] : 'var(--surface-secondary)',
                color: item.rank <= 3 ? 'var(--button-text-active)' : 'var(--text-primary)',
                fontWeight: '700',
                userSelect: 'none',
                '--mobile-rank-bg': item.rank <= 3 ? rankColors[item.rank] : 'var(--surface-secondary)',
                '--mobile-rank-color': item.rank <= 3 ? 'var(--button-text-active)' : 'var(--text-primary)'
              } as React.CSSProperties & { '--mobile-rank-bg': string; '--mobile-rank-color': string }}
            >
              {item.rank}
            </div>
            <a
              href={`https://www.nicovideo.jp/watch/${item.id}`}
              target="_blank"
              rel="noopener noreferrer"
              style={{ display: 'block', cursor: 'pointer' }}
              onClick={(e) => {
                e.stopPropagation()
              }}
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
                loading={item.rank <= 2 ? undefined : "lazy"}
                priority={item.rank <= 2}
                fetchPriority={item.rank <= 2 ? "high" : item.rank <= 5 ? "low" : undefined}
              />
            </a>
            {/* 再生時間オーバーレイ */}
            {item.duration && (
              <div className="ranking-item-responsive__duration">
                {formatDuration(item.duration)}
              </div>
            )}
          </div>
        )}
        
        {/* コンテンツエリア */}
        <div className="ranking-item-responsive__details">
          {/* タイトル行（モバイルではマイリストボタンを含む） */}
          <div className="ranking-item-responsive__title-row">
            {/* タイトル */}
            <a
              href={`https://www.nicovideo.jp/watch/${item.id}`}
              target="_blank"
              rel="noopener noreferrer"
              className="ranking-item-responsive__title"
              data-testid="video-title"
              onClick={(e) => {
                e.stopPropagation()
              }}
            >
              {item.title}
            </a>
            {/* モバイル用マイリストボタン（CSSで表示制御） */}
            <div className="ranking-item-responsive__mylist-button">
              <MylistButton video={item} />
            </div>
          </div>
          
          {/* 投稿者情報 */}
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
                style={{ 
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                  textDecoration: 'none',
                  color: 'inherit',
                  padding: '3px 6px',
                  margin: '-3px -6px',
                  borderRadius: '4px',
                  transition: 'background-color 0.2s'
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.backgroundColor = 'var(--surface-secondary)'
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.backgroundColor = 'transparent'
                }}
              >
                {item.authorIcon && (
                  <OptimizedImage
                    src={item.authorIcon}
                    alt={item.authorName || ''}
                    width={18}
                    height={18}
                    sizes="18px"
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
            <span className="ranking-item-responsive__stat">
              📁 {formatNumberMobile(item.mylists || 0)}
            </span>
          </div>
        </div>
        
        {/* マイリストボタン専用エリア */}
        <div className="ranking-item-responsive__mylist-area">
          <MylistButton video={item} />
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