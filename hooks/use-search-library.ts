'use client'

import { useCallback, useEffect, useState } from 'react'
import { SEARCH_LIBRARY_CHANGE_EVENT } from '@/lib/search/library-events'
import {
  SAVED_SEARCHES_KEY,
  addSavedSearch,
  loadSavedSearches,
  persistSavedSearches,
  removeSavedSearch,
  restoreSavedSearch,
  SavedSearchError,
  type SavedSearch,
} from '@/lib/search/saved-searches'
import {
  EMPTY_SEARCH_HISTORY,
  SEARCH_HISTORY_KEY,
  SearchHistoryError,
  clearSearchHistory,
  loadSearchHistory,
  persistSearchHistory,
  recordSearch,
  removeSearchHistoryEntry,
  restoreSearchHistoryEntries,
  restoreSearchHistoryEntry,
  summarizeSearchQuery,
  type SearchHistory,
  type SearchHistoryEntry,
} from '@/lib/search/search-history'

export interface LibraryFeedback {
  message: string
  tone: 'info' | 'error'
  /** 削除の取り消し。次の操作まで同じ場所に出す */
  undo?: () => void
}

export interface SaveDraft {
  query: string
  name: string
}

const SAVE_EMPTY_MESSAGE =
  '保存する条件がありません。キーワードや詳細条件を指定してから保存してください。'

