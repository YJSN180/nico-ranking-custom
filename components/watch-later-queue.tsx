'use client'

import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { OptimizedImage } from './optimized-image'
import { useWatchLater } from '@/hooks/use-watch-later'
import { useWatchLaterQueueActions } from '@/hooks/use-watch-later-queue-actions'
import type { WatchLaterItem } from '@/lib/watch-later'
import './watch-later-queue.css'

const WATCH_LATER_PANEL_ID = 'watch-later-queue-panel'

function WatchLaterItemRow({
  item,
  onOpen,
  onOpenAndRemove,
  onRemove,
}: {
  item: WatchLaterItem
  onOpen: (item: WatchLaterItem) => void
  onOpenAndRemove: (item: WatchLaterItem) => void
  onRemove: (id: string) => void
}) {
  return (
    <li className="watch-later-queue__item">
      {item.thumbURL ? (
        <OptimizedImage
          className="watch-later-queue__thumbnail"
          src={item.thumbURL}
          alt=""
          width={96}
          height={54}
          loading="lazy"
        />
      ) : (
        <div className="watch-later-queue__thumbnail watch-later-queue__thumbnail--empty" />
      )}
      <div className="watch-later-queue__meta">
        <div className="watch-later-queue__title" title={item.title}>
          {item.title}
        </div>
        <div className="watch-later-queue__subline">
          {item.authorName || item.id}
          {item.openedAt ? ' / 開封済み' : ''}
        </div>
        <div className="watch-later-queue__actions">
          <button type="button" onClick={() => onOpen(item)}>
            開く
          </button>
          <button type="button" onClick={() => onOpenAndRemove(item)}>
            開いて削除
          </button>
          <button type="button" onClick={() => onRemove(item.id)}>
            削除
          </button>
        </div>
      </div>
    </li>
  )
}

export function WatchLaterQueue() {
  const { items, count, removeItem, clearItems, markOpened } = useWatchLater()
  const {
    message,
    openItem,
    openAndRemove,
    openFirst,
    copyAllUrls,
    clearItems: clearQueuedItems,
  } = useWatchLaterQueueActions({
    items,
    removeItem,
    clearItems,
    markOpened,
  })
  const [isOpen, setIsOpen] = useState(false)
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    setMounted(true)
  }, [])

  useEffect(() => {
    if (!isOpen) return

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setIsOpen(false)
      }
    }

    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [isOpen])

  const layer = isOpen ? (
    <div className="watch-later-queue__layer" role="presentation">
      <button
        type="button"
        className="watch-later-queue__backdrop"
        aria-label="あとで見るを閉じる"
        onClick={() => setIsOpen(false)}
      />
      <aside
        id={WATCH_LATER_PANEL_ID}
        className="watch-later-queue__panel"
        aria-label="あとで見る"
        aria-live="polite"
      >
        <header className="watch-later-queue__header">
          <div>
            <h2>あとで見る</h2>
            <p>{count}件の動画</p>
          </div>
          <button
            type="button"
            className="watch-later-queue__close"
            aria-label="閉じる"
            onClick={() => setIsOpen(false)}
          >
            ×
          </button>
        </header>

        {message && <div className="watch-later-queue__message">{message}</div>}

        {items.length > 0 ? (
          <ul className="watch-later-queue__list">
            {items.map((item) => (
              <WatchLaterItemRow
                key={item.id}
                item={item}
                onOpen={openItem}
                onOpenAndRemove={openAndRemove}
                onRemove={removeItem}
              />
            ))}
          </ul>
        ) : (
          <div className="watch-later-queue__empty">
            右クリックまたは長押しから動画を追加できます。
          </div>
        )}

        <footer className="watch-later-queue__footer">
          <button
            type="button"
            onClick={openFirst}
            disabled={items.length === 0}
          >
            上から順に開く
          </button>
          <button
            type="button"
            onClick={copyAllUrls}
            disabled={items.length === 0}
          >
            URLをまとめてコピー
          </button>
          <button
            type="button"
            onClick={clearQueuedItems}
            disabled={items.length === 0}
          >
            すべて削除
          </button>
        </footer>
      </aside>
    </div>
  ) : null

  return (
    <>
      <button
        type="button"
        className="watch-later-queue__button"
        aria-label={`あとで見る ${count}件`}
        aria-expanded={isOpen}
        aria-controls={WATCH_LATER_PANEL_ID}
        onClick={() => setIsOpen(true)}
      >
        <span className="watch-later-queue__button-text watch-later-queue__button-text--desktop">
          あとで見る
        </span>
        <span className="watch-later-queue__button-text watch-later-queue__button-text--mobile">
          あと
        </span>
        <span className="watch-later-queue__count">{count}</span>
      </button>

      {mounted && layer ? createPortal(layer, document.body) : null}
    </>
  )
}
