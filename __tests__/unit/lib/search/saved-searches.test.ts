import { describe, it, expect } from 'vitest'
import {
  addSavedSearch,
  mergeSavedSearches,
  removeSavedSearch,
  sanitizeSavedSearches,
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

  it('上限を超えるエントリは切り捨てる', () => {
    const many = Array.from({ length: MAX_SAVED_SEARCHES + 10 }, (_, i) => makeSearch(`s${i}`))
    expect(sanitizeSavedSearches({ version: 1, searches: many })).toHaveLength(MAX_SAVED_SEARCHES)
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
