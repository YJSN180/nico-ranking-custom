'use client'

import { memo } from 'react'
import { OptimizedImage } from './optimized-image'
import { formatNumberMobile } from '@/lib/format-utils'
import type { MylistVideo } from '@/lib/storage/types'
import './mylist-video-item.css'

interface MylistVideoItemProps {
  video: MylistVideo
  rank: number // 互換性のため残すが使用しない
  onEdit: (video: MylistVideo) => void
  onRemove: (videoId: string) => void
  isDeleted?: boolean
  onImageError?: (videoId: string) => void
}

// ランキングリストと統一されたマイリスト動画アイテム
// Container Queriesとflexbox/gridを活用してレスポンシブ対応
const MylistVideoItem = memo(function MylistVideoItem({ 
  video, 
  rank, 
  onEdit, 
  onRemove,
  isDeleted = false,
  onImageError
}: MylistVideoItemProps) {
  // rank propは互換性のため受け取るが使用しない

  const formatDate = (timestamp: number) => {
    return new Date(timestamp).toLocaleDateString('ja-JP', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit'
    })
  }

  const formatRegisteredDate = (dateString: string) => {
    try {
      const date = new Date(dateString)
      return date.toLocaleDateString('ja-JP', {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit'
      })
    } catch {
      return '日付不明'
    }
  }

  return (
    <li 
      data-testid="mylist-video-item"
      className="mylist-video-item"
      style={{
        // Container Queries用のcontainment設定
        containerType: 'inline-size',
        background: 'var(--surface-color)',
        borderRadius: '8px',
        overflow: 'hidden',
        boxShadow: 'var(--shadow-md)',
        border: '1px solid var(--border-color)',
        marginBottom: '8px',
        cursor: 'pointer',
        transition: 'background-color 0.2s',
        position: 'relative'
      }}
      onClick={(e) => {
        // リンクやボタンのクリックは除外
        const target = e.target as HTMLElement;
        if (target.closest('a') || target.closest('button')) return;
        if (!isDeleted) {
          window.open(`https://www.nicovideo.jp/watch/${video.id}`, '_blank');
        }
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.backgroundColor = 'var(--surface-hover)';
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.backgroundColor = 'var(--surface-color)';
      }}
    >
      <div className="mylist-video-item__content">
        {/* サムネイル */}
        <div className="mylist-video-item__thumbnail">
          {isDeleted ? (
            <div style={{ display: 'block', cursor: 'default' }}>
              <OptimizedImage
                src={video.thumbURL}
                alt={video.title}
                width={160}
                height={90}
                style={{ 
                  objectFit: 'cover',
                  borderRadius: '4px',
                  width: '100%',
                  height: 'auto',
                  aspectRatio: '16 / 9',
                  opacity: 0.7
                }}
                onError={() => onImageError?.(video.id)}
              />
            </div>
          ) : (
            <a
              href={`https://www.nicovideo.jp/watch/${video.id}`}
              target="_blank"
              rel="noopener noreferrer"
              style={{ display: 'block', cursor: 'pointer' }}
            >
              <OptimizedImage
                src={video.thumbURL}
                alt={video.title}
                width={160}
                height={90}
                style={{ 
                  objectFit: 'cover',
                  borderRadius: '4px',
                  width: '100%',
                  height: 'auto',
                  aspectRatio: '16 / 9'
                }}
                onError={() => onImageError?.(video.id)}
              />
            </a>
          )}
          {/* 再生時間オーバーレイ（将来的に追加される可能性） */}
        </div>
        
        {/* コンテンツエリア */}
        <div className="mylist-video-item__details">
          {/* タイトル */}
          {isDeleted ? (
            <span className="mylist-video-item__title mylist-video-item__title--deleted">
              {video.title}
              <span className="mylist-video-item__deleted-badge">（削除済み）</span>
            </span>
          ) : (
            <a
              href={`https://www.nicovideo.jp/watch/${video.id}`}
              target="_blank"
              rel="noopener noreferrer"
              className="mylist-video-item__title"
              data-testid="video-title"
            >
              {video.title}
            </a>
          )}
          
          {/* 投稿者情報 */}
          {video.authorName && !isDeleted && (
            <div className="mylist-video-item__author">
              <a
                href={video.authorId ? `https://www.nicovideo.jp/user/${video.authorId}` : '#'}
                target="_blank"
                rel="noopener noreferrer"
                onClick={(e) => {
                  e.stopPropagation()
                  if (!video.authorId) e.preventDefault()
                }}
                style={{ 
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  textDecoration: 'none',
                  color: 'inherit',
                  padding: '4px 6px',
                  margin: '-4px -6px',
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
                {/* 投稿者アイコン */}
                {video.authorIcon && (
                  <OptimizedImage
                    src={video.authorIcon}
                    alt={`${video.authorName}のアイコン`}
                    width={24}
                    height={24}
                    style={{ 
                      borderRadius: '50%',
                      objectFit: 'cover',
                      flexShrink: 0
                    }}
                  />
                )}
                <div style={{ display: 'flex', flexDirection: 'column', minWidth: 0 }}>
                  <span className="mylist-video-item__author-name">
                    {video.authorName}
                  </span>
                  {/* 投稿日時 */}
                  {video.registeredAt && (
                    <span 
                      className="mylist-video-item__registered-date"
                      style={{
                        fontSize: '12px',
                        color: 'var(--text-muted)',
                        marginTop: '2px'
                      }}
                    >
                      投稿: {formatRegisteredDate(video.registeredAt)}
                    </span>
                  )}
                </div>
              </a>
            </div>
          )}
          
          {isDeleted && (
            <p className="mylist-video-item__deleted-message">
              この動画は削除されたか、非公開になっています
            </p>
          )}
          
          {/* 統計情報 */}
          <div 
            className="mylist-video-item__stats"
            data-testid="video-stats"
          >
            {video.views !== undefined && (
              <span className="mylist-video-item__stat">
                ▶️ {formatNumberMobile(video.views)}
              </span>
            )}
            {video.comments !== undefined && (
              <span className="mylist-video-item__stat">
                💬 {formatNumberMobile(video.comments || 0)}
              </span>
            )}
            {video.likes !== undefined && (
              <span className="mylist-video-item__stat">
                ❤️ {formatNumberMobile(video.likes || 0)}
              </span>
            )}
            {video.mylists !== undefined && (
              <span className="mylist-video-item__stat">
                📁 {formatNumberMobile(video.mylists || 0)}
              </span>
            )}
          </div>
          
          {/* メモ */}
          {video.memo && (
            <div className="mylist-video-item__memo">
              {video.memo}
            </div>
          )}
        </div>
        
        {/* アクションボタンエリア */}
        <div 
          className="mylist-video-item__actions"
          style={{
            gridColumn: '1 / -1',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            gap: '12px'
          }}
        >
          <span className="mylist-video-item__added-date">
            追加日: {formatDate(video.addedAt)}
          </span>
          <div style={{ display: 'flex', gap: '8px' }}>
            <button
              className="mylist-video-item__edit-button"
              onClick={(e) => {
                e.stopPropagation()
                onEdit(video)
              }}
            >
              編集
            </button>
            <button
              className="mylist-video-item__delete-button"
              onClick={(e) => {
                e.stopPropagation()
                onRemove(video.id)
              }}
              style={{
                backgroundColor: 'var(--danger-color, #dc3545)',
                color: 'white'
              }}
            >
              削除
            </button>
          </div>
        </div>
      </div>
    </li>
  )
}, (prevProps, nextProps) => {
  // メモ化の比較関数
  return (
    prevProps.video.id === nextProps.video.id &&
    prevProps.video.views === nextProps.video.views &&
    prevProps.video.comments === nextProps.video.comments &&
    prevProps.video.mylists === nextProps.video.mylists &&
    prevProps.video.likes === nextProps.video.likes &&
    prevProps.video.memo === nextProps.video.memo &&
    prevProps.video.authorIcon === nextProps.video.authorIcon &&
    prevProps.video.registeredAt === nextProps.video.registeredAt &&
    prevProps.isDeleted === nextProps.isDeleted &&
    prevProps.rank === nextProps.rank
  )
})

export { MylistVideoItem }