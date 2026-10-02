'use client'

import { useCallback, useEffect, useState } from 'react'
import {
  addSavedSearch,
  loadSavedSearches,
  persistSavedSearches,
  removeSavedSearch,
  SavedSearchError,
  type SavedSearch,
} from '@/lib/search/saved-searches'
import {
  EMPTY_SEARCH_HISTORY,
  SearchHistoryError,
  clearSearchHistory,
  loadSearchHistory,
  persistSearchHistory,
  recordSearch,
  removeSearchHistoryEntry,
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

  // localStorage（外部の保存先）から読み込む。サーバー描画と食い違わないよう、描画後に読む
  useEffect(() => {
    setHistory(loadSearchHistory())
    setSaved(loadSavedSearches())
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

  /** 実行した検索を記録する（記録しない設定・空の条件は何もしない）。保存できなくても検索は続ける */
  const record = useCallback(
    (query: string) => {
      const next = recordSearch(history, query)
      if (next === history) return
      writeHistory(next)
      setHistory(next)
    },
    [history, writeHistory],
  )

  const removeHistoryEntry = useCallback(
    (entry: SearchHistoryEntry) => {
      const previous = history
      const next = removeSearchHistoryEntry(history, entry.id)
      if (!writeHistory(next)) return
      setHistory(next)
      setFeedback({
        message: `「${summarizeSearchQuery(entry.query).title}」を履歴から削除しました。`,
        tone: 'info',
        undo: () => {
          if (!writeHistory(previous)) return
          setHistory(previous)
          setFeedback(null)
        },
      })
    },
    [history, writeHistory],
  )

  const clearHistory = useCallback(() => {
    if (history.entries.length === 0) return
    const previous = history
    const next = clearSearchHistory(history)
    if (!writeHistory(next)) return
    setHistory(next)
    setFeedback({
      message: '最近の検索をすべて削除しました。',
      tone: 'info',
      undo: () => {
        if (!writeHistory(previous)) return
        setHistory(previous)
        setFeedback(null)
      },
    })
  }, [history, writeHistory])

  const setRecording = useCallback(
    (recordEnabled: boolean) => {
      const next = { ...history, record: recordEnabled }
      if (!writeHistory(next)) return
      setHistory(next)
      setFeedback(null)
    },
    [history, writeHistory],
  )

  const removeSaved = useCallback(
    (target: SavedSearch) => {
      const previous = saved
      const next = removeSavedSearch(saved, target.id)
      if (!writeSaved(next)) return
      setSaved(next)
      setFeedback({
        message: `保存した検索「${target.name}」を削除しました。`,
        tone: 'info',
        undo: () => {
          if (!writeSaved(previous)) return
          setSaved(previous)
          setFeedback(null)
        },
      })
    },
    [saved, writeSaved],
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
        const next = addSavedSearch(saved, name, saving.query)
        if (!writeSaved(next)) return
        setSaved(next)
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
    [saving, saved, writeSaved],
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
