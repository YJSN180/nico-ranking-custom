import { describe, it, expect, beforeEach } from 'vitest'
import { renderHook } from '@testing-library/react'
import { importExtendedNGListData, type ExtendedNGListBackupData } from '@/lib/storage/ng-backup-extended'
import { filterWithExtendedNGList } from '@/lib/filter-with-extended-ng-list'
import { useUserNGListExtended } from '@/hooks/use-user-ng-list-extended'
import type { ExtendedUserNGList } from '@/types/ng-list-extended'
import type { RankingItem } from '@/types/ranking'

// NG リストの取り込みと読み込みで、文字列でない要素や空文字を通さないことを確かめる。
// 空文字の部分一致はすべての動画に当たり、文字列でないタグは絞り込みの toLowerCase で落ちる。
// データはすべて合成値。

const STORAGE_KEY = 'user-ng-list'

function emptyNGList(): ExtendedUserNGList {
  return {
    videoIds: [],
    videoTitles: { exact: [], partial: [] },
    authorIds: [],
    authorNames: { exact: [], partial: [] },
    tags: {
      locked: { exact: [], partial: [] },
      user: { exact: [], partial: [] },
      both: { exact: [], partial: [] },
    },
    version: 2,
    totalCount: 0,
    updatedAt: '2026-01-01T00:00:00.000Z',
  }
}

function backupOf(ngList: unknown): ExtendedNGListBackupData {
  return {
    version: '1.1.0',
    exportDate: '2026-01-01T00:00:00.000Z',
    exportSource: 'settings-applied',
    ngList: ngList as ExtendedUserNGList,
    metadata: {
      totalItems: 0,
      categoryBreakdown: { videoIds: 0, videoTitlesExact: 0, videoTitlesPartial: 0, authorIds: 0, authorNamesExact: 0, authorNamesPartial: 0 },
      appVersion: '1.0.0',
    },
  }
}

const items: RankingItem[] = [
  {
    rank: 1,
    id: 'sm90000001',
    title: '合成タイトル一',
    thumbURL: '',
    views: 1,
    authorName: '合成投稿者',
    authorId: '90000001',
    tagDetails: [{ name: '合成タグ', isLocked: false }],
  } as RankingItem,
  {
    rank: 2,
    id: 'sm90000002',
    title: '合成タイトル二',
    thumbURL: '',
    views: 1,
    authorName: '別の合成投稿者',
    authorId: '90000002',
    tagDetails: [{ name: '別の合成タグ', isLocked: true }],
  } as RankingItem,
]

function storedNGList(): ExtendedUserNGList {
  return JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '{}') as ExtendedUserNGList
}

describe('NG リストの取り込み（バックアップ・共有されたファイル）', () => {
  beforeEach(() => {
    localStorage.clear()
    localStorage.setItem(STORAGE_KEY, JSON.stringify(emptyNGList()))
  })

  it('空文字・空白だけ・文字列でない要素は取り込まず、数値の ID は文字列として取り込む', () => {
    const importing = {
      ...emptyNGList(),
      authorIds: [90000002, null],
      videoTitles: { exact: [], partial: ['', '  ', '合成タイトル一'] },
      tags: {
        locked: { exact: [], partial: [] },
        user: { exact: [], partial: [] },
        both: { exact: [42, { tag: '合成' }, '合成タグ'], partial: [''] },
      },
    }

    const result = importExtendedNGListData(backupOf(importing), 'merge')

    expect(result.success).toBe(true)
    const stored = storedNGList()
    expect(stored.authorIds).toEqual(['90000002'])
    expect(stored.videoTitles.partial).toEqual(['合成タイトル一'])
    expect(stored.tags?.both.exact).toEqual(['42', '合成タグ'])
    expect(stored.tags?.both.partial).toEqual([])
    // 取り込んだ NG で絞り込んでも落ちず、全件が消えることもない
    expect(() => filterWithExtendedNGList(items, stored)).not.toThrow()
    expect(filterWithExtendedNGList(items, stored).filteredItems).toEqual([])
    expect(filterWithExtendedNGList([{ ...items[1], authorId: '90000003', title: '合成三', tagDetails: [] } as RankingItem], stored).filteredItems).toHaveLength(1)
  })

  it('形の合わないファイルで「上書き」しても、今の NG リストを消さない', () => {
    const current = { ...emptyNGList(), videoIds: ['sm90000009'], totalCount: 1 }
    localStorage.setItem(STORAGE_KEY, JSON.stringify(current))

    const result = importExtendedNGListData(backupOf({ videoIds: 'sm90000001' }), 'overwrite')

    expect(result.success).toBe(false)
    expect(storedNGList().videoIds).toEqual(['sm90000009'])
  })
})

describe('保存済みの NG リストの読み込み', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  it('以前に取り込まれた文字列でない要素・空文字があっても、絞り込みで落ちず全件も消えない', () => {
    const stored = {
      ...emptyNGList(),
      videoTitles: { exact: [], partial: [''] },
      tags: {
        locked: { exact: [7], partial: [] },
        user: { exact: [], partial: [] },
        both: { exact: [], partial: [] },
      },
    }
    localStorage.setItem(STORAGE_KEY, JSON.stringify(stored))

    const { result } = renderHook(() => useUserNGListExtended())

    expect(() => filterWithExtendedNGList(items, result.current.ngList)).not.toThrow()
    expect(filterWithExtendedNGList(items, result.current.ngList).filteredItems).toHaveLength(2)
  })
})
