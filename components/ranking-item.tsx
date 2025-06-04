'use client'

import { memo } from 'react'
import Image from 'next/image'
import { formatRegisteredDate, isWithin24Hours } from '@/lib/date-utils'
import { formatNumberMobile, formatTimeAgo } from '@/lib/format-utils'
import type { RankingItem } from '@/types/ranking'

interface RankingItemProps {
  item: RankingItem
  isMobile?: boolean
}

const RankingItemComponent = memo(function RankingItemComponent({ item, isMobile = false }: RankingItemProps) {
  const rankColors: Record<number, string> = {
    1: '#FFD700', // Gold
    2: '#C0C0C0', // Silver
    3: '#CD7F32'  // Bronze
  }
  
  const getRankStyle = (rank: number, mobile: boolean) => {
    if (mobile) {
      // モバイル用のコンパクトなスタイル
      return {
        background: rank <= 3 ? rankColors[rank] : '#f5f5f5',
        color: rank <= 3 ? 'white' : '#666',
        fontSize: '12px',
        fontWeight: '700' as const,
        minWidth: '20px',
        height: '20px',
        lineHeight: '20px'
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

  // モバイル用コンパクトレイアウト
  if (isMobile) {
    return (
      <li 
        data-testid="ranking-item"
        className="mobile-compact"
        style={{ 
          marginBottom: '2px',
          background: 'white',
          borderRadius: '4px',
          overflow: 'hidden',
          boxShadow: '0 1px 2px rgba(0, 0, 0, 0.05)',
          border: '1px solid #e5e5e5',
          height: '80px'
        }}>
        <div style={{ 
          display: 'flex', 
          gap: '6px', 
          alignItems: 'stretch', 
          height: '100%',
          padding: '4px'
        }}>
          {/* ランクバッジ */}
          <div style={{ 
            ...getRankStyle(item.rank, true),
            borderRadius: '4px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            flexShrink: 0,
            alignSelf: 'center'
          }}>
            {item.rank}
          </div>
          
          {/* サムネイル（中央配置） */}
          {item.thumbURL && (
            <div style={{ 
              flexShrink: 0,
              display: 'flex',
              alignItems: 'center',
              alignSelf: 'center'
            }}>
              <Image
                src={item.thumbURL}
                alt={item.title}
                width={80}
                height={45}
                style={{ 
                  objectFit: 'cover',
                  borderRadius: '3px'
                }}
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
            gap: '2px'
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
                fontSize: '12px',
                fontWeight: '600',
                lineHeight: '1.2',
                display: '-webkit-box',
                WebkitLineClamp: 2,
                WebkitBoxOrient: 'vertical',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                wordBreak: 'break-all'
              }}
            >
              {item.title}
            </a>
            
            {/* 投稿者情報と投稿日時 */}
            <div style={{ 
              display: 'flex',
              alignItems: 'center',
              gap: '3px',
              fontSize: '10px',
              color: '#666',
              marginTop: '0'
            }}>
              {/* 投稿者アイコン */}
              {item.authorIcon && (
                <Image
                  src={item.authorIcon}
                  alt={item.authorName || ''}
                  width={14}
                  height={14}
                  style={{ 
                    borderRadius: '50%',
                    border: '1px solid #e5e5e5',
                    flexShrink: 0
                  }}
                />
              )}
              {/* 投稿者名 */}
              {(item.authorName || item.authorId) && (
                <span style={{ 
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                  maxWidth: '80px'
                }}>
                  {item.authorName || item.authorId}
                </span>
              )}
              {/* 投稿日時 */}
              {dateDisplay && (
                <span style={{ 
                  flexShrink: 0,
                  color: isNew ? '#e74c3c' : '#999',
                  fontWeight: isNew ? '600' : '400',
                  marginLeft: 'auto',
                  fontSize: '9px'
                }}>
                  {dateDisplay}
                </span>
              )}
            </div>
            
            {/* 統計情報 */}
            <div 
              data-testid="video-stats"
              style={{ 
                fontSize: '9px',
                color: '#666',
                display: 'flex',
                alignItems: 'center',
                gap: '4px',
                marginTop: '0',
                flexWrap: 'nowrap',
                whiteSpace: 'nowrap'
              }}
            >
              <span style={{ flexShrink: 0 }}>👁{formatNumberMobile(item.views)}</span>
              <span style={{ flexShrink: 0 }}>💬{formatNumberMobile(item.comments || 0)}</span>
              <span style={{ flexShrink: 0 }}>📁{formatNumberMobile(item.mylists || 0)}</span>
              <span style={{ flexShrink: 0 }}>❤️{formatNumberMobile(item.likes || 0)}</span>
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
              />
            </div>
          )}
          
          {/* コンテンツ */}
          <div style={{ flex: 1, minWidth: 0 }}>
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
              alignItems: 'center',
              marginBottom: '8px'
            }}>
              <span style={{ color: '#666' }}>
                👁 {formatNumberMobile(item.views)}
              </span>
              {item.comments !== undefined && (
                <span style={{ color: '#666' }}>
                  💬 {formatNumberMobile(item.comments)}
                </span>
              )}
              {item.mylists !== undefined && (
                <span style={{ color: '#666' }}>
                  📁 {formatNumberMobile(item.mylists)}
                </span>
              )}
              {item.likes !== undefined && (
                <span style={{ color: '#666' }}>
                  ❤️ {formatNumberMobile(item.likes)}
                </span>
              )}
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