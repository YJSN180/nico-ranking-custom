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
    
    // 実際のサイズを取得するために少し遅延させる
    const calculatePosition = () => {
      if (!anchorRef.current || !popoverRef.current) return
      
      const anchor = anchorRef.current.getBoundingClientRect()
      const popover = popoverRef.current
      const popoverRect = popover.getBoundingClientRect()
      const viewport = {
        width: window.innerWidth,
        height: window.innerHeight
      }
      
      // モバイル判定
      const isMobile = viewport.width <= 480
      
      // 実際のポップオーバーサイズを使用（フォールバックあり）
      const actualWidth = popoverRect.width || (isMobile ? 240 : 300)
      const actualHeight = popoverRect.height || 250
      
      // モバイルでの最大幅制限（CSSと同じ計算式）
      const maxWidth = isMobile ? Math.min(260, viewport.width - 40) : 320
      const popoverWidth = Math.min(actualWidth, maxWidth)
      const popoverHeight = actualHeight
      
      const gap = 8 // アンカーとの間隔
      const safeArea = 10 // 画面端からの安全距離
      
      let top: number
      let left: number
      let transformOrigin = 'center bottom'
      let maxHeight: number | null = null
      
      // 垂直位置の決定（画面内に収まるように調整）
      const spaceAbove = anchor.top - safeArea
      const spaceBelow = viewport.height - anchor.bottom - safeArea
    
      if (spaceAbove >= popoverHeight + gap) {
        // 上に十分なスペースがある場合
        top = anchor.top - gap
        popover.style.transform = 'translateY(-100%)'
        transformOrigin = 'center bottom'
      } else if (spaceBelow >= popoverHeight + gap) {
        // 下に十分なスペースがある場合
        top = anchor.bottom + gap
        popover.style.transform = 'translateY(0)'
        transformOrigin = 'center top'
      } else {
        // どちらにも十分なスペースがない場合
        if (spaceAbove > spaceBelow) {
          // 上の方がスペースが多い
          top = safeArea
          maxHeight = spaceAbove - gap
          popover.style.transform = 'translateY(0)'
          transformOrigin = 'center bottom'
        } else {
          // 下の方がスペースが多い（または同じ）
          top = anchor.bottom + gap
          maxHeight = spaceBelow - gap
          popover.style.transform = 'translateY(0)'
          transformOrigin = 'center top'
        }
      }
    
      // 水平位置の決定（中央寄せ、画面端を考慮）
      const centerLeft = anchor.left + anchor.width / 2 - popoverWidth / 2
      
      if (centerLeft < safeArea) {
        // 左端に近すぎる場合は左寄せ
        left = safeArea
        transformOrigin = 'left ' + transformOrigin.split(' ')[1]
      } else if (centerLeft + popoverWidth > viewport.width - safeArea) {
        // 右端に近すぎる場合は右寄せ
        left = viewport.width - popoverWidth - safeArea
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
      
      // 幅制限を明示的に設定（モバイルでのはみ出し防止）
      if (isMobile) {
        popover.style.maxWidth = `${maxWidth}px`
      }
      
      // 高さ制限が必要な場合
      if (maxHeight !== null) {
        popover.style.maxHeight = `${maxHeight}px`
        popover.style.overflowY = 'auto'
      } else {
        popover.style.maxHeight = ''
        popover.style.overflowY = ''
      }
    }
    
    // requestAnimationFrameで次のフレームで位置計算を実行
    requestAnimationFrame(calculatePosition)
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

  const handleAuthorIdAdd = () => {
    onAdd('authorId', video.authorId || '')
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
            <span>投稿者名: {video.authorName || video.authorId}</span>
          </button>
          
          {video.authorId && (
            <button
              className="popover-ng-selector__option"
              onClick={handleAuthorIdAdd}
              data-testid="ng-author-id"
            >
              <span className="popover-ng-selector__icon">🆔</span>
              <span>投稿者ID: {video.authorId}</span>
            </button>
          )}
          
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