'use client'

import { memo } from 'react'
import { OptimizedImage } from './optimized-image'
import { formatNumberMobile, formatDuration } from '@/lib/format-utils'
import type { MylistVideo } from '@/lib/storage/types'
import './mylist-video-item.css'

interface MylistVideoItemProps {
  video: MylistVideo
  rank: number // 互換性のため残すが使用しない
  onEdit: (video: MylistVideo) => void
  onRemove: (videoId: string) => void
  onImageError?: (videoId: string) => void
}

// ランキングリストと統一されたマイリスト動画アイテム
// Container Queriesとflexbox/gridを活用してレスポンシブ対応
const MylistVideoItem = memo(function MylistVideoItem({ 
  video, 
  rank, 
  onEdit, 
  onRemove,
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
        window.open(`https://www.nicovideo.jp/watch/${video.id}`, '_blank');
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
          {/* 再生時間オーバーレイ */}
          {video.duration && (
            <div className="mylist-video-item__duration">
              {formatDuration(video.duration)}
            </div>
          )}
        </div>
        
        {/* コンテンツエリア */}
        <div className="mylist-video-item__details">
          {/* タイトル */}
          <a
            href={`https://www.nicovideo.jp/watch/${video.id}`}
            target="_blank"
            rel="noopener noreferrer"
            className="mylist-video-item__title"
            data-testid="video-title"
          >
            {video.title}
          </a>
          
          {/* 投稿者情報 - ランキング画面と同じ横並びレイアウト */}
          {video.authorName && (
            <div className="mylist-video-item__author" style={{
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              fontSize: '14px',
              color: 'var(--text-secondary)',
              marginBottom: '6px'
            }}>
              {/* 投稿者アイコン */}
              {video.authorIcon && (
                <OptimizedImage
                  src={video.authorIcon}
                  alt={`${video.authorName}のアイコン`}
                  width={18}
                  height={18}
                  sizes="18px"
                  style={{ 
                    borderRadius: '50%',
                    border: '1px solid var(--border-color)',
                    objectFit: 'cover',
                    flexShrink: 0
                  }}
                  onError={() => {
                    // アイコン読み込みエラー時はOptimizedImageの内部でhandleErrorが呼ばれる
                  }}
                />
              )}
              <a
                href={video.authorId ? `https://www.nicovideo.jp/user/${video.authorId}` : '#'}
                target="_blank"
                rel="noopener noreferrer"
                onClick={(e) => {
                  e.stopPropagation()
                  if (!video.authorId) e.preventDefault()
                }}
                className="mylist-video-item__author-name"
                style={{
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                  maxWidth: '200px',
                  textDecoration: 'none',
                  color: 'inherit'
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.textDecoration = 'underline'
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.textDecoration = 'none'
                }}
              >
                {video.authorName}
              </a>
              {/* 投稿日時を右側に配置 */}
              {video.registeredAt && (
                <>
                  <span className="mylist-video-item__separator" style={{ color: 'var(--text-secondary)' }}>
                    •
                  </span>
                  <span 
                    className="mylist-video-item__date"
                    style={{
                      flexShrink: 0,
                      fontSize: '13px'
                    }}
                  >
                    {formatRegisteredDate(video.registeredAt)}
                  </span>
                </>
              )}
            </div>
          )}
          
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
    prevProps.rank === nextProps.rank
  )
})

export { MylistVideoItem }