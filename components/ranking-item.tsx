'use client'

import { memo } from 'react'
import { OptimizedImage } from './optimized-image'
import { MylistButton } from './mylist-button'
import { formatRegisteredDate, isWithin24Hours } from '@/lib/date-utils'
import { formatNumberMobile, formatTimeAgo, formatTimeCompact } from '@/lib/format-utils'
import { useMobileLayout } from '@/hooks/use-mobile-layout'
import type { RankingItem } from '@/types/ranking'

interface RankingItemProps {
  item: RankingItem
  isMobile?: boolean
}

const RankingItemComponent = memo(function RankingItemComponent({ item, isMobile = false }: RankingItemProps) {
  const { isNarrow, isVeryNarrow } = useMobileLayout()
  
  const rankColors: Record<number, string> = {
    1: 'var(--rank-gold)', // Gold
    2: 'var(--rank-silver)', // Silver
    3: 'var(--rank-bronze)'  // Bronze
  }
  
  const getRankStyle = (rank: number, mobile: boolean) => {
    if (mobile) {
      // モバイル用のコンパクトなスタイル（動画タイトルと同じサイズ、左詰め）
      return {
        fontSize: '15px',
        fontWeight: '600' as const,
        color: rank <= 3 ? rankColors[rank] : 'var(--text-primary)',
        marginBottom: '4px',
        height: '18px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'flex-start'
      }
    }
    
    // デスクトップ用の大きめのスタイル
    if (rank <= 3) {
      return {
        background: rankColors[rank] || 'var(--surface-secondary)',
        color: 'var(--button-text-active)',
        fontSize: '32px',
        fontWeight: '800' as const,
        minWidth: '56px',
        height: '56px'
      }
    }
    return {
      background: 'var(--surface-secondary)',
      color: 'var(--text-primary)',
      fontSize: '24px',
      fontWeight: '700' as const,
      minWidth: '44px',
      height: '44px'
    }
  }

  const isNew = isWithin24Hours(item.registeredAt)
  const dateDisplay = isMobile ? formatTimeAgo(item.registeredAt || '') : formatRegisteredDate(item.registeredAt)

  // モバイル用新レイアウト（順位をサムネイル上にオーバーレイ）
  if (isMobile) {
    const timeDisplay = isVeryNarrow ? formatTimeCompact(dateDisplay) : dateDisplay
    
    return (
      <li 
        data-testid="ranking-item"
        className="mobile-v2"
        style={{ 
          marginBottom: '3px',
          background: 'var(--surface-color)',
          borderRadius: '6px',
          overflow: 'hidden',
          boxShadow: 'var(--shadow-sm)',
          border: '1px solid var(--border-color)',
          cursor: 'pointer',
          transition: 'background-color 0.2s',
          position: 'relative'
        }}
        onClick={(e) => {
          // 投稿者リンクなどの子要素のクリックは除外
          if ((e.target as HTMLElement).closest('a')) return;
          window.open(`https://www.nicovideo.jp/watch/${item.id}`, '_blank');
        }}
        onMouseEnter={(e) => {
          e.currentTarget.style.backgroundColor = 'var(--surface-hover)';
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.backgroundColor = 'var(--surface-color)';
        }}
      >
        <div style={{ padding: '3px 5px' }}>
          {/* メインコンテンツ */}
          <div style={{ display: 'flex', gap: '6px' }}>
            {/* 左側：サムネイル（順位オーバーレイ付き） */}
            <div style={{ flexShrink: 0, position: 'relative' }}>
              {/* サムネイル */}
              {item.thumbURL && (
                <a
                  href={`https://www.nicovideo.jp/watch/${item.id}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={(e) => {
                    // 別タブで開くため、スクロール位置保存は不要
                  }}
                  style={{ display: 'block', cursor: 'pointer' }}
                >
                  <OptimizedImage
                    src={item.thumbURL}
                    alt={item.title}
                    width={120}
                    height={67}
                    style={{ 
                      objectFit: 'cover',
                      borderRadius: '4px'
                    }}
                    loading={item.rank <= 3 ? undefined : "lazy"}
                    priority={item.rank <= 3}
                  />
                  {/* 順位オーバーレイ */}
                  <div style={{
                    position: 'absolute',
                    top: '2px',
                    left: '2px',
                    fontSize: '12px',
                    fontWeight: '700',
                    color: 'white',
                    backgroundColor: item.rank <= 3 ? rankColors[item.rank] : 'rgba(0, 0, 0, 0.7)',
                    padding: '2px 6px',
                    borderRadius: '4px',
                    lineHeight: '1',
                    zIndex: 1,
                    textShadow: '1px 1px 2px rgba(0, 0, 0, 0.8)',
                    userSelect: 'none',
                    WebkitUserSelect: 'none',
                    MozUserSelect: 'none',
                    msUserSelect: 'none'
                  }}>
                    {item.rank}
                  </div>
                </a>
              )}
            </div>
            
            {/* 右側：テキストエリア */}
            <div style={{ 
              flex: 1, 
              display: 'flex', 
              flexDirection: 'column', 
              gap: '3px',
              minWidth: 0,
              justifyContent: 'center'
            }}>
              {/* タイトル */}
              <a
                href={`https://www.nicovideo.jp/watch/${item.id}`}
                target="_blank"
                rel="noopener noreferrer"
                onClick={(e) => {
                  // 別タブで開くため、スクロール位置保存は不要
                }}
                data-testid="video-title"
                className="ranking-video-link ranking-video-link--mobile"
              >
                {item.title}
              </a>
              
              {/* 投稿者情報 */}
              <div 
                data-testid="author-info"
                style={{ 
                  display: 'flex',
                  alignItems: 'center',
                  gap: '4px',
                  fontSize: isVeryNarrow ? '11px' : '13px',
                  color: 'var(--text-secondary)'
                }}>
                {/* 投稿者アイコンと名前（リンク化） */}
                {(item.authorName || item.authorId) && (
                  <a
                    href={item.authorId?.startsWith('channel/') 
                      ? `https://ch.nicovideo.jp/${item.authorId.replace('channel/', '')}`
                      : item.authorId?.startsWith('community/') 
                      ? `https://com.nicovideo.jp/${item.authorId.replace('community/', '')}`
                      : `https://www.nicovideo.jp/user/${item.authorId}`
                    }
                    target="_blank"
                    rel="noopener noreferrer"
                    onClick={(e) => e.stopPropagation()}
                    style={{ 
                      display: 'flex',
                      alignItems: 'center',
                      gap: '4px',
                      color: 'var(--text-secondary)',
                      textDecoration: 'none',
                      padding: '2px 4px',
                      margin: '-2px -4px',
                      borderRadius: '4px',
                      transition: 'background-color 0.2s',
                      overflow: 'hidden'
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.backgroundColor = 'var(--surface-hover)'
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.backgroundColor = 'transparent'
                    }}
                  >
                    {/* 投稿者アイコン */}
                    {item.authorIcon && (
                      <OptimizedImage
                        src={item.authorIcon}
                        alt={item.authorName || ''}
                        width={16}
                        height={16}
                        style={{ 
                          borderRadius: '50%',
                          border: '1px solid var(--border-color)',
                          flexShrink: 0
                        }}
                        loading="lazy"
                      />
                    )}
                    {/* 投稿者名 */}
                    <span style={{ 
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                      maxWidth: isVeryNarrow ? '80px' : '100px'
                    }}>
                      {item.authorName || item.authorId}
                    </span>
                  </a>
                )}
                <span>·</span>
                {/* 投稿日時 */}
                <span style={{ 
                  flexShrink: 0,
                  color: isNew ? '#c53030' : 'var(--text-secondary)',
                  fontWeight: isNew ? '600' : '400'
                }}>
                  {timeDisplay}
                </span>
              </div>
              
              {/* 統計情報 */}
              <div 
                data-testid="video-stats"
                style={{ 
                  fontSize: isVeryNarrow ? '10px' : isNarrow ? '11px' : '12px',
                  color: 'var(--text-secondary)',
                  display: 'flex',
                  gap: isVeryNarrow ? '4px' : '8px',
                  userSelect: 'none',
                  WebkitUserSelect: 'none',
                  MozUserSelect: 'none',
                  msUserSelect: 'none'
                }}
              >
                <span>▶️{formatNumberMobile(item.views)}</span>
                <span>💬{formatNumberMobile(item.comments || 0)}</span>
                <span>❤️{formatNumberMobile(item.likes || 0)}</span>
                {!isVeryNarrow && <span>📁{formatNumberMobile(item.mylists || 0)}</span>}
              </div>
            </div>
          </div>
        </div>
        
        {/* マイリストボタン（モバイル） */}
        <MylistButton video={item} />
      </li>
    )
  }

  // デスクトップ用の既存レイアウト
  return (
    <li 
      data-testid="ranking-item"
      style={{ 
      marginBottom: '4px',
      background: 'var(--surface-color)',
      borderRadius: '8px',
      overflow: 'hidden',
      boxShadow: 'var(--shadow-md)',
      border: item.rank <= 3 ? `2px solid ${rankColors[item.rank]}` : '1px solid var(--border-color)',
      cursor: 'pointer',
      transition: 'background-color 0.2s',
      position: 'relative'
    }}
    onClick={(e) => {
      // 投稿者リンクなどの子要素のクリックは除外
      if ((e.target as HTMLElement).closest('a')) return;
      window.open(`https://www.nicovideo.jp/watch/${item.id}`, '_blank');
    }}
    onMouseEnter={(e) => {
      e.currentTarget.style.backgroundColor = 'var(--surface-hover)';
    }}
    onMouseLeave={(e) => {
      e.currentTarget.style.backgroundColor = 'var(--surface-color)';
    }}
    >
      <div style={{ padding: '6px' }}>
        {/* メインコンテンツ行 */}
        <div style={{ display: 'flex', gap: '12px', alignItems: 'flex-start' }}>
          {/* ランク */}
          <div style={{ 
            ...getRankStyle(item.rank, false),
            borderRadius: '6px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            flexShrink: 0,
            userSelect: 'none',
            WebkitUserSelect: 'none',
            MozUserSelect: 'none',
            msUserSelect: 'none'
          }}>
            {item.rank}
          </div>
          
          {/* サムネイル */}
          {item.thumbURL && (
            <div style={{ flexShrink: 0 }}>
              <a
                href={`https://www.nicovideo.jp/watch/${item.id}`}
                target="_blank"
                rel="noopener noreferrer"
                onClick={(e) => {
                  // 別タブで開くため、スクロール位置保存は不要
                }}
                style={{ display: 'block', cursor: 'pointer' }}
              >
                <OptimizedImage
                  src={item.thumbURL}
                  alt={item.title}
                  width={160}
                  height={90}
                  style={{ 
                    objectFit: 'cover',
                    borderRadius: '6px'
                  }}
                  loading={item.rank <= 3 ? undefined : "lazy"}
                  priority={item.rank <= 3}
                />
              </a>
            </div>
          )}
          
          {/* コンテンツ */}
          <div style={{ 
            flex: 1, 
            minWidth: 0,
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'center',
            minHeight: '70px'
          }}>
            <div>
              {/* タイトル */}
              <a
                href={`https://www.nicovideo.jp/watch/${item.id}`}
                target="_blank"
                rel="noopener noreferrer"
                onClick={(e) => {
                  // 別タブで開くため、スクロール位置保存は不要
                }}
                className="ranking-video-link ranking-video-link--desktop"
              >
                {item.title}
              </a>
              
              {/* 投稿者情報 */}
              {(item.authorName || item.authorId) && (
                <div style={{ 
                  display: 'flex', 
                  alignItems: 'center', 
                  gap: '8px',
                  marginBottom: '8px'
                }}>
                  <a
                    href={item.authorId?.startsWith('channel/') 
                      ? `https://ch.nicovideo.jp/${item.authorId.replace('channel/', '')}`
                      : item.authorId?.startsWith('community/') 
                      ? `https://com.nicovideo.jp/${item.authorId.replace('community/', '')}`
                      : `https://www.nicovideo.jp/user/${item.authorId}`
                    }
                    target="_blank"
                    rel="noopener noreferrer"
                    onClick={(e) => e.stopPropagation()}
                    style={{ 
                      display: 'flex',
                      alignItems: 'center',
                      gap: '8px',
                      color: 'var(--text-secondary)',
                      textDecoration: 'none',
                      fontSize: '14px',
                      fontWeight: '500',
                      padding: '4px 8px',
                      margin: '-4px -8px',
                      borderRadius: '6px',
                      transition: 'background-color 0.2s'
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.backgroundColor = 'var(--surface-hover)'
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.backgroundColor = 'transparent'
                    }}
                  >
                    {item.authorIcon && (
                      <OptimizedImage
                        src={item.authorIcon}
                        alt={item.authorName || ''}
                        width={24}
                        height={24}
                        style={{ 
                          borderRadius: '50%',
                          border: '1px solid var(--border-color)'
                        }}
                      />
                    )}
                    <span>{item.authorName || item.authorId}</span>
                  </a>
                  {dateDisplay && (
                    <span style={{ 
                      fontSize: '13px',
                      color: isNew ? 'var(--error-color)' : 'var(--text-secondary)',
                      fontWeight: isNew ? '600' : '400'
                    }}>
                      {dateDisplay}
                    </span>
                  )}
                </div>
              )}
              
              {/* 統計情報 */}
              <div style={{ 
                display: 'flex', 
                gap: '12px', 
                fontSize: '14px', 
                flexWrap: 'wrap', 
                alignItems: 'center',
                userSelect: 'none',
                WebkitUserSelect: 'none',
                MozUserSelect: 'none',
                msUserSelect: 'none'
              }}>
              <span style={{ color: 'var(--text-secondary)' }}>
                ▶️ {formatNumberMobile(item.views)}
              </span>
              {item.comments !== undefined && (
                <span style={{ color: 'var(--text-secondary)' }}>
                  💬 {formatNumberMobile(item.comments)}
                </span>
              )}
              {item.likes !== undefined && (
                <span style={{ color: 'var(--text-secondary)' }}>
                  ❤️ {formatNumberMobile(item.likes)}
                </span>
              )}
              {item.mylists !== undefined && (
                <span style={{ color: 'var(--text-secondary)' }}>
                  📁 {formatNumberMobile(item.mylists)}
                </span>
              )}
            </div>
            </div>
          </div>
        </div>
      </div>
      
      {/* マイリストボタン */}
      <MylistButton video={item} />
    </li>
  )
}, (prevProps, nextProps) => {
  // カスタム比較関数：itemのIDが同じでisMobileが同じなら再レンダリングしない
  return prevProps.item.id === nextProps.item.id && 
         prevProps.isMobile === nextProps.isMobile &&
         prevProps.item.views === nextProps.item.views &&
         prevProps.item.comments === nextProps.item.comments &&
         prevProps.item.mylists === nextProps.item.mylists &&
         prevProps.item.likes === nextProps.item.likes
})

export default RankingItemComponent