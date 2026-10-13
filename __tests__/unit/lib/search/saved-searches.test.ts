import { describe, it, expect, vi, afterEach } from 'vitest'
import { SEARCH_LIBRARY_CHANGE_EVENT } from '@/lib/search/library-events'
import {
  addSavedSearch,
  loadSavedSearches,
  mergeSavedSearches,
  persistSavedSearches,
  removeSavedSearch,
  restoreSavedSearch,
  sanitizeSavedSearches,
  SavedSearchError,
  MAX_SAVED_SEARCHES,
  type SavedSearch,
} from '@/lib/search/saved-searches'

function makeSearch(name: string, query = 'q=test'): SavedSearch {
  return {
    id: `id-${name}`,
    name,
    query,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  }
}

describe('sanitizeSavedSearches', () => {
  it('不正な形式は空配列を返す', () => {
    expect(sanitizeSavedSearches(null)).toEqual([])
    expect(sanitizeSavedSearches('broken')).toEqual([])
    expect(sanitizeSavedSearches({ version: 1 })).toEqual([])
    expect(sanitizeSavedSearches({ searches: 'not-array' })).toEqual([])
  })

  it('有効なエントリだけを取り出す（前方互換: 未知フィールドは許容）', () => {
    const result = sanitizeSavedSearches({
      version: 99,
      unknownField: true,
      searches: [
        { ...makeSearch('valid'), futureField: 'ignored' },
        { name: 'no-id' },
        makeSearch('valid2'),
      ],
    })
    expect(result.map((s) => s.name)).toEqual(['valid', 'valid2'])
  })

  it('読み込み（loadSavedSearches）では上限を超えるエントリを切り捨てる', () => {
    const many = Array.from({ length: MAX_SAVED_SEARCHES + 10 }, (_, i) => makeSearch(`s${i}`))
    localStorage.setItem('saved-searches', JSON.stringify({ version: 1, searches: many }))
    expect(loadSavedSearches()).toHaveLength(MAX_SAVED_SEARCHES)
    localStorage.clear()
  })

  it('取り込み用の整形（sanitizeSavedSearches）では切り捨てない（上限を超えたことを取り込みで知らせるため）', () => {
    const many = Array.from({ length: MAX_SAVED_SEARCHES + 10 }, (_, i) => makeSearch(`s${i}`))
    expect(sanitizeSavedSearches({ version: 1, searches: many })).toHaveLength(MAX_SAVED_SEARCHES + 10)
  })
})

describe('addSavedSearch / removeSavedSearch', () => {
  it('新規追加は先頭に入る', () => {
    const result = addSavedSearch([makeSearch('old')], '新しい検索', 'q=new')
    expect(result[0]?.name).toBe('新しい検索')
    expect(result[0]?.query).toBe('q=new')
    expect(result).toHaveLength(2)
  })

  it('同名は上書きされ、件数は増えない', () => {
    const initial = addSavedSearch([], 'ミク', 'q=miku')
    const result = addSavedSearch(initial, 'ミク', 'q=miku&sort=-likeCounter')
    expect(result).toHaveLength(1)
    expect(result[0]?.query).toBe('q=miku&sort=-likeCounter')
  })

  it('空の名前は無視する', () => {
    expect(addSavedSearch([], '   ', 'q=x')).toEqual([])
  })

  it('removeSavedSearch はIDで削除する', () => {
    const searches = [makeSearch('a'), makeSearch('b')]
    expect(removeSavedSearch(searches, 'id-a').map((s) => s.name)).toEqual(['b'])
  })
})

describe('mergeSavedSearches（バックアップインポート）', () => {
  it('同名はインポート側で上書き、別名は追加', () => {
    const existing = [makeSearch('共通', 'q=old'), makeSearch('ローカルのみ')]
    const imported = [makeSearch('共通', 'q=imported'), makeSearch('インポートのみ')]
    const { merged, importedCount } = mergeSavedSearches(existing, imported)
    expect(importedCount).toBe(2)
    expect(merged.find((s) => s.name === '共通')?.query).toBe('q=imported')
    expect(merged.map((s) => s.name).sort()).toEqual(['インポートのみ', 'ローカルのみ', '共通'])
  })

  it('不正なエントリはスキップする', () => {
    const { merged, importedCount } = mergeSavedSearches(
      [],
      [{ name: 'broken' } as unknown as SavedSearch, makeSearch('ok')]
    )
    expect(importedCount).toBe(1)
    expect(merged.map((s) => s.name)).toEqual(['ok'])
  })
})

