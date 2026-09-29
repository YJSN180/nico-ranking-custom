'use client'

import { useState, useRef, useEffect, useCallback, useId } from 'react'
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

/** 次に表示するビューで、どの項目にフォーカスを置くか */
type PendingFocus = 'first' | 'ng-entry'

const MORPH_DURATION_MS = 220

const VIEW_LABELS: Record<MenuView, string> = {
  menu: 'その他の操作',
  ng: 'NGリストに追加',
}

function prefersReducedMotion(): boolean {
  return typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches
}

function getMenuItems(root: HTMLElement): HTMLElement[] {
  return Array.from(root.querySelectorAll<HTMLElement>('[role="menuitem"]')).filter(
    (item) => !item.hasAttribute('disabled') && item.getAttribute('aria-disabled') !== 'true'
  )
}

// モバイル用の3点ドットメニュー
// マイリスト追加・NG設定をひとつのメニューに集約し、
// NG設定はボックスが連続変形（morph）して選択肢ビューに切り替わる
export function ItemActionMenu({ video, disabled = false, onNGAdded }: ItemActionMenuProps) {
  const [isOpen, setIsOpen] = useState(false)
  const [view, setView] = useState<MenuView>('menu')
  const containerRef = useRef<HTMLDivElement>(null)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const dropdownRef = useRef<HTMLDivElement>(null)
  const pendingFocusRef = useRef<PendingFocus | null>(null)
  const menuId = useId()

  const close = useCallback(() => {
    // 中の項目ごと消えるので、フォーカスがメニューの中にあればトリガーへ戻す
    if (dropdownRef.current?.contains(document.activeElement)) {
      triggerRef.current?.focus()
    }
    setIsOpen(false)
    setView('menu')
  }, [])

  // 表示されたビューの箱（key が違うのでビューごとに作り直される）に、予約したフォーカスを置く
  const focusPendingItem = useCallback((viewElement: HTMLDivElement | null) => {
    const pending = pendingFocusRef.current
    if (!viewElement || !pending) return
    pendingFocusRef.current = null
    const target =
      pending === 'ng-entry'
        ? viewElement.querySelector<HTMLElement>('[data-menu-ng-entry]')
        : getMenuItems(viewElement)[0]
    target?.focus()
  }, [])

  // ビュー切替時にボックスの幅・高さを連続変形させる（FLIP）
  const switchView = useCallback((next: MenuView) => {
    const box = dropdownRef.current
    // フォーカスが中にあれば、切り替え後も中に留める（NG ビューは先頭へ、戻るときは NG設定 へ）
    if (box?.contains(document.activeElement)) {
      pendingFocusRef.current = next === 'ng' ? 'first' : 'ng-entry'
    }
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

  // メニュー内の移動（WAI-ARIA のメニューの操作: 上下の矢印・Home・End、端では反対側へ回る）
  const handleMenuKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    const items = getMenuItems(event.currentTarget)
    if (items.length === 0) return
    const current = items.indexOf(document.activeElement as HTMLElement)
    let next: number | null = null
    if (event.key === 'ArrowDown') next = current < 0 ? 0 : (current + 1) % items.length
    else if (event.key === 'ArrowUp') next = current < 0 ? items.length - 1 : (current - 1 + items.length) % items.length
    else if (event.key === 'Home') next = 0
    else if (event.key === 'End') next = items.length - 1
    if (next === null) return
    event.preventDefault()
    items[next].focus()
  }

  const handleNGSelect = (type: NGType, value: string) => {
    if (!value) return
    onNGAdded?.(type, value)
    close()
  }

  return (
    <div ref={containerRef} className="item-action-menu">
      <button
        ref={triggerRef}
        type="button"
        className="item-action-menu__trigger"
        aria-label="その他の操作"
        aria-haspopup="menu"
        aria-expanded={isOpen}
        aria-controls={isOpen ? menuId : undefined}
        disabled={disabled}
        onClick={(e) => {
          e.stopPropagation()
          setView('menu')
          // キーボード（Enter / Space。click の detail が 0）で開いたときは先頭の項目へ。
          // タップやマウスでは動かさない（フォーカスリングを出さないため）
          if (!isOpen && e.detail === 0) {
            pendingFocusRef.current = 'first'
          }
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
        // メニュー本体のクリック（見出し・余白・メニューから開いたモーダル等の portal を含む）は
        // 行まで伝えない。伝わると行のクリック処理で動画が新しいタブで開いてしまう
        <div
          ref={dropdownRef}
          id={menuId}
          className="item-action-menu__dropdown"
          role="menu"
          aria-label={VIEW_LABELS[view]}
          onClick={(e) => e.stopPropagation()}
          onKeyDown={handleMenuKeyDown}
        >
          {view === 'menu' ? (
            <div className="item-action-menu__view" key="menu" role="none" ref={focusPendingItem}>
              <MylistButton video={video} asMenuItem />
              <button
                type="button"
                role="menuitem"
                className="item-action-menu__item"
                aria-haspopup="menu"
                data-menu-ng-entry=""
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
            <div className="item-action-menu__view" key="ng" role="none" ref={focusPendingItem}>
              <button
                type="button"
                role="menuitem"
                className="item-action-menu__item item-action-menu__back"
                onClick={(e) => {
                  e.stopPropagation()
                  switchView('menu')
                }}
              >
                <span aria-hidden="true">‹</span>
                戻る
              </button>
              {/* 見出しはメニューの名前（aria-label）として読むので、ここは読み上げない */}
              <div className="item-action-menu__section-label" aria-hidden="true">
                {VIEW_LABELS.ng}
              </div>
              <button
                type="button"
                role="menuitem"
                className="item-action-menu__item"
                data-testid="menu-ng-video-id"
                onClick={() => handleNGSelect('videoId', video.id)}
              >
                <span aria-hidden="true">📹</span>
                <span className="item-action-menu__value">動画ID: {video.id}</span>
              </button>
              <button
                type="button"
                role="menuitem"
                className="item-action-menu__item"
                data-testid="menu-ng-title"
                onClick={() => handleNGSelect('title', video.title)}
              >
                <span aria-hidden="true">📝</span>
                <span className="item-action-menu__value">タイトル: {video.title}</span>
              </button>
              <button
                type="button"
                role="menuitem"
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
                  role="menuitem"
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
