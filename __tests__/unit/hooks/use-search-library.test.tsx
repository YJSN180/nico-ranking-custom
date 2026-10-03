import { act, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useSearchLibrary } from '@/hooks/use-search-library'
import { MAX_SAVED_SEARCHES, SAVED_SEARCHES_KEY, loadSavedSearches, persistSavedSearches, type SavedSearch } from '@/lib/search/saved-searches'
import { SEARCH_HISTORY_KEY, loadSearchHistory } from '@/lib/search/search-history'

// 最近の検索・保存した検索は、ほかのタブや同じタブの別の場所（統合バックアップの取り込み）でも書き換わる。
// 画面に残っている古い内容で上書きせず、最新の内容に変更を当てて書く。検索語・名前はすべて合成値

/** ほかのタブが書いたのと同じ状態にする（このタブには storage イベントも届かない） */
function writeFromOtherTab(key: string, value: unknown): void {
  localStorage.setItem(key, JSON.stringify(value))
}

const historyOf = (...queries: string[]) => ({
  version: 1,
  record: true,
  entries: queries.map((query, i) => ({ id: `h${i}-${query}`, query, searchedAt: '2026-10-03T00:00:00.000Z' })),
})

const savedOf = (...names: string[]): { version: number; searches: SavedSearch[] } => ({
  version: 1,
  searches: names.map((name) => ({
    id: `s-${name}`,
    name,
    query: `q=${encodeURIComponent(name)}`,
    createdAt: '2026-10-03T00:00:00.000Z',
    updatedAt: '2026-10-03T00:00:00.000Z',
  })),
})

const storedQueries = (): string[] => loadSearchHistory().entries.map((e) => e.query)
const storedNames = (): string[] => loadSavedSearches().map((s) => s.name)

beforeEach(() => {
  localStorage.clear()
})
afterEach(() => {
  vi.restoreAllMocks()
  localStorage.clear()
})

describe('useSearchLibrary: ほかのタブの変更を上書きしない', () => {
  it('履歴: ほかのタブが記録した検索を残したまま、新しい検索を先頭に記録する', () => {
    const { result } = renderHook(() => useSearchLibrary())
    writeFromOtherTab(SEARCH_HISTORY_KEY, historyOf('q=other'))
    act(() => result.current.record('q=mine'))
    expect(storedQueries()).toEqual(['q=mine', 'q=other'])
    expect(result.current.history.entries.map((e) => e.query)).toEqual(['q=mine', 'q=other'])
  })

  it('保存した検索: ほかのタブが保存したものを残したまま保存する', () => {
    const { result } = renderHook(() => useSearchLibrary())
    writeFromOtherTab(SAVED_SEARCHES_KEY, savedOf('合成ほか'))
    act(() => result.current.startSaving('q=mine'))
    act(() => result.current.commitSaving('合成わたし'))
    expect(storedNames()).toEqual(['合成わたし', '合成ほか'])
  })

  it('履歴の 1 件削除の取り消しは、その 1 件だけを戻す（その間にほかのタブで記録したものを消さない）', () => {
    writeFromOtherTab(SEARCH_HISTORY_KEY, historyOf('q=a', 'q=b', 'q=c'))
    const { result } = renderHook(() => useSearchLibrary())
    const target = result.current.history.entries[1]
    expect(target?.query).toBe('q=b')
    act(() => result.current.removeHistoryEntry(target!))
    expect(storedQueries()).toEqual(['q=a', 'q=c'])

    const later = loadSearchHistory()
    writeFromOtherTab(SEARCH_HISTORY_KEY, { version: 1, ...later, entries: [{ id: 'new', query: 'q=new', searchedAt: '2026-10-03T01:00:00.000Z' }, ...later.entries] })
    act(() => result.current.feedback?.undo?.())
    expect(storedQueries()).toEqual(['q=new', 'q=b', 'q=a', 'q=c'])
  })

  it('履歴をすべて消したあとの取り消しは、消したあとの記録を先に残して戻す', () => {
    writeFromOtherTab(SEARCH_HISTORY_KEY, historyOf('q=a', 'q=b'))
    const { result } = renderHook(() => useSearchLibrary())
    act(() => result.current.clearHistory())
    expect(storedQueries()).toEqual([])
    writeFromOtherTab(SEARCH_HISTORY_KEY, historyOf('q=new', 'q=b'))
    act(() => result.current.feedback?.undo?.())
    expect(storedQueries()).toEqual(['q=new', 'q=b', 'q=a'])
  })

  it('保存した検索の削除の取り消しは、同じ名前がその間に保存されていたら新しい方を残す', () => {
    writeFromOtherTab(SAVED_SEARCHES_KEY, savedOf('合成1', '合成2'))
    const { result } = renderHook(() => useSearchLibrary())
    const target = result.current.saved.find((s) => s.name === '合成2')
    act(() => result.current.removeSaved(target!))
    expect(storedNames()).toEqual(['合成1'])

    // 取り消す前に、ほかのタブが別の検索を保存した
    writeFromOtherTab(SAVED_SEARCHES_KEY, savedOf('合成3', '合成1'))
    act(() => result.current.feedback?.undo?.())
    expect(storedNames()).toEqual(['合成3', '合成2', '合成1'])

    // 同じ名前で保存し直されていたら、取り消しても新しい方を残す（重ねない）
    act(() => result.current.removeSaved(result.current.saved.find((s) => s.name === '合成2')!))
    const resaved = { ...savedOf('合成2').searches[0]!, id: 'resaved', query: 'q=new' }
    writeFromOtherTab(SAVED_SEARCHES_KEY, { version: 1, searches: [resaved, ...loadSavedSearches()] })
    act(() => result.current.feedback?.undo?.())
    expect(loadSavedSearches().filter((s) => s.name === '合成2').map((s) => s.id)).toEqual(['resaved'])
  })

  it('記録しない設定に切り替えても、ほかのタブの記録は消さない', () => {
    const { result } = renderHook(() => useSearchLibrary())
    writeFromOtherTab(SEARCH_HISTORY_KEY, historyOf('q=other'))
    act(() => result.current.setRecording(false))
    expect(loadSearchHistory()).toEqual({ record: false, entries: historyOf('q=other').entries })
  })
})