describe('上限と保存の失敗を成功にしない', () => {
  const many = (count: number, prefix = 's'): SavedSearch[] => Array.from({ length: count }, (_, i) => makeSearch(`${prefix}${i}`))

  afterEach(() => {
    vi.restoreAllMocks()
    localStorage.clear()
  })

  it('上限に達していたら、新しい名前は追加せずに知らせる（古いものを黙って消さない）', () => {
    const full = many(MAX_SAVED_SEARCHES)
    expect(() => addSavedSearch(full, '新しい検索', 'q=new')).toThrow(SavedSearchError)
    // 同じ名前の上書きは件数が増えないので受け付ける
    expect(addSavedSearch(full, 's3', 'q=updated').find((s) => s.name === 's3')?.query).toBe('q=updated')
  })

  it('取り込むと上限を超えるなら、何も取り込まずに知らせる（切り捨てたまま「インポート」と数えない）', () => {
    const existing = many(45, 'local')
    const imported = many(10, 'imported')
    expect(() => mergeSavedSearches(existing, imported)).toThrow(SavedSearchError)
    expect(() => mergeSavedSearches(existing, imported)).toThrow(/50 件まで.*55 件/)
    // 同じ名前の上書きを含めて上限に収まるなら取り込む
    const { merged, importedCount } = mergeSavedSearches(existing, [...many(5, 'local'), ...many(5, 'imported')])
    expect(merged).toHaveLength(MAX_SAVED_SEARCHES)
    expect(importedCount).toBe(10)
  })

  it('ブラウザに保存できなければ知らせる（保存したことにしない）', () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new DOMException('quota', 'QuotaExceededError')
    })
    expect(() => persistSavedSearches([makeSearch('a')])).toThrow(SavedSearchError)
  })

  it('保存できたものは読み直せる', () => {
    persistSavedSearches([makeSearch('a')])
    expect(loadSavedSearches().map((s) => s.name)).toEqual(['a'])
  })
})

describe('restoreSavedSearch（削除の取り消し）', () => {
  it('元の位置へ戻す。同じ ID・同じ名前がもうあれば何もしない（新しい方を残す）', () => {
    const a = makeSearch('A')
    const b = makeSearch('B')
    const c = makeSearch('C')
    expect(restoreSavedSearch([a, c], b, 1).map((s) => s.name)).toEqual(['A', 'B', 'C'])
    expect(restoreSavedSearch([a], b, 9).map((s) => s.name)).toEqual(['A', 'B'])
    const list = [a, { ...makeSearch('B'), id: 'other' }]
    expect(restoreSavedSearch(list, b, 0)).toBe(list)
  })

  it('戻すと上限を超えるなら SavedSearchError', () => {
    const full = Array.from({ length: MAX_SAVED_SEARCHES }, (_, i) => makeSearch(`S${i}`))
    expect(() => restoreSavedSearch(full, makeSearch('戻す'), 0)).toThrow(SavedSearchError)
  })
})

describe('書き換えの知らせ', () => {
  it('保存できたら、同じタブの画面へ書き換えを知らせる', () => {
    const listener = vi.fn()
    window.addEventListener(SEARCH_LIBRARY_CHANGE_EVENT, listener)
    try {
      persistSavedSearches([makeSearch('A')])
      expect(listener).toHaveBeenCalledTimes(1)
      expect((listener.mock.calls[0]?.[0] as CustomEvent<string>).detail).toBe('saved-searches')
    } finally {
      window.removeEventListener(SEARCH_LIBRARY_CHANGE_EVENT, listener)
      localStorage.clear()
    }
  })
})
