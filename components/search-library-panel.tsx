'use client'

import { BookmarkPlus, Plus, Undo2, X } from 'lucide-react'
import { useEffect, useRef } from 'react'
import type { SearchLibrary } from '@/hooks/use-search-library'
import { summarizeSearchQuery } from '@/lib/search/search-history'
import styles from './search-library-panel.module.css'

interface SearchLibraryPanelProps {
  library: SearchLibrary
  /** dropdown: 通常入力の検索欄の真下 / popover: 「履歴・保存」ボタンの下（スマホは下から出るシート） */
  variant: 'dropdown' | 'popover'
  /** 「今の条件を保存」。条件の組み立てと保存できるかの確認は検索画面が受け持つ */
  onSaveCurrent: () => void
  /** 一覧から選んだ検索をすぐ実行する */
  onRun: (query: string) => void
  /** 閉じる。true なら開いた場所（検索欄・ボタン）へフォーカスを戻す */
  onClose: (returnFocus: boolean) => void
  /** 一覧の先頭で上キーを押したとき（検索欄から開いたときは欄へ戻る） */
  onExitTop?: () => void
}

/** 「3分前」のような相対時刻。古いものは日付にする */
function formatAgo(iso: string, now: number): string {
  const at = Date.parse(iso)
  if (!Number.isFinite(at)) return ''
  const minutes = Math.floor((now - at) / 60000)
  if (minutes < 1) return 'たった今'
  if (minutes < 60) return `${minutes}分前`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}時間前`
  const days = Math.floor(hours / 24)
  if (days < 2) return '昨日'
  if (days < 7) return `${days}日前`
  return new Date(at).toLocaleDateString('ja-JP', {
    timeZone: 'Asia/Tokyo',
    month: 'numeric',
    day: 'numeric',
  })
}

/**
 * 保存した検索（名前のチップ）と最近の検索（一覧）を 1 か所にまとめたパネル。
 * 検索フォームの中に置くので、ボタンは type="button"、名前の入力の Enter はフォームを送らない
 */
export function SearchLibraryPanel({
  library,
  variant,
  onSaveCurrent,
  onRun,
  onClose,
  onExitTop,
}: SearchLibraryPanelProps) {
  const panelRef = useRef<HTMLDivElement>(null)
  const nameRef = useRef<HTMLInputElement>(null)
  const { history, saved, feedback, saving } = library
  const now = Date.now()

  // 保存の入力欄を開いたら名前を選択状態にする（DOM のフォーカス操作。開いたときだけ）
  const savingQuery = saving?.query
  useEffect(() => {
    if (!savingQuery) return
    nameRef.current?.focus()
    nameRef.current?.select()
  }, [savingQuery])

  /** 押したボタンが消える操作（削除・取り消し）のあとも、Escape や外側のクリックが効くようパネルにフォーカスを残す */
  const keepFocus = (action: () => void) => () => {
    action()
    panelRef.current?.focus({ preventScroll: true })
  }

  const handleKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (event.key === 'Escape') {
      event.preventDefault()
      event.stopPropagation()
      onClose(true)
      return
    }
    if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') return
    const items = Array.from(
      panelRef.current?.querySelectorAll<HTMLElement>('[data-library-item]') ??
        [],
    )
    const at = items.indexOf(document.activeElement as HTMLElement)
    if (at < 0) return
    event.preventDefault()
    if (event.key === 'ArrowUp' && at === 0) {
      onExitTop?.()
      return
    }
    const next = at + (event.key === 'ArrowDown' ? 1 : -1)
    items[Math.max(0, Math.min(items.length - 1, next))]?.focus()
  }

  return (
    <>
      {variant === 'popover' && (
        <div
          className={styles.scrim}
          aria-hidden="true"
          tabIndex={-1}
          onClick={() => onClose(true)}
        />
      )}
      <div
        ref={panelRef}
        className={`${styles.panel} ${styles[variant]}`}
        role="dialog"
        aria-label="履歴・保存"
        tabIndex={-1}
        onKeyDown={handleKeyDown}
      >
        <div className={styles.body}>
          <h2 className={styles.heading}>保存した検索</h2>
          <div className={styles.saved}>
            {saved.map((item) => (
              <span key={item.id} className={styles.savedChip}>
                <button
                  type="button"
                  data-library-item=""
                  className={styles.savedRun}
                  title={summarizeSearchQuery(item.query).title}
                  onClick={() => onRun(item.query)}
                >
                  {item.name}
                </button>
                <button
                  type="button"
                  className={styles.savedRemove}
                  aria-label={`保存した検索「${item.name}」を削除`}
                  onClick={keepFocus(() => library.removeSaved(item))}
                >
                  <X size={14} aria-hidden="true" />
                </button>
              </span>
            ))}
            {!saving && (
              <button
                type="button"
                data-library-item=""
                className={styles.saveCta}
                onClick={onSaveCurrent}
              >
                <Plus size={14} aria-hidden="true" />
                今の条件を保存
              </button>
            )}
          </div>
          {saving && (
            <div className={styles.saveForm}>
              <input
                ref={nameRef}
                type="text"
                className={styles.saveName}
                aria-label="保存する名前"
                maxLength={50}
                value={saving.name}
                onChange={(event) =>
                  library.setSaving({ ...saving, name: event.target.value })
                }
                onKeyDown={(event) => {
                  if (event.nativeEvent.isComposing || event.keyCode === 229)
                    return
                  if (event.key === 'Enter') {
                    event.preventDefault()
                    library.commitSaving(saving.name)
                  } else if (event.key === 'Escape') {
                    event.preventDefault()
                    event.stopPropagation()
                    library.setSaving(null)
                  }
                }}
              />
              <button
                type="button"
                className={styles.saveSubmit}
                disabled={!saving.name.trim()}
                onClick={() => library.commitSaving(saving.name)}
              >
                保存
              </button>
              <button
                type="button"
                className={styles.iconButton}
                aria-label="保存をやめる"
                onClick={keepFocus(() => library.setSaving(null))}
              >
                <X size={16} aria-hidden="true" />
              </button>
            </div>
          )}

          <h2 className={styles.heading}>最近の検索</h2>
          {history.entries.length === 0 ? (
            <p className={styles.empty}>
              {history.record
                ? '検索した条件がここに残ります。'
                : '履歴を残さない設定です。'}
            </p>
          ) : (
            <ul className={styles.list}>
              {history.entries.map((entry) => {
                const summary = summarizeSearchQuery(entry.query)
                return (
                  <li key={entry.id} className={styles.row}>
                    <button
                      type="button"
                      data-library-item=""
                      className={styles.pick}
                      title={summary.title}
                      onClick={() => onRun(entry.query)}
                    >
                      <span className={styles.title}>{summary.title}</span>
                      <span className={styles.meta}>
                        {[...summary.details, formatAgo(entry.searchedAt, now)]
                          .filter(Boolean)
                          .join(' · ')}
                      </span>
                    </button>
                    <button
                      type="button"
                      className={styles.iconButton}
                      aria-label={`「${summary.title}」を保存`}
                      onClick={() => library.startSaving(entry.query)}
                    >
                      <BookmarkPlus size={16} aria-hidden="true" />
                    </button>
                    <button
                      type="button"
                      className={styles.iconButton}
                      aria-label={`「${summary.title}」を履歴から削除`}
                      onClick={keepFocus(() =>
                        library.removeHistoryEntry(entry),
                      )}
                    >
                      <X size={16} aria-hidden="true" />
                    </button>
                  </li>
                )
              })}
            </ul>
          )}
        </div>

        {feedback && (
          <div
            className={`${styles.feedback}${feedback.tone === 'error' ? ` ${styles.error}` : ''}`}
            role={feedback.tone === 'error' ? 'alert' : 'status'}
          >
            <span>{feedback.message}</span>
            {feedback.undo && (
              <button
                type="button"
                className={styles.undo}
                onClick={keepFocus(feedback.undo)}
              >
                <Undo2 size={16} aria-hidden="true" />
                元に戻す
              </button>
            )}
          </div>
        )}

        <div className={styles.foot}>
          <label className={styles.switch}>
            <input
              type="checkbox"
              role="switch"
              checked={history.record}
              onChange={(event) => library.setRecording(event.target.checked)}
            />
            履歴を残す
          </label>
          <button
            type="button"
            className={styles.textButton}
            disabled={history.entries.length === 0}
            onClick={keepFocus(library.clearHistory)}
          >
            すべて削除
          </button>
        </div>
      </div>
    </>
  )
}
