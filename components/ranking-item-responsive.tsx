'use client'

import { memo, useRef, useEffect, useState } from 'react'
import { OptimizedImage } from './optimized-image'
import { MylistButton } from './mylist-button'
import { formatRegisteredDate, isWithin24Hours } from '@/lib/date-utils'
import { formatNumberMobile, formatTimeAgo, formatTimeCompact, formatDuration } from '@/lib/format-utils'
import { getLinkTarget, navigateToVideo } from '@/lib/pwa-utils'
import { useTagDisplay } from '@/contexts/tag-display-context'
import type { RankingItem } from '@/types/ranking'

interface RankingItemProps {
  item: RankingItem
  disabled?: boolean
}

// CSS-only レスポンシブ対応版ランキングアイテム
// Media Queriesとflexbox/gridを活用してCLSを完全に回避
// パフォーマンス最適化: Container Query → Media Query移行完了
// HTML構造修正: VideoContextMenuは親コンポーネントで配置
const RankingItemResponsive = memo(function RankingItemResponsive({ item, disabled = false }: RankingItemProps) {
  const { showTags } = useTagDisplay()
  const rankColors: Record<number, string> = {
    1: 'var(--rank-gold)',
    2: 'var(--rank-silver)', 
    3: 'var(--rank-bronze)'
  }
  
  const isNew = isWithin24Hours(item.registeredAt)
  const dateDisplay = formatRegisteredDate(item.registeredAt)
  
  // PWA環境での訪問済み状態を管理
  const [isVisited, setIsVisited] = useState(false)
  
  // 初回マウント時に訪問済みかチェック
  useEffect(() => {
    try {
      const visitedKey = 'visited-videos'
      const visited = JSON.parse(localStorage.getItem(visitedKey) || '[]')
      if (visited.includes(item.id)) {
        setIsVisited(true)
      }
    } catch {
      // localStorage エラーは無視
    }
  }, [item.id])

  // ホバー状態をリセットする関数を外部に公開するために、data属性を使用
  const resetHoverState = (element: HTMLElement | null) => {
    if (element) {
      element.style.backgroundColor = 'var(--surface-color)';
    }
  }
  
  // 動画クリック時に動画ページを開く
  const handleVideoClick = () => {
    if (disabled) return
    
    // PWA環境での訪問済みリンク履歴を手動で記録
    try {
      const visitedKey = 'visited-videos'
      const visited = JSON.parse(localStorage.getItem(visitedKey) || '[]')
      if (!visited.includes(item.id)) {
        visited.push(item.id)
        // 最大1000件まで保存（メモリ制限対策）
        if (visited.length > 1000) {
          visited.shift()
        }
        localStorage.setItem(visitedKey, JSON.stringify(visited))
        setIsVisited(true)
      }
    } catch {
      // localStorage エラーは無視
    }
    
    // 新しいタブで開く
    window.open(`https://www.nicovideo.jp/watch/${item.id}`, '_blank', 'noopener,noreferrer')
  }

  return (
    <div 
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
        cursor: disabled ? 'not-allowed' : 'pointer',
        transition: 'background-color 0.2s',
        position: 'relative',
        opacity: disabled ? 0.6 : 1
      }}
      onClick={(e) => {
        // disabled状態では何もしない
        if (disabled) return;
        // 投稿者リンクやボタンなどの子要素のクリックは除外
          const target = e.target as HTMLElement;
          if (target.closest('a') || target.closest('button')) return;
          handleVideoClick();
        }}
        onMouseEnter={(e) => {
          // disabled状態またはタッチデバイスではホバー効果を適用しない
          if (disabled || 'ontouchstart' in window) return;
          e.currentTarget.style.backgroundColor = 'var(--surface-hover)';
        }}
        onMouseLeave={(e) => {
          // disabled状態またはタッチデバイスではホバー効果を適用しない
          if (disabled || 'ontouchstart' in window) return;
          e.currentTarget.style.backgroundColor = 'var(--surface-color)';
        }}
        onTouchEnd={(e) => {
          // disabled状態では何もしない
          if (disabled) return;
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
              target={getLinkTarget()}
              rel={getLinkTarget() === '_blank' ? 'noopener noreferrer' : undefined}
              style={{ display: 'block', cursor: disabled ? 'not-allowed' : 'pointer', opacity: disabled ? 0.6 : 1 }}
              onClick={(e) => {
                e.stopPropagation()
                if (disabled) {
                  e.preventDefault()
                  return false
                }
                
                // PWA環境でのナビゲーション処理
                const url = `https://www.nicovideo.jp/watch/${item.id}`
                if (getLinkTarget() === '_self') {
                  e.preventDefault()
                  navigateToVideo(url, e)
                }
                
                // サムネイルクリック時も訪問済みとして記録
                try {
                  const visitedKey = 'visited-videos'
                  const visited = JSON.parse(localStorage.getItem(visitedKey) || '[]')
                  if (!visited.includes(item.id)) {
                    visited.push(item.id)
                    if (visited.length > 1000) {
                      visited.shift()
                    }
                    localStorage.setItem(visitedKey, JSON.stringify(visited))
                    setIsVisited(true)
                  }
                } catch {
                  // エラーは無視
                }
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
                loading={item.rank <= 3 ? undefined : "lazy"}
                priority={item.rank <= 3}
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
              target={getLinkTarget()}
              rel={getLinkTarget() === '_blank' ? 'noopener noreferrer' : undefined}
              className="ranking-item-responsive__title"
              data-testid="video-title"
              style={{ 
                cursor: disabled ? 'not-allowed' : 'pointer', 
                opacity: disabled ? 0.6 : 1,
                // PWA環境での訪問済みスタイル
                color: isVisited ? 'var(--link-visited-color)' : undefined
              }}
              onClick={(e) => {
                e.stopPropagation()
                if (disabled) {
                  e.preventDefault()
                  return false
                }
                
                // PWA環境でのナビゲーション処理
                const url = `https://www.nicovideo.jp/watch/${item.id}`
                if (getLinkTarget() === '_self') {
                  e.preventDefault()
                  navigateToVideo(url, e)
                }
                
                // クリック時も訪問済みとして記録
                try {
                  const visitedKey = 'visited-videos'
                  const visited = JSON.parse(localStorage.getItem(visitedKey) || '[]')
                  if (!visited.includes(item.id)) {
                    visited.push(item.id)
                    if (visited.length > 1000) {
                      visited.shift()
                    }
                    localStorage.setItem(visitedKey, JSON.stringify(visited))
                    setIsVisited(true)
                  }
                } catch {
                  // エラーは無視
                }
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
                onClick={(e) => {
                  e.stopPropagation()
                  if (disabled) {
                    e.preventDefault()
                    return false
                  }
                }}
                style={{ 
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                  textDecoration: 'none',
                  color: 'inherit',
                  padding: '3px 6px',
                  margin: '-3px -6px',
                  borderRadius: '4px',
                  transition: 'background-color 0.2s',
                  cursor: disabled ? 'not-allowed' : 'pointer',
                  opacity: disabled ? 0.6 : 1
                }}
                onMouseEnter={(e) => {
                  if (!disabled) {
                    e.currentTarget.style.backgroundColor = 'var(--surface-secondary)'
                  }
                }}
                onMouseLeave={(e) => {
                  if (!disabled) {
                    e.currentTarget.style.backgroundColor = 'transparent'
                  }
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
          
          {/* タグ情報 */}
          {showTags && item.tags && item.tags.length > 0 && (
            <div 
              className="ranking-item-responsive__tags"
              style={{
                display: 'flex',
                flexWrap: 'wrap',
                gap: '4px',
                marginTop: '8px',
                paddingTop: '8px',
                borderTop: '1px solid var(--border-color)'
              }}
            >
              {item.tags.slice(0, 8).map((tag, index) => (
                <span
                  key={index}
                  style={{
                    background: 'var(--surface-secondary)',
                    color: 'var(--text-secondary)',
                    fontSize: '11px',
                    padding: '3px 8px',
                    borderRadius: '12px',
                    border: '1px solid var(--border-color)',
                    whiteSpace: 'nowrap',
                    maxWidth: '120px',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    display: 'inline-flex',
                    alignItems: 'center',
                    lineHeight: '1.2'
                  }}
                  title={tag}
                >
                  {tag}
                </span>
              ))}
              {item.tags.length > 8 && (
                <span
                  style={{
                    color: 'var(--text-secondary)',
                    fontSize: '11px',
                    padding: '2px 6px'
                  }}
                >
                  +{item.tags.length - 8}
                </span>
              )}
            </div>
          )}
        </div>
        
        {/* マイリストボタン専用エリア */}
        <div className="ranking-item-responsive__mylist-area">
          <MylistButton video={item} />
        </div>
      </div>
    </div>
  )
})

export default RankingItemResponsive