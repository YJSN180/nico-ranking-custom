'use client'

import { useState, useRef, useEffect, useCallback } from 'react'
import { PopoverNGSelector } from './popover-ng-selector'
import type { RankingItem } from '@/types/ranking'
import './quick-ng-button.css'

export type NGType = 'videoId' | 'title' | 'author' | 'authorId' | 'tags'

interface QuickNGButtonProps {
  video: RankingItem
  disabled?: boolean
  className?: string
  onNGAdded?: (type: NGType, value: string | string[]) => void
  /** 3点メニュー内の行として表示する（モバイル用） */
  asMenuItem?: boolean
}

export function QuickNGButton({
  video,
  disabled = false,
  className = '',
  onNGAdded,
  asMenuItem = false
}: QuickNGButtonProps) {
  const [isPopoverOpen, setIsPopoverOpen] = useState(false)
  const buttonRef = useRef<HTMLButtonElement>(null)

  // ポップオーバーを開く
  const handleOpenPopover = useCallback(() => {
    if (disabled) return
    setIsPopoverOpen(true)
  }, [disabled])

  // ポップオーバーを閉じる
  const handleClosePopover = useCallback(() => {
    setIsPopoverOpen(false)
  }, [])

  // NG追加処理
  const handleNGAdd = useCallback((type: NGType, values: string | string[]) => {
    onNGAdded?.(type, values)
    setIsPopoverOpen(false)
  }, [onNGAdded])

  // ESCキーでポップオーバーを閉じる
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && isPopoverOpen) {
        handleClosePopover()
      }
    }

    if (isPopoverOpen) {
      document.addEventListener('keydown', handleKeyDown)
      return () => document.removeEventListener('keydown', handleKeyDown)
    }
  }, [isPopoverOpen, handleClosePopover])

  // 外部クリックでポップオーバーを閉じる
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        isPopoverOpen &&
        buttonRef.current &&
        !buttonRef.current.contains(event.target as Node)
      ) {
        // ポップオーバー内のクリックは除外（PopoverNGSelector内で処理）
        const popoverElement = document.querySelector('[data-testid="ng-popover"]')
        if (popoverElement && popoverElement.contains(event.target as Node)) {
          return
        }
        handleClosePopover()
      }
    }

    if (isPopoverOpen) {
      document.addEventListener('click', handleClickOutside)
      return () => document.removeEventListener('click', handleClickOutside)
    }
  }, [isPopoverOpen, handleClosePopover])

  return (
    <div className={asMenuItem ? undefined : 'quick-ng-button-container'}>
      <button
        ref={buttonRef}
        className={
          asMenuItem
            ? 'item-action-menu__item'
            : `quick-ng-button ${disabled ? 'quick-ng-button--disabled' : ''} ${className}`
        }
        disabled={disabled}
        onClick={handleOpenPopover}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault()
            handleOpenPopover()
          }
        }}
        aria-label="NG追加"
        aria-haspopup="true"
        aria-expanded={isPopoverOpen}
        title="この動画をNGリストに追加"
      >
        {asMenuItem ? (
          <>
            <span aria-hidden="true">🚫</span>
            NG設定
          </>
        ) : (
          <span className="quick-ng-button__icon">🚫</span>
        )}
      </button>

      <PopoverNGSelector
        video={video}
        isOpen={isPopoverOpen}
        anchorRef={buttonRef}
        onClose={handleClosePopover}
        onAdd={handleNGAdd}
      />
    </div>
  )
}