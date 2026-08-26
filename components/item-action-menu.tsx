'use client'

import { useState, useRef, useEffect, useCallback } from 'react'
import { MylistButton } from './mylist-button'
import { QuickNGButton } from './quick-ng-button'
import type { NGType } from './quick-ng-button'
import type { RankingItem } from '@/types/ranking'
import './item-action-menu.css'

interface ItemActionMenuProps {
  video: RankingItem
  disabled?: boolean
  onNGAdded?: (type: NGType, value: string | string[]) => void
}

// モバイル用の3点ドットメニュー
// マイリスト追加・NG設定をひとつのメニューに集約する
export function ItemActionMenu({ video, disabled = false, onNGAdded }: ItemActionMenuProps) {
  const [isOpen, setIsOpen] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)

  const close = useCallback(() => setIsOpen(false), [])

  // 外側タップ・ESC で閉じる（NGポップオーバー・マイリストモーダル内の操作は除外）
  useEffect(() => {
    if (!isOpen) return

    const handleOutside = (event: MouseEvent | TouchEvent) => {
      const target = event.target as HTMLElement | null
      if (!target) return
      if (containerRef.current?.contains(target)) return
      if (
        target.closest(
          '[data-testid="ng-popover"], [data-testid="mylist-modal"], [data-testid="modal-overlay"]'
        )
      ) {
        return
      }
      close()
    }
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') close()
    }

    document.addEventListener('click', handleOutside)
    document.addEventListener('keydown', handleKeyDown)
    return () => {
      document.removeEventListener('click', handleOutside)
      document.removeEventListener('keydown', handleKeyDown)
    }
  }, [isOpen, close])

  return (
    <div ref={containerRef} className="item-action-menu">
      <button
        type="button"
        className="item-action-menu__trigger"
        aria-label="その他の操作"
        aria-haspopup="menu"
        aria-expanded={isOpen}
        disabled={disabled}
        onClick={(e) => {
          e.stopPropagation()
          setIsOpen((prev) => !prev)
        }}
        onTouchStart={(e) => e.stopPropagation()}
        onTouchEnd={(e) => e.stopPropagation()}
      >
        <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
          <circle cx="12" cy="5" r="2" />
          <circle cx="12" cy="12" r="2" />
          <circle cx="12" cy="19" r="2" />
        </svg>
      </button>

      {isOpen && (
        <div className="item-action-menu__dropdown" role="menu">
          <MylistButton video={video} asMenuItem />
          <QuickNGButton
            video={video}
            disabled={disabled}
            asMenuItem
            onNGAdded={(type, value) => {
              onNGAdded?.(type, value)
              close()
            }}
          />
        </div>
      )}
    </div>
  )
}
