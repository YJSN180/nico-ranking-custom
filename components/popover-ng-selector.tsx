'use client'

import { useEffect, useRef, useState } from 'react'
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

  // 外部クリックとESCキーでのクローズ
  useEffect(() => {
    if (!isOpen) return

    const handleClickOutside = (event: MouseEvent) => {
      if (
        popoverRef.current && 
        !popoverRef.current.contains(event.target as Node) &&
        anchorRef.current &&
        !anchorRef.current.contains(event.target as Node)
      ) {
        onClose()
      }
    }

    const handleEscKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onClose()
      }
    }

    document.addEventListener('mousedown', handleClickOutside)
    document.addEventListener('keydown', handleEscKey)

    return () => {
      document.removeEventListener('mousedown', handleClickOutside)
      document.removeEventListener('keydown', handleEscKey)
    }
  }, [isOpen, onClose, anchorRef])

  // 動的位置計算（画面端対応）
  useEffect(() => {
    if (!isOpen || !anchorRef.current || !popoverRef.current) return
    
    const anchor = anchorRef.current.getBoundingClientRect()
    const popover = popoverRef.current
    const viewport = {
      width: window.innerWidth,
      height: window.innerHeight
    }
    
    // ポップオーバーの推定サイズ
    const popoverWidth = 300 // 最大幅
    const popoverHeight = 200 // 推定高さ
    const gap = 8 // アンカーとの間隔
    
    let top: number
    let left: number
    let transformOrigin = 'center bottom'
    
    // 垂直位置の決定（上が優先、スペースが足りなければ下）
    if (anchor.top - popoverHeight - gap >= 0) {
      // 上に表示
      top = anchor.top - gap
      popover.style.transform = 'translateY(-100%)'
      transformOrigin = 'center bottom'
    } else {
      // 下に表示
      top = anchor.bottom + gap
      popover.style.transform = 'translateY(0)'
      transformOrigin = 'center top'
    }
    
    // 水平位置の決定（中央寄せ、画面端を考慮）
    const centerLeft = anchor.left + anchor.width / 2 - popoverWidth / 2
    
    if (centerLeft < 10) {
      // 左端に近すぎる場合は左寄せ
      left = 10
      transformOrigin = 'left ' + transformOrigin.split(' ')[1]
    } else if (centerLeft + popoverWidth > viewport.width - 10) {
      // 右端に近すぎる場合は右寄せ
      left = viewport.width - popoverWidth - 10
      transformOrigin = 'right ' + transformOrigin.split(' ')[1]
    } else {
      // 中央寄せ
      left = centerLeft
    }
    
    // スタイル適用
    popover.style.position = 'fixed'
    popover.style.top = `${top}px`
    popover.style.left = `${left}px`
    popover.style.transformOrigin = transformOrigin
    popover.style.zIndex = '1000'
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