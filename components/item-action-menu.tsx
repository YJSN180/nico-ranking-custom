'use client'

import { useState, useRef, useEffect, useCallback } from 'react'
import { MylistButton } from './mylist-button'
import type { NGType } from './quick-ng-button'
import type { RankingItem } from '@/types/ranking'
import './item-action-menu.css'

interface ItemActionMenuProps {
  video: RankingItem
  disabled?: boolean
  onNGAdded?: (type: NGType, value: string | string[]) => void
}

type MenuView = 'menu' | 'ng'

const MORPH_DURATION_MS = 220

function prefersReducedMotion(): boolean {
  return typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches
}

// モバイル用の3点ドットメニュー
// マイリスト追加・NG設定をひとつのメニューに集約し、
// NG設定はボックスが連続変形（morph）して選択肢ビューに切り替わる
export function ItemActionMenu({ video, disabled = false, onNGAdded }: ItemActionMenuProps) {
  const [isOpen, setIsOpen] = useState(false)
  const [view, setView] = useState<MenuView>('menu')
  const containerRef = useRef<HTMLDivElement>(null)
  const dropdownRef = useRef<HTMLDivElement>(null)

  const close = useCallback(() => {
    setIsOpen(false)
    setView('menu')
  }, [])

  // ビュー切替時にボックスの幅・高さを連続変形させる（FLIP）
  const switchView = useCallback((next: MenuView) => {
    const box = dropdownRef.current
    if (!box || prefersReducedMotion()) {
      setView(next)
      return
    }
    const from = box.getBoundingClientRect()
    setView(next)
    requestAnimationFrame(() => {
      const target = dropdownRef.current
      if (!target) return
      const to = target.getBoundingClientRect()
      if (Math.abs(from.height - to.height) < 1 && Math.abs(from.width - to.width) < 1) return
      target.style.width = `${from.width}px`
      target.style.height = `${from.height}px`
      target.style.overflow = 'hidden'
      requestAnimationFrame(() => {
        target.style.transition = `width ${MORPH_DURATION_MS}ms var(--ease-out, ease-out), height ${MORPH_DURATION_MS}ms var(--ease-out, ease-out)`
        target.style.width = `${to.width}px`
        target.style.height = `${to.height}px`
        setTimeout(() => {
          target.style.transition = ''
          target.style.width = ''
          target.style.height = ''
          target.style.overflow = ''
        }, MORPH_DURATION_MS)
      })
    })
  }, [])

  // 外側タップ・ESC で閉じる（マイリストモーダル内の操作は除外）
  useEffect(() => {
    if (!isOpen) return

    const handleOutside = (event: MouseEvent | TouchEvent) => {
      const target = event.target as HTMLElement | null
      if (!target) return
      if (containerRef.current?.contains(target)) return
      if (target.closest('[data-testid="mylist-modal"], [data-testid="modal-overlay"]')) {
        return
      }
      close()
    }
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return
      // NG選択ビューではまずメニューに戻る
      if (view === 'ng') {
        switchView('menu')
      } else {
        close()
      }
    }

    document.addEventListener('click', handleOutside)
    document.addEventListener('keydown', handleKeyDown)
    return () => {
      document.removeEventListener('click', handleOutside)
      document.removeEventListener('keydown', handleKeyDown)
    }
  }, [isOpen, view, close, switchView])

  const handleNGSelect = (type: NGType, value: string) => {
    if (!value) return
    onNGAdded?.(type, value)
    close()
  }

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
          setView('menu')
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
        <div ref={dropdownRef} className="item-action-menu__dropdown" role="menu">
          {view === 'menu' ? (
            <div className="item-action-menu__view" key="menu">
              <MylistButton video={video} asMenuItem />
              <button
                type="button"
                className="item-action-menu__item"
                aria-haspopup="menu"
                onClick={(e) => {
                  e.stopPropagation()
                  switchView('ng')
                }}
              >
                <span aria-hidden="true">🚫</span>
                NG設定
              </button>
            </div>
          ) : (
            <div className="item-action-menu__view" key="ng">
              <button
                type="button"
                className="item-action-menu__item item-action-menu__back"
                onClick={(e) => {
                  e.stopPropagation()
                  switchView('menu')
                }}
              >
                <span aria-hidden="true">‹</span>
                戻る
              </button>
              <div className="item-action-menu__section-label">NGリストに追加</div>
              <button
                type="button"
                className="item-action-menu__item"
                data-testid="menu-ng-video-id"
                onClick={() => handleNGSelect('videoId', video.id)}
              >
                <span aria-hidden="true">📹</span>
                <span className="item-action-menu__value">動画ID: {video.id}</span>
              </button>
              <button
                type="button"
                className="item-action-menu__item"
                data-testid="menu-ng-title"
                onClick={() => handleNGSelect('title', video.title)}
              >
                <span aria-hidden="true">📝</span>
                <span className="item-action-menu__value">タイトル: {video.title}</span>
              </button>
              <button
                type="button"
                className="item-action-menu__item"
                data-testid="menu-ng-author"
                onClick={() => handleNGSelect('author', video.authorName || video.authorId || '')}
              >
                <span aria-hidden="true">👤</span>
                <span className="item-action-menu__value">
                  投稿者名: {video.authorName || video.authorId}
                </span>
              </button>
              {video.authorId && (
                <button
                  type="button"
                  className="item-action-menu__item"
                  data-testid="menu-ng-author-id"
                  onClick={() => handleNGSelect('authorId', video.authorId ?? '')}
                >
                  <span aria-hidden="true">🆔</span>
                  <span className="item-action-menu__value">投稿者ID: {video.authorId}</span>
                </button>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