/** 保存名の初期値: 検索語の最初の語（無ければタグ条件）。保存した検索の既存の決め方に合わせる */
function defaultSaveName(query: string): string {
  const title = summarizeSearchQuery(query).title
  const first = (title.match(/-?"[^"]*"|\S+/u) ?? [''])[0]
    .replace(/^-/, '')
    .replace(/"/g, '')
  return first.slice(0, 50) || '無題の検索'
}

/**
 * 最近の検索（search-history）と保存した検索（saved-searches）を端末内で扱う。
 * どちらも保存できなければ成功にせず、削除は次の操作まで取り消せるようにする
 */
export function useSearchLibrary() {
  const [history, setHistory] = useState<SearchHistory>(EMPTY_SEARCH_HISTORY)
  const [saved, setSaved] = useState<SavedSearch[]>([])
  const [feedback, setFeedback] = useState<LibraryFeedback | null>(null)
  const [saving, setSaving] = useState<SaveDraft | null>(null)

  // localStorage（外部の保存先）から読み込む。サーバー描画と食い違わないよう、描画後に読む。
  // ほかのタブ（storage イベント）や同じタブの別の場所（統合バックアップの取り込み）で書き換えたら読み直す
  useEffect(() => {
    const reload = (key: string | null): void => {
      if (key === null || key === SEARCH_HISTORY_KEY) {
        setHistory(loadSearchHistory())
      }
      if (key === null || key === SAVED_SEARCHES_KEY) {
        setSaved(loadSavedSearches())
      }
    }
    reload(null)
    // key が null なのは保存先がまとめて消されたとき
    const onStorage = (event: StorageEvent): void => reload(event.key)
    const onChange = (event: Event): void =>
      reload(
        event instanceof CustomEvent && typeof event.detail === 'string'
          ? event.detail
          : null,
      )
    window.addEventListener('storage', onStorage)
    window.addEventListener(SEARCH_LIBRARY_CHANGE_EVENT, onChange)
    return () => {
      window.removeEventListener('storage', onStorage)
      window.removeEventListener(SEARCH_LIBRARY_CHANGE_EVENT, onChange)
    }
  }, [])

  const writeHistory = useCallback((next: SearchHistory): boolean => {
    try {
      persistSearchHistory(next)
      return true
    } catch (err) {
      if (!(err instanceof SearchHistoryError)) throw err
      setFeedback({ message: err.message, tone: 'error' })
      return false
    }
  }, [])

  const writeSaved = useCallback((next: SavedSearch[]): boolean => {
    try {
      persistSavedSearches(next)
      return true
    } catch (err) {
      if (!(err instanceof SavedSearchError)) throw err
      setFeedback({ message: err.message, tone: 'error' })
      return false
    }
  }, [])

  /**
   * 履歴を書き換える。いま保存されている最新の内容（ほかのタブの記録を含む）に変更を当ててから書くので、
   * 画面に残っている古い内容で上書きしない。保存できなければ null（呼び出し側は成功にしない）
   */
  const updateHistory = useCallback(
    (
      change: (current: SearchHistory) => SearchHistory,
    ): SearchHistory | null => {
      const current = loadSearchHistory()
      const next = change(current)
      if (next !== current && !writeHistory(next)) return null
      setHistory(next)
      return next
    },
    [writeHistory],
  )

  /** 保存した検索を書き換える（履歴と同じく、最新の内容に変更を当ててから書く） */
  const updateSaved = useCallback(
    (
      change: (current: SavedSearch[]) => SavedSearch[],
    ): SavedSearch[] | null => {
      const current = loadSavedSearches()
      const next = change(current)
      if (next !== current && !writeSaved(next)) return null
      setSaved(next)
      return next
    },
    [writeSaved],
  )

  /** 実行した検索を記録する（記録しない設定・空の条件は何もしない）。保存できなくても検索は続ける */
  const record = useCallback(
    (query: string) => {
      const current = loadSearchHistory()
      const next = recordSearch(current, query)
      if (next === current) return
      if (writeHistory(next)) {
        setHistory(next)
        return
      }
      // 保存できないときは、この画面の一覧にだけ残す（保存先から作り直すと、保存できなかった分が消える）
      setHistory((previous) => recordSearch(previous, query))
    },
    [writeHistory],
  )

  const removeHistoryEntry = useCallback(
    (entry: SearchHistoryEntry) => {
      let removedAt = -1
      const next = updateHistory((current) => {
        removedAt = current.entries.findIndex((e) => e.id === entry.id)
        return removeSearchHistoryEntry(current, entry.id)
      })
      if (!next) return
      setFeedback({
        message: `「${summarizeSearchQuery(entry.query).title}」を履歴から削除しました。`,
        tone: 'info',
        // 取り消しは消した 1 件だけを戻す（その間にほかのタブで記録したものを消さない）
        undo: () => {
          if (
            !updateHistory((current) =>
              restoreSearchHistoryEntry(current, entry, removedAt),
            )
          )
            return
          setFeedback(null)
        },
      })
    },
    [updateHistory],
  )

  const clearHistory = useCallback(() => {
    let cleared: SearchHistoryEntry[] = []
    const next = updateHistory((current) => {
      cleared = current.entries
      return current.entries.length === 0
        ? current
        : clearSearchHistory(current)
    })
    if (!next || cleared.length === 0) return
    setFeedback({
      message: '最近の検索をすべて削除しました。',
      tone: 'info',
      undo: () => {
        if (
          !updateHistory((current) =>
            restoreSearchHistoryEntries(current, cleared),
          )
        )
          return
        setFeedback(null)
      },
    })
  }, [updateHistory])

  const setRecording = useCallback(
    (recordEnabled: boolean) => {
      const next = updateHistory((current) =>
        current.record === recordEnabled
          ? current
          : { ...current, record: recordEnabled },
      )
      if (!next) return
      setFeedback(null)
    },
    [updateHistory],
  )

  const removeSaved = useCallback(
    (target: SavedSearch) => {
      let removedAt = -1
      const next = updateSaved((current) => {
        removedAt = current.findIndex((s) => s.id === target.id)
        return removeSavedSearch(current, target.id)
      })
      if (!next) return
      setFeedback({
        message: `保存した検索「${target.name}」を削除しました。`,
        tone: 'info',
        undo: () => {
          try {
            if (
              !updateSaved((current) =>
                restoreSavedSearch(current, target, removedAt),
              )
            )
              return
            setFeedback(null)
          } catch (err) {
            if (!(err instanceof SavedSearchError)) throw err
            setFeedback({ message: err.message, tone: 'error' })
          }
        },
      })
    },
    [updateSaved],
  )

  /** 保存の入力欄を開く。条件が空なら開かずに知らせる */
  const startSaving = useCallback((query: string) => {
    if (!query) {
      setSaving(null)
      setFeedback({ message: SAVE_EMPTY_MESSAGE, tone: 'error' })
      return
    }
    setFeedback(null)
    setSaving({ query, name: defaultSaveName(query) })
  }, [])

  const commitSaving = useCallback(
    (name: string) => {
      if (!saving || !name.trim()) return
      try {
        const next = updateSaved((current) =>
          addSavedSearch(current, name, saving.query),
        )
        if (!next) return
        setSaving(null)
        setFeedback({
          message: `「${name.trim().slice(0, 50)}」を保存しました。`,
          tone: 'info',
        })
      } catch (err) {
        if (!(err instanceof SavedSearchError)) throw err
        setFeedback({ message: err.message, tone: 'error' })
      }
    },
    [saving, updateSaved],
  )

  /** パネルの中に知らせを出す（保存できない条件など） */
  const notify = useCallback(
    (message: string, tone: LibraryFeedback['tone']) => {
      setSaving(null)
      setFeedback({ message, tone })
    },
    [],
  )

  /** パネルを閉じたら、保存の入力と知らせを片付ける */
  const reset = useCallback(() => {
    setSaving(null)
    setFeedback(null)
  }, [])

  return {
    history,
    saved,
    feedback,
    saving,
    setSaving,
    record,
    removeHistoryEntry,
    clearHistory,
    setRecording,
    removeSaved,
    startSaving,
    commitSaving,
    notify,
    reset,
  }
}

export type SearchLibrary = ReturnType<typeof useSearchLibrary>
