'use client'

import Image from 'next/image'
import { ViewIcon, CommentIcon, MylistIcon, LikeIcon } from '@/components/icons'
import { formatRegisteredDate, isWithin24Hours } from '@/lib/date-utils'
import type { RankingItem } from '@/types/ranking'

interface RankingItemProps {
  item: RankingItem
}

// コメント時刻をフォーマット
function formatCommentTime(postedAt: string): string {
  const now = new Date()
  const commentTime = new Date(postedAt)
  const diffMs = now.getTime() - commentTime.getTime()
  const diffMinutes = Math.floor(diffMs / (1000 * 60))
  
  if (diffMinutes < 60) {
    return `${diffMinutes}分前`
  }
  
  const diffHours = Math.floor(diffMinutes / 60)
  if (diffHours < 24) {
    return `${diffHours}時間前`
  }
  
  const diffDays = Math.floor(diffHours / 24)
  return `${diffDays}日前`
}

export default function RankingItemComponent({ item }: RankingItemProps) {
  const rankColors: Record<number, string> = {
    1: '#FFD700', // Gold
    2: '#C0C0C0', // Silver
    3: '#CD7F32'  // Bronze
  }
  
  const getRankStyle = (rank: number) => {
    if (rank <= 3) {
      return {
        background: rankColors[rank] || '#f5f5f5',
        color: 'white',
        fontSize: '32px', // 18px → 32px
        fontWeight: '800' as const,
        minWidth: '56px', // 40px → 56px
        height: '56px' // 40px → 56px
      }
    }
    return {
      background: '#f5f5f5',
      color: '#333',
      fontSize: '24px', // 14px → 24px
      fontWeight: '700' as const,
      minWidth: '44px', // 32px → 44px
      height: '44px' // 32px → 44px
    }
  }

  const isNew = isWithin24Hours(item.registeredAt)
  const dateDisplay = formatRegisteredDate(item.registeredAt)

  return (
    <li style={{ 
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
            ...getRankStyle(item.rank),
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
              target="_blank"
              rel="noopener noreferrer"
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
                  target="_blank"
                  rel="noopener noreferrer"
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
              <div style={{ display: 'flex', alignItems: 'center', gap: '4px', color: '#666' }}>
                <ViewIcon style={{ width: '14px', height: '14px' }} />
                <span>{item.views.toLocaleString()} 回再生</span>
              </div>
              {item.comments !== undefined && (
                <div style={{ display: 'flex', alignItems: 'center', gap: '4px', color: '#666' }}>
                  <CommentIcon style={{ width: '14px', height: '14px' }} />
                  <span>{item.comments.toLocaleString()}</span>
                </div>
              )}
              {item.mylists !== undefined && (
                <div style={{ display: 'flex', alignItems: 'center', gap: '4px', color: '#666' }}>
                  <MylistIcon style={{ width: '14px', height: '14px' }} />
                  <span>{item.mylists.toLocaleString()}</span>
                </div>
              )}
              {item.likes !== undefined && (
                <div style={{ display: 'flex', alignItems: 'center', gap: '4px', color: '#666' }}>
                  <LikeIcon style={{ width: '14px', height: '14px' }} />
                  <span>{item.likes.toLocaleString()}</span>
                </div>
              )}
            </div>
            
            {/* 最新コメント */}
            {item.latestComment && (
              <div style={{ 
                marginTop: '8px',
                padding: '8px 12px',
                background: '#f5f5f5',
                borderRadius: '6px',
                fontSize: '13px',
                color: '#555',
                display: 'flex',
                alignItems: 'center',
                gap: '6px'
              }}>
                <span style={{ flexShrink: 0 }}>💬</span>
                <span style={{ 
                  flex: 1,
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap'
                }}>
                  {item.latestComment.body}
                </span>
                <span style={{ 
                  flexShrink: 0,
                  fontSize: '11px',
                  color: '#999'
                }}>
                  {formatCommentTime(item.latestComment.postedAt)}
                </span>
              </div>
            )}
          </div>
        </div>
      </div>
    </li>
  )
}