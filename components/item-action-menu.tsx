'use client'

import {
  useState,
  useRef,
  useEffect,
  useCallback,
  useId,
  useLayoutEffect,
} from 'react'
import { createPortal } from 'react-dom'
import {
  MoreVertical,
  Download,
  Link,
  Copy,
  Ban,
  ChevronLeft,
  Video,
  Type,
  User,
  Fingerprint,
} from 'lucide-react'
import { saveVideoThumbnail } from '@/lib/save-video-thumbnail'
import { showToast } from '@/lib/toast'
import { MylistButton } from './mylist-button'
import type { NGType } from './quick-ng-button'
import type { RankingItem } from '@/types/ranking'
import './item-action-menu.css'

interface ItemActionMenuProps {
  video: RankingItem
  disabled?: boolean
  mylistOnMobile?: boolean
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
  return (
    typeof window !== 'undefined' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches
  )
}

function getMenuItems(root: HTMLElement): HTMLElement[] {
  return Array.from(
    root.querySelectorAll<HTMLElement>('[role="menuitem"]'),
  ).filter((item) => {
    const group = item.closest('.item-action-menu__mylist')
    return (
      !item.hasAttribute('disabled') &&
      item.getAttribute('aria-disabled') !== 'true' &&
      (!group || getComputedStyle(group).display !== 'none')
    )
  })
}

