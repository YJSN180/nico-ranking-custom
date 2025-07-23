'use client'

import { useEffect, useRef } from 'react'
import type { RankingItem } from '@/types/ranking'
import type { NGType } from './quick-ng-button'
import './popover-ng-selector.css'

interface PopoverNGSelectorProps {
  video: RankingItem
  isOpen: boolean
  anchorRef: React.RefObject<HTMLElement>
  onClose: () => void
  onAdd: (type: NGType, values: string | string[]) => void
}

export function PopoverNGSelector({
  video,
  isOpen,
  anchorRef,
  onClose,
  onAdd
}: PopoverNGSelectorProps) {
  const popoverRef = useRef<HTMLDivElement>(null)

  // 位置計算（簡易版）
  useEffect(() => {
    if (isOpen && anchorRef.current && popoverRef.current) {
      const anchor = anchorRef.current.getBoundingClientRect()
      const popover = popoverRef.current
      
      // ボタンの上に表示（後で詳細な位置計算に置き換え）
      popover.style.position = 'fixed'
      popover.style.top = `${anchor.top - 10}px`
      popover.style.left = `${anchor.left}px`
      popover.style.transform = 'translateY(-100%)'
      popover.style.zIndex = '1000'
    }
  }, [isOpen, anchorRef])

  if (!isOpen) return null

  const handleVideoIdAdd = () => {
    onAdd('videoId', video.id)
  }

  const handleTitleAdd = () => {
    onAdd('title', video.title)
  }

  const handleAuthorAdd = () => {
    onAdd('author', video.authorName || video.authorId || '')
  }

  const handleTagsAdd = () => {
    // タグ選択の簡易実装（後で詳細実装に置き換え）
    const tags = video.tagDetails?.map(tag => tag.name) || video.tags || []
    if (tags.length > 0) {
      onAdd('tags', tags.slice(0, 1)) // 最初のタグのみ
    }
  }

  return (
    <div
      ref={popoverRef}
      className="popover-ng-selector"
      data-testid="ng-popover"
      role="dialog"
      aria-label="NGリスト追加オプション"
    >
      <div className="popover-ng-selector__content">
        <header className="popover-ng-selector__header">
          <h3>🚫 この動画をNGリストに追加</h3>
        </header>
        
        <div className="popover-ng-selector__options">
          <button
            className="popover-ng-selector__option"
            onClick={handleVideoIdAdd}
            data-testid="ng-video-id"
          >
            <span className="popover-ng-selector__icon">📹</span>
            <span>動画ID: {video.id}</span>
          </button>
          
          <button
            className="popover-ng-selector__option"
            onClick={handleTitleAdd}
            data-testid="ng-title"
          >
            <span className="popover-ng-selector__icon">📝</span>
            <span>タイトル: {video.title}</span>
          </button>
          
          <button
            className="popover-ng-selector__option"
            onClick={handleAuthorAdd}
            data-testid="ng-author"
          >
            <span className="popover-ng-selector__icon">👤</span>
            <span>投稿者: {video.authorName || video.authorId}</span>
          </button>
          
          <button
            className="popover-ng-selector__option"
            onClick={handleTagsAdd}
            data-testid="ng-tags"
          >
            <span className="popover-ng-selector__icon">🏷️</span>
            <span>タグから選択...</span>
          </button>
        </div>
        
        <div className="popover-ng-selector__actions">
          <button
            className="popover-ng-selector__close"
            onClick={onClose}
            data-testid="ng-close"
          >
            キャンセル
          </button>
        </div>
      </div>
    </div>
  )
}