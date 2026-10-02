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
  summarizeSearchQuery,
} from '@/lib/search/search-history'

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