// PC・モバイル共通の3点ドットメニュー
// マイリスト追加・NG設定をひとつのメニューに集約し、
// NG設定はボックスが連続変形（morph）して選択肢ビューに切り替わる
export function ItemActionMenu({
  video,
  disabled = false,
  mylistOnMobile = false,
  onNGAdded,
}: ItemActionMenuProps) {
  const [isOpen, setIsOpen] = useState(false)
  const [isClosing, setIsClosing] = useState(false)
  const closeTimer = useRef<ReturnType<typeof setTimeout>>()
  const boxAnimation = useRef<Animation | null>(null)
  const beforeSwitch = useRef<DOMRect | null>(null)
  const keyboardInput = useRef(false)
  const [saving, setSaving] = useState(false)
  const savingRef = useRef(false)
  const [view, setView] = useState<MenuView>('menu')
  const containerRef = useRef<HTMLDivElement>(null)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const dropdownRef = useRef<HTMLDivElement>(null)
  const pendingFocusRef = useRef<PendingFocus | null>(null)
  const menuId = useId()

  const close = useCallback((animate = true) => {
    if (dropdownRef.current?.contains(document.activeElement))
      triggerRef.current?.focus({ preventScroll: true })
    clearTimeout(closeTimer.current)
    boxAnimation.current?.cancel()
    if (animate && !keyboardInput.current && !prefersReducedMotion()) {
      setIsClosing(true)
      closeTimer.current = setTimeout(() => {
        setIsOpen(false)
        setIsClosing(false)
        setView('menu')
      }, 140)
    } else {
      setIsOpen(false)
      setIsClosing(false)
      setView('menu')
    }
  }, [])

  useEffect(
    () => () => {
      clearTimeout(closeTimer.current)
      boxAnimation.current?.cancel()
    },
    [],
  )

  const positionMenu = useCallback(() => {
    const box = dropdownRef.current
    const trigger = triggerRef.current
    if (!box || !trigger || boxAnimation.current?.playState === 'running') return
    const anchor = trigger.getBoundingClientRect()
    const width = box.offsetWidth
    const height = box.offsetHeight
    const viewport = window.visualViewport
    const left = viewport?.offsetLeft ?? 0
    const top = viewport?.offsetTop ?? 0
    const viewportWidth = viewport?.width ?? window.innerWidth
    const viewportHeight = viewport?.height ?? window.innerHeight
    box.style.left = `${Math.max(left + 8, Math.min(anchor.right - width, left + viewportWidth - width - 8))}px`
    const below = anchor.bottom + 6
    const above = anchor.top - height - 6
    const y =
      below + height <= top + viewportHeight - 8
        ? below
        : Math.max(top + 8, above)
    box.style.top = `${y}px`
    box.style.transformOrigin = y < anchor.top ? 'bottom right' : 'top right'
  }, [])

  useLayoutEffect(() => {
    if (!isOpen || isClosing) return
    const box = dropdownRef.current
    positionMenu()
    const from = beforeSwitch.current
    beforeSwitch.current = null
    if (
      from &&
      box &&
      box.animate &&
      !keyboardInput.current &&
      !prefersReducedMotion()
    ) {
      const to = box.getBoundingClientRect()
      boxAnimation.current = box.animate(
        [
          {
            width: `${from.width}px`,
            height: `${from.height}px`,
            top: `${from.top}px`,
          },
          {
            width: `${to.width}px`,
            height: `${to.height}px`,
            top: `${to.top}px`,
          },
        ],
        {
          duration: MORPH_DURATION_MS,
          easing: 'cubic-bezier(0.22, 1, 0.36, 1)',
        },
      )
      boxAnimation.current.onfinish = positionMenu
    }
  }, [isOpen, isClosing, view, positionMenu])

  useEffect(() => {
    if (!isOpen) return
    const observer =
      typeof ResizeObserver !== 'undefined'
        ? new ResizeObserver(positionMenu)
        : null
    if (dropdownRef.current?.firstElementChild)
      observer?.observe(dropdownRef.current.firstElementChild)
    window.addEventListener('resize', positionMenu)
    window.addEventListener('scroll', positionMenu, true)
    window.visualViewport?.addEventListener('resize', positionMenu)
    return () => {
      observer?.disconnect()
      window.removeEventListener('resize', positionMenu)
      window.removeEventListener('scroll', positionMenu, true)
      window.visualViewport?.removeEventListener('resize', positionMenu)
    }
  }, [isOpen, view, positionMenu])

  const copyText = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text)
      showToast('コピーしました', 'success')
      close()
    } catch {
      showToast('コピーできませんでした。もう一度お試しください', 'error')
    }
  }
  const saveThumbnail = async () => {
    if (savingRef.current) return
    savingRef.current = true
    setSaving(true)
    try {
      await saveVideoThumbnail(video)
      showToast('ダウンロードを開始しました', 'success')
      close()
    } catch {
      showToast('画像を取得できませんでした。もう一度お試しください', 'error')
    } finally {
      savingRef.current = false
      setSaving(false)
    }
  }

  // 表示されたビューの箱（key が違うのでビューごとに作り直される）に、予約したフォーカスを置く
  const focusPendingItem = useCallback((viewElement: HTMLDivElement | null) => {
    const pending = pendingFocusRef.current
    if (!viewElement || !pending) return
    pendingFocusRef.current = null
    const target =
      pending === 'ng-entry'
        ? viewElement.querySelector<HTMLElement>('[data-menu-ng-entry]')
        : getMenuItems(viewElement)[0]
    target?.focus({ preventScroll: true })
  }, [])

  // 進行中のサイズ変化も現在の実寸から引き継ぐ。
  const switchView = useCallback((next: MenuView) => {
    const box = dropdownRef.current
    beforeSwitch.current = box?.getBoundingClientRect() ?? null
    boxAnimation.current?.cancel()
    if (box?.contains(document.activeElement))
      pendingFocusRef.current = next === 'ng' ? 'first' : 'ng-entry'
    setView(next)
  }, [])

  // 外側タップ・ESC で閉じる（マイリストモーダル内の操作は除外）
  useEffect(() => {
    if (!isOpen) return

    const handleOutside = (event: MouseEvent | TouchEvent) => {
      const target = event.target as HTMLElement | null
      if (!target) return
      if (
        containerRef.current?.contains(target) ||
        dropdownRef.current?.contains(target)
      )
        return
      if (
        target.closest(
          '[data-testid="mylist-modal"], [data-testid="modal-overlay"]',
        )
      ) {
        return
      }
      close()
    }
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return
      // マイリストのダイアログ側でEscapeを処理する。
      if (
        (event.target as HTMLElement)?.closest(
          '[data-testid="mylist-modal"], [data-testid="modal-overlay"]',
        )
      )
        return
      keyboardInput.current = true
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
    keyboardInput.current = true
    if (event.key === 'Tab') {
      close(false)
      return
    }
    const items = getMenuItems(event.currentTarget)
    if (items.length === 0) return
    const current = items.indexOf(document.activeElement as HTMLElement)
    let next: number | null = null
    if (event.key === 'ArrowDown')
      next = current < 0 ? 0 : (current + 1) % items.length
    else if (event.key === 'ArrowUp')
      next =
        current < 0
          ? items.length - 1
          : (current - 1 + items.length) % items.length
    else if (event.key === 'Home') next = 0
    else if (event.key === 'End') next = items.length - 1
    if (next === null) return
    event.preventDefault()
    items[next].focus({ preventScroll: true })
  }

  const handleNGSelect = (type: NGType, value: string) => {
    if (!value) return
    onNGAdded?.(type, value)
    close(false)
  }

  return (
    <div ref={containerRef} className="item-action-menu">
      <button
        ref={triggerRef}
        type="button"
        className="item-action-menu__trigger"
        aria-label="その他の操作"
        aria-haspopup="menu"
        aria-expanded={isOpen && !isClosing}
        aria-controls={isOpen ? menuId : undefined}
        disabled={disabled}
        onClick={(e) => {
          e.stopPropagation()
          keyboardInput.current = e.detail === 0
          if (isOpen && !isClosing) {
            close()
            return
          }
          clearTimeout(closeTimer.current)
          setIsClosing(false)
          setView('menu')
          // キーボード（Enter / Space。click の detail が 0）で開いたときは先頭の項目へ。
          // タップやマウスでは動かさない（フォーカスリングを出さないため）
          if (!isOpen && e.detail === 0) {
            pendingFocusRef.current = 'first'
          }
          setIsOpen(true)
        }}
        onTouchStart={(e) => e.stopPropagation()}
        onTouchEnd={(e) => e.stopPropagation()}
      >
        <MoreVertical size={18} aria-hidden="true" />
      </button>

      {isOpen &&
        createPortal(
          // メニュー本体のクリック（見出し・余白・メニューから開いたモーダル等の portal を含む）は
          // 行まで伝えない。伝わると行のクリック処理で動画が新しいタブで開いてしまう
          <div
            ref={dropdownRef}
            id={menuId}
            className={`item-action-menu__dropdown${isClosing ? ' item-action-menu__dropdown--closing' : ''}${keyboardInput.current ? ' item-action-menu__dropdown--instant' : ''}`}
            aria-hidden={isClosing || undefined}
            role="menu"
            aria-label={VIEW_LABELS[view]}
            onClick={(e) => e.stopPropagation()}
            onKeyDown={handleMenuKeyDown}
            onPointerDown={() => {
              keyboardInput.current = false
            }}
          >
            {view === 'menu' ? (
              <div
                className="item-action-menu__view"
                key="menu"
                role="none"
                ref={focusPendingItem}
              >
                <div
                  className={
                    mylistOnMobile ? 'item-action-menu__mylist' : undefined
                  }
                  role="none"
                >
                  <MylistButton video={video} asMenuItem />
                </div>
                <button
                  type="button"
                  role="menuitem"
                  className="item-action-menu__item"
                  onClick={saveThumbnail}
                  aria-disabled={saving}
                >
                  <Download size={18} aria-hidden="true" />
                  {saving ? '画像を取得中…' : 'サムネイルを保存'}
                </button>
                <button
                  type="button"
                  role="menuitem"
                  className="item-action-menu__item"
                  onClick={() =>
                    copyText(`https://www.nicovideo.jp/watch/${video.id}`)
                  }
                >
                  <Link size={18} aria-hidden="true" />
                  URLをコピー
                </button>
                <button
                  type="button"
                  role="menuitem"
                  className="item-action-menu__item"
                  onClick={() => copyText(video.title)}
                >
                  <Copy size={18} aria-hidden="true" />
                  タイトルをコピー
                </button>
                <div className="item-action-menu__divider" role="separator" />
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
                  <Ban size={18} aria-hidden="true" />
                  NG設定
                </button>
              </div>
            ) : (
              <div
                className="item-action-menu__view"
                key="ng"
                role="none"
                ref={focusPendingItem}
              >
                <button
                  type="button"
                  role="menuitem"
                  className="item-action-menu__item item-action-menu__back"
                  onClick={(e) => {
                    e.stopPropagation()
                    switchView('menu')
                  }}
                >
                  <ChevronLeft size={18} aria-hidden="true" />
                  戻る
                </button>
                {/* 見出しはメニューの名前（aria-label）として読むので、ここは読み上げない */}
                <div
                  className="item-action-menu__section-label"
                  aria-hidden="true"
                >
                  {VIEW_LABELS.ng}
                </div>
                <button
                  type="button"
                  role="menuitem"
                  className="item-action-menu__item"
                  data-testid="menu-ng-video-id"
                  onClick={() => handleNGSelect('videoId', video.id)}
                >
                  <Video size={18} aria-hidden="true" />
                  <span className="item-action-menu__value">
                    動画ID: {video.id}
                  </span>
                </button>
                <button
                  type="button"
                  role="menuitem"
                  className="item-action-menu__item"
                  data-testid="menu-ng-title"
                  onClick={() => handleNGSelect('title', video.title)}
                >
                  <Type size={18} aria-hidden="true" />
                  <span className="item-action-menu__value">
                    タイトル: {video.title}
                  </span>
                </button>
                <button
                  type="button"
                  role="menuitem"
                  className="item-action-menu__item"
                  data-testid="menu-ng-author"
                  onClick={() =>
                    handleNGSelect(
                      'author',
                      video.authorName || video.authorId || '',
                    )
                  }
                >
                  <User size={18} aria-hidden="true" />
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
                    onClick={() =>
                      handleNGSelect('authorId', video.authorId ?? '')
                    }
                  >
                    <Fingerprint size={18} aria-hidden="true" />
                    <span className="item-action-menu__value">
                      投稿者ID: {video.authorId}
                    </span>
                  </button>
                )}
              </div>
            )}
          </div>,
          document.body,
        )}
    </div>
  )
}
