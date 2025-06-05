'use client'

import { memo } from 'react'
import Image from 'next/image'
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
    1: '#FFD700', // Gold
    2: '#C0C0C0', // Silver
    3: '#CD7F32'  // Bronze
  }
  
  const getRankStyle = (rank: number, mobile: boolean) => {
    if (mobile) {
      // モバイル用のコンパクトなスタイル
      return {
        fontSize: '18px',
        fontWeight: '700' as const,
        color: rank <= 3 ? rankColors[rank] : '#333',
        marginBottom: '4px',
        height: '22px',
        display: 'flex',
        alignItems: 'center'
      }
    }
    
    // デスクトップ用の大きめのスタイル
    if (rank <= 3) {
      return {
        background: rankColors[rank] || '#f5f5f5',
        color: 'white',
        fontSize: '32px',
        fontWeight: '800' as const,
        minWidth: '56px',
        height: '56px'
      }
    }
    return {
      background: '#f5f5f5',
      color: '#333',
      fontSize: '24px',
      fontWeight: '700' as const,
      minWidth: '44px',
      height: '44px'
    }
  }

  const isNew = isWithin24Hours(item.registeredAt)
  const dateDisplay = isMobile ? formatTimeAgo(item.registeredAt) : formatRegisteredDate(item.registeredAt)

  // モバイル用新レイアウト（順位を上に配置）
  if (isMobile) {
    const timeDisplay = isVeryNarrow ? formatTimeCompact(dateDisplay) : dateDisplay
    
    return (
      <li 
        data-testid="ranking-item"
        className="mobile-v2"
        style={{ 
          marginBottom: '4px',
          background: 'white',
          borderRadius: '6px',
          overflow: 'hidden',
          boxShadow: '0 1px 2px rgba(0, 0, 0, 0.05)',
          border: '1px solid #e5e5e5'
        }}>
        <div style={{ padding: '6px 8px' }}>
          {/* メインコンテンツ */}
          <div style={{ display: 'flex', gap: '10px' }}>
            {/* 左側：順位 + サムネイル */}
            <div style={{ flexShrink: 0 }}>
              {/* 順位 */}
              <div style={{ ...getRankStyle(item.rank, true) }}>
                {item.rank}
              </div>
              
              {/* サムネイル */}
              {item.thumbURL && (
                <Image
                  src={item.thumbURL}
                  alt={item.title}
                  width={120}
                  height={67}
                  style={{ 
                    objectFit: 'cover',
                    borderRadius: '4px'
                  }}
                  loading="lazy"
                  priority={item.rank <= 3}
                />
              )}
            </div>
            
            {/* 右側：テキストエリア */}
            <div style={{ 
              flex: 1, 
              display: 'flex', 
              flexDirection: 'column', 
              gap: '4px',
              minWidth: 0,
              justifyContent: 'center'
            }}>
              {/* タイトル */}
              <a
                href={`https://www.nicovideo.jp/watch/${item.id}`}
                onClick={(e) => {
                  const event = new CustomEvent('saveRankingState')
                  window.dispatchEvent(event)
                }}
                data-testid="video-title"
                style={{ 
                  color: '#0066cc', 
                  textDecoration: 'none',
                  fontSize: '15px',
                  fontWeight: '600',
                  lineHeight: '1.3',
                  display: '-webkit-box',
                  WebkitLineClamp: 2,
                  WebkitBoxOrient: 'vertical',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  wordBreak: 'break-all',
                  minHeight: '39px'
                }}
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
                  color: '#666'
                }}>
                {/* 投稿者アイコン */}
                {item.authorIcon && (
                  <Image
                    src={item.authorIcon}
                    alt={item.authorName || ''}
                    width={16}
                    height={16}
                    style={{ 
                      borderRadius: '50%',
                      border: '1px solid #e5e5e5',
                      flexShrink: 0
                    }}
                    loading="lazy"
                  />
                )}
                {/* 投稿者名 */}
                {(item.authorName || item.authorId) && (
                  <span style={{ 
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                    maxWidth: isVeryNarrow ? '80px' : '100px'
                  }}>
                    {item.authorName || item.authorId}
                  </span>
                )}
                <span>·</span>
                {/* 投稿日時 */}
                <span style={{ 
                  flexShrink: 0,
                  color: isNew ? '#e74c3c' : '#999',
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
                  color: '#666',
                  display: 'flex',
                  gap: isVeryNarrow ? '4px' : '8px'
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
      </li>
    )
  }

  // デスクトップ用の既存レイアウト
  return (
    <li 
      data-testid="ranking-item"
      style={{ 
      marginBottom: '12px',
      background: 'white',
      borderRadius: '8px',
      overflow: 'hidden',
      boxShadow: '0 1px 3px rgba(0, 0, 0, 0.1)',
      border: item.rank <= 3 ? `2px solid ${rankColors[item.rank]}` : '1px solid #e5e5e5'
    }}>
      <div style={{ padding: '16px' }}>
        {/* メインコンテンツ行 */}
        <div style={{ display: 'flex', gap: '12px', alignItems: 'flex-start' }}>
          {/* ランク */}
          <div style={{ 
            ...getRankStyle(item.rank, false),
            borderRadius: '6px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            flexShrink: 0
          }}>
            {item.rank}
          </div>
          
          {/* サムネイル */}
          {item.thumbURL && (
            <div style={{ flexShrink: 0 }}>
              <Image
                src={item.thumbURL}
                alt={item.title}
                width={160}
                height={90}
                style={{ 
                  objectFit: 'cover',
                  borderRadius: '6px'
                }}
                loading="lazy"
                priority={item.rank <= 3}
              />
            </div>
          )}
          
          {/* コンテンツ */}
          <div style={{ 
            flex: 1, 
            minWidth: 0,
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'center',
            minHeight: '90px'
          }}>
            <div>
              {/* タイトル */}
              <a
                href={`https://www.nicovideo.jp/watch/${item.id}`}
                onClick={(e) => {
                  // 状態を保存してから遷移
                  const event = new CustomEvent('saveRankingState')
                  window.dispatchEvent(event)
                }}
                style={{ 
                  color: '#0066cc', 
                  textDecoration: 'none',
                  fontSize: '15px',
                  fontWeight: '600',
                  lineHeight: '1.4',
                  display: 'block',
                  marginBottom: '6px',
                  wordBreak: 'break-word'
                }}
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
                  {item.authorIcon && (
                    <Image
                      src={item.authorIcon}
                      alt={item.authorName || ''}
                      width={24}
                      height={24}
                      style={{ 
                        borderRadius: '50%',
                        border: '1px solid #e5e5e5'
                      }}
                    />
                  )}
                  <a
                    href={item.authorId?.startsWith('channel/') 
                      ? `https://ch.nicovideo.jp/${item.authorId.replace('channel/', '')}`
                      : item.authorId?.startsWith('community/') 
                      ? `https://com.nicovideo.jp/${item.authorId.replace('community/', '')}`
                      : `https://www.nicovideo.jp/user/${item.authorId}`
                    }
                    style={{ 
                      color: '#666',
                      textDecoration: 'none',
                      fontSize: '13px',
                      fontWeight: '500'
                    }}
                  >
                    {item.authorName || item.authorId}
                  </a>
                  {dateDisplay && (
                    <span style={{ 
                      fontSize: '12px',
                      color: isNew ? '#e74c3c' : '#999',
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
                fontSize: '12px', 
                flexWrap: 'wrap', 
                alignItems: 'center'
              }}>
              <span style={{ color: '#666' }}>
                ▶️ {formatNumberMobile(item.views)}
              </span>
              {item.comments !== undefined && (
                <span style={{ color: '#666' }}>
                  💬 {formatNumberMobile(item.comments)}
                </span>
              )}
              {item.likes !== undefined && (
                <span style={{ color: '#666' }}>
                  ❤️ {formatNumberMobile(item.likes)}
                </span>
              )}
              {item.mylists !== undefined && (
                <span style={{ color: '#666' }}>
                  📁 {formatNumberMobile(item.mylists)}
                </span>
              )}
            </div>
            </div>
          </div>
        </div>
      </div>
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