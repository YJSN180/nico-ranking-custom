'use client'

import { memo } from 'react'
import { OptimizedImage } from './optimized-image'
import { MylistButton } from './mylist-button'
import { formatNumberMobile } from '@/lib/format-utils'
import type { WatchHistoryEntry } from '@/lib/storage/types'
import './mylist-video-item.css'

interface WatchHistoryVideoItemProps {
  video: WatchHistoryEntry
  onImageError?: (videoId: string) => void
}

// 視聴履歴専用の動画アイテム（マイリストフォーマットに統一）
// Container Queriesとflexbox/gridを活用してレスポンシブ対応
const WatchHistoryVideoItem = memo(function WatchHistoryVideoItem({ 
  video, 
  onImageError
}: WatchHistoryVideoItemProps) {

  const formatDate = (timestamp: number) => {
    return new Date(timestamp).toLocaleDateString('ja-JP', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit'
    })
  }

  const formatRegisteredDate = (dateString: string | undefined) => {
    if (!dateString) return '日付不明'
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

  // WatchHistoryEntryをRankingItem形式に変換してMylistButtonで使用
  const rankingItem = {
    id: video.videoId,
    rank: 1, // 未使用だが必須
    title: video.title,
    thumbURL: video.thumbURL,
    views: video.views || 0,
    comments: video.comments || 0,
    mylists: video.mylists || 0,
    likes: video.likes || 0,
    authorName: video.authorName,
    authorId: video.authorId,
    authorIcon: video.authorIcon,
    registeredAt: video.registeredAt
  }

  return (
    <li 
      data-testid="watch-history-video-item"
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
        window.open(`https://www.nicovideo.jp/watch/${video.videoId}`, '_blank');
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
            href={`https://www.nicovideo.jp/watch/${video.videoId}`}
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
              onError={() => onImageError?.(video.videoId)}
            />
          </a>
        </div>
        
        {/* コンテンツエリア */}
        <div className="mylist-video-item__details">
          {/* タイトル */}
          <a
            href={`https://www.nicovideo.jp/watch/${video.videoId}`}
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
                  width={20}
                  height={20}
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
          
          {/* 視聴履歴専用情報 */}
          <div className="mylist-video-item__watch-stats" style={{
            display: 'flex',
            gap: '12px',
            fontSize: '14px',
            color: 'var(--text-secondary)',
            marginBottom: '6px'
          }}>
            <span style={{ fontWeight: '600' }}>
              視聴回数: {video.watchCount}回
            </span>
            <span>
              最終視聴: {formatDate(video.watchedAt)}
            </span>
          </div>

          {/* 動画統計情報 */}
          {video.views !== undefined && (
            <div className="mylist-video-item__video-stats" style={{
              display: 'flex',
              gap: '12px',
              fontSize: '13px',
              color: 'var(--text-secondary)',
              marginBottom: '6px'
            }}>
              <span>再生: {formatNumberMobile(video.views)}</span>
              <span>コメント: {formatNumberMobile(video.comments || 0)}</span>
              <span>マイリスト: {formatNumberMobile(video.mylists || 0)}</span>
              {video.likes !== undefined && (
                <span>いいね: {formatNumberMobile(video.likes)}</span>
              )}
            </div>
          )}
        </div>
        
        {/* アクションボタンエリア */}
        <div 
          className="mylist-video-item__actions"
          style={{
            gridColumn: '1 / -1',
            display: 'flex',
            justifyContent: 'flex-end',
            alignItems: 'center',
            gap: '12px'
          }}
        >
          {/* MylistButtonコンポーネントを使用 */}
          <MylistButton video={rankingItem} />
        </div>
      </div>
    </li>
  )
}, (prevProps, nextProps) => {
  // メモ化の比較関数
  return (
    prevProps.video.videoId === nextProps.video.videoId &&
    prevProps.video.watchCount === nextProps.video.watchCount &&
    prevProps.video.watchedAt === nextProps.video.watchedAt &&
    prevProps.video.views === nextProps.video.views &&
    prevProps.video.comments === nextProps.video.comments &&
    prevProps.video.mylists === nextProps.video.mylists &&
    prevProps.video.likes === nextProps.video.likes &&
    prevProps.video.authorIcon === nextProps.video.authorIcon &&
    prevProps.video.registeredAt === nextProps.video.registeredAt
  )
})

export { WatchHistoryVideoItem }