describe('useSearchLibrary: 書き換えを画面へ反映する', () => {
  it('ほかのタブの書き換え（storage イベント）を一覧に反映する', () => {
    const { result } = renderHook(() => useSearchLibrary())
    writeFromOtherTab(SEARCH_HISTORY_KEY, historyOf('q=other'))
    writeFromOtherTab(SAVED_SEARCHES_KEY, savedOf('合成ほか'))
    act(() => {
      window.dispatchEvent(new StorageEvent('storage', { key: SEARCH_HISTORY_KEY }))
      window.dispatchEvent(new StorageEvent('storage', { key: SAVED_SEARCHES_KEY }))
    })
    expect(result.current.history.entries.map((e) => e.query)).toEqual(['q=other'])
    expect(result.current.saved.map((s) => s.name)).toEqual(['合成ほか'])

    // 保存先がまとめて消された（key が null）
    localStorage.clear()
    act(() => {
      window.dispatchEvent(new StorageEvent('storage', { key: null }))
    })
    expect(result.current.history.entries).toEqual([])
    expect(result.current.saved).toEqual([])
  })

  it('同じタブの別の場所での書き換え（統合バックアップの取り込み）も一覧に反映する', () => {
    const { result } = renderHook(() => useSearchLibrary())
    act(() => persistSavedSearches(savedOf('取り込み').searches))
    expect(result.current.saved.map((s) => s.name)).toEqual(['取り込み'])
  })

  it('外したあとは、書き換えの知らせを受け取らない（保存先を読み直さない）', () => {
    const { unmount } = renderHook(() => useSearchLibrary())
    unmount()
    const getItem = vi.spyOn(Storage.prototype, 'getItem')
    act(() => {
      persistSavedSearches(savedOf('取り込み').searches)
      window.dispatchEvent(new StorageEvent('storage', { key: SEARCH_HISTORY_KEY }))
    })
    expect(getItem).not.toHaveBeenCalled()
  })
})

describe('useSearchLibrary: 保存できないとき', () => {
  it('保存先が使えなくても、この画面の一覧には記録を重ねて残す（保存できないことは知らせる）', () => {
    const { result } = renderHook(() => useSearchLibrary())
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new DOMException('合成の拒否', 'SecurityError')
    })
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new DOMException('合成の拒否', 'SecurityError')
    })
    act(() => result.current.record('q=one'))
    act(() => result.current.record('q=two'))
    expect(result.current.history.entries.map((e) => e.query)).toEqual(['q=two', 'q=one'])
    expect(result.current.feedback?.tone).toBe('error')
  })

  it('削除を保存できなければ一覧から消さず、取り消しの知らせも出さない', () => {
    writeFromOtherTab(SEARCH_HISTORY_KEY, historyOf('q=a'))
    writeFromOtherTab(SAVED_SEARCHES_KEY, savedOf('合成1'))
    const { result } = renderHook(() => useSearchLibrary())
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new DOMException('合成の容量超過', 'QuotaExceededError')
    })
    act(() => result.current.removeHistoryEntry(result.current.history.entries[0]!))
    expect(result.current.history.entries.map((e) => e.query)).toEqual(['q=a'])
    expect(result.current.feedback).toMatchObject({ tone: 'error' })
    expect(result.current.feedback?.undo).toBeUndefined()

    act(() => result.current.removeSaved(result.current.saved[0]!))
    expect(result.current.saved.map((s) => s.name)).toEqual(['合成1'])
    expect(result.current.feedback?.undo).toBeUndefined()
  })

  it('保存した検索の取り消しで上限を超えるなら、戻さずに知らせる', () => {
    writeFromOtherTab(SAVED_SEARCHES_KEY, savedOf('消す'))
    const { result } = renderHook(() => useSearchLibrary())
    act(() => result.current.removeSaved(result.current.saved[0]!))
    // 取り消す前に、ほかのタブで上限まで保存された
    writeFromOtherTab(SAVED_SEARCHES_KEY, savedOf(...Array.from({ length: MAX_SAVED_SEARCHES }, (_, i) => `ほか${i}`)))
    act(() => result.current.feedback?.undo?.())
    expect(result.current.feedback).toMatchObject({ tone: 'error' })
    expect(storedNames()).not.toContain('消す')
    expect(storedNames()).toHaveLength(MAX_SAVED_SEARCHES)
  })
})
