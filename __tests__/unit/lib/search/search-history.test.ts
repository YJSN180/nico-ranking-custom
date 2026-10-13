import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  EMPTY_SEARCH_HISTORY,
  MAX_SEARCH_HISTORY,
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
} from '@/lib/search/search-history'
import { SEARCH_LIBRARY_CHANGE_EVENT } from '@/lib/search/library-events'

const at = (minute: number): Date => new Date(Date.UTC(2026, 9, 2, 0, minute))

describe('search-history', () => {
  beforeEach(() => {
    localStorage.clear()
  })
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('実行した検索を先頭に記録し、同じ条件は先頭へ移す', () => {
    let history = recordSearch(EMPTY_SEARCH_HISTORY, 'q=a', at(0))
    history = recordSearch(history, 'q=b', at(1))
    const firstId = history.entries[1]?.id
    history = recordSearch(history, 'q=a', at(2))
    expect(history.entries.map((e) => e.query)).toEqual(['q=a', 'q=b'])
    expect(history.entries[0]?.id).toBe(firstId)
    expect(history.entries[0]?.searchedAt).toBe(at(2).toISOString())
  })

  it(`${MAX_SEARCH_HISTORY} 件を超えたら古いものから消す`, () => {
    let history = EMPTY_SEARCH_HISTORY
    for (let i = 0; i < MAX_SEARCH_HISTORY + 5; i++) history = recordSearch(history, `q=${i}`, at(i))
    expect(history.entries).toHaveLength(MAX_SEARCH_HISTORY)
    expect(history.entries[0]?.query).toBe(`q=${MAX_SEARCH_HISTORY + 4}`)
    expect(history.entries.at(-1)?.query).toBe('q=5')
  })

  it('記録しない設定・空の条件では何も変えない', () => {
    const off = { record: false, entries: [] }
    expect(recordSearch(off, 'q=a')).toBe(off)
    expect(recordSearch(EMPTY_SEARCH_HISTORY, '')).toBe(EMPTY_SEARCH_HISTORY)
  })

  it('個別削除とすべて削除', () => {
    let history = recordSearch(EMPTY_SEARCH_HISTORY, 'q=a', at(0))
    history = recordSearch(history, 'q=b', at(1))
    const target = history.entries[0]
    expect(removeSearchHistoryEntry(history, target?.id ?? '').entries.map((e) => e.query)).toEqual(['q=a'])
    expect(clearSearchHistory(history)).toEqual({ record: true, entries: [] })
  })

  it('保存して読み直せる。壊れた・未知の形式は安全に読む', () => {
    const history = recordSearch({ record: false, entries: [] }, 'q=x')
    persistSearchHistory({ record: false, entries: [{ id: '1', query: 'q=x', searchedAt: 't' }] })
    expect(history.entries).toEqual([])
    expect(loadSearchHistory()).toEqual({ record: false, entries: [{ id: '1', query: 'q=x', searchedAt: 't' }] })
    localStorage.setItem(SEARCH_HISTORY_KEY, '{')
    expect(loadSearchHistory()).toEqual(EMPTY_SEARCH_HISTORY)
    localStorage.setItem(SEARCH_HISTORY_KEY, JSON.stringify({ entries: [{ id: 1 }, { id: 'ok', query: 'q=y', searchedAt: 't' }] }))
    expect(loadSearchHistory()).toEqual({ record: true, entries: [{ id: 'ok', query: 'q=y', searchedAt: 't' }] })
  })

  it('ブラウザに保存できなければ SearchHistoryError を投げる', () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new DOMException('quota', 'QuotaExceededError')
    })
    expect(() => persistSearchHistory(EMPTY_SEARCH_HISTORY)).toThrow(SearchHistoryError)
  })

  it('一覧に出す短い文: 検索語・検索対象・並び順・詳細条件があること', () => {
    expect(summarizeSearchQuery('q=%E5%88%9D%E9%9F%B3&targets=tag&sort=-startTime')).toEqual({
      title: '初音',
      details: ['タグ検索', '投稿日時が新しい順'],
    })
    expect(summarizeSearchQuery('q=a&genre=%E3%82%B2%E3%83%BC%E3%83%A0').details).toContain('詳細条件あり')
    expect(summarizeSearchQuery('tagAnd=A&tagNot=B').title).toBe('A -B')
    expect(summarizeSearchQuery('genre=%E3%82%B2%E3%83%BC%E3%83%A0').title).toBe('キーワードなし')
  })
})

describe('search-history: 取り消しと書き換えの知らせ', () => {
  const entry = (query: string) => ({ id: `id-${query}`, query, searchedAt: '2026-10-03T00:00:00.000Z' })

  it('消した 1 件を元の位置へ戻す。その間に同じ条件を検索していたら新しい記録を残す', () => {
    const history = { record: true, entries: [entry('q=a'), entry('q=c')] }
    expect(restoreSearchHistoryEntry(history, entry('q=b'), 1).entries.map((e) => e.query)).toEqual(['q=a', 'q=b', 'q=c'])
    const searchedAgain = { record: true, entries: [{ ...entry('q=b'), id: 'newer' }] }
    expect(restoreSearchHistoryEntry(searchedAgain, entry('q=b'), 0)).toBe(searchedAgain)
  })

  it('すべて消した履歴は、消したあとの記録を先に残して戻し、件数の上限を守る', () => {
    const after = { record: true, entries: [entry('q=new'), entry('q=b')] }
    const cleared = [entry('q=a'), entry('q=b'), ...Array.from({ length: MAX_SEARCH_HISTORY }, (_, i) => entry(`q=${i}`))]
    const restored = restoreSearchHistoryEntries(after, cleared)
    expect(restored.entries.slice(0, 3).map((e) => e.query)).toEqual(['q=new', 'q=b', 'q=a'])
    expect(restored.entries).toHaveLength(MAX_SEARCH_HISTORY)
  })

  it('保存できたら、同じタブの画面へ書き換えを知らせる', () => {
    const listener = vi.fn()
    window.addEventListener(SEARCH_LIBRARY_CHANGE_EVENT, listener)
    try {
      persistSearchHistory({ record: true, entries: [entry('q=a')] })
      expect((listener.mock.calls[0]?.[0] as CustomEvent<string>).detail).toBe(SEARCH_HISTORY_KEY)
    } finally {
      window.removeEventListener(SEARCH_LIBRARY_CHANGE_EVENT, listener)
      localStorage.clear()
    }
  })
})
