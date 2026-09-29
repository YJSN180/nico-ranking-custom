import { describe, it, expect, beforeEach } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'
import { IDBFactory } from 'fake-indexeddb'
import { DBManager } from '@/lib/storage/db-manager'
import { CustomRankingManager } from '@/lib/storage/custom-rankings'
import { useCustomRankingsIndexedDB } from '@/hooks/use-custom-rankings-indexeddb'

// 旧形式（localStorage）のカスタムランキングを IndexedDB へ移す処理を、
// メイン画面と同じく 2 つのフックインスタンスが同時に動く状況で確かめる。データはすべて合成値。

const LEGACY_KEY = 'custom-rankings'
const LEGACY_ORDER_KEY = 'customRankingsOrder'
const MIGRATION_FLAG_KEY = 'custom-rankings-migration-completed'

function seedLegacyRankings(): void {
  localStorage.setItem(
    LEGACY_KEY,
    JSON.stringify({
      rankings: [
        {
          id: 'legacy-ranking-a',
          title: '合成ランキングA',
          baseGenre: 'game',
          conditions: [{ tag: '合成タグ1', operator: 'AND', tagType: 'both' }],
          createdAt: 1700000000000,
          updatedAt: 1700000000000,
        },
        {
          id: 'legacy-ranking-b',
          title: '合成ランキングB',
          baseGenre: 'music',
          conditions: [
            { tag: '合成タグ2', operator: 'OR' },
            { tag: '合成タグ3', operator: 'NOT', tagType: 'lock' },
          ],
          createdAt: 1700000000001,
          updatedAt: 1700000000001,
        },
      ],
      selectedId: 'legacy-ranking-b',
    })
  )
  localStorage.setItem(
    LEGACY_ORDER_KEY,
    JSON.stringify([
      { id: 'legacy-ranking-a', order: 1, isVisible: true },
      { id: 'legacy-ranking-b', order: 0, isVisible: false },
    ])
  )
}

async function storedRankings() {
  const dbManager = new DBManager()
  await dbManager.init()
  return new CustomRankingManager(dbManager).getAllRankings()
}

describe('カスタムランキングの localStorage→IndexedDB 移行', () => {
  beforeEach(() => {
    globalThis.indexedDB = new IDBFactory()
    localStorage.clear()
    seedLegacyRankings()
  })

  it('メイン画面のように 2 つのフックが同時に動いても、ランキングは増えず移行が完了する', async () => {
    // app/client-page.tsx と components/tag-selector.tsx がそれぞれ useCustomRankings を呼ぶ
    const page = renderHook(() => useCustomRankingsIndexedDB())
    const selector = renderHook(() => useCustomRankingsIndexedDB())

    await waitFor(() => {
      expect(page.result.current.isLoading).toBe(false)
      expect(selector.result.current.isLoading).toBe(false)
    })

    const rankings = await storedRankings()
    expect(rankings.map((r) => r.title).sort()).toEqual(['合成ランキングA', '合成ランキングB'])
    expect(localStorage.getItem(MIGRATION_FLAG_KEY)).toBeTruthy()
    // 並び順・表示状態・条件も移る
    const [first, second] = rankings
    expect(first.title).toBe('合成ランキングB')
    expect(first.isVisible).toBe(false)
    expect(first.conditions.map((c) => [c.tag, c.operator, c.tagType])).toEqual([
      ['合成タグ2', 'OR', 'both'],
      ['合成タグ3', 'NOT', 'lock'],
    ])
    expect(second.title).toBe('合成ランキングA')
    expect(second.isVisible).toBe(true)
    // 選択していたランキングが移行後も選ばれている
    expect(page.result.current.selectedRanking?.title).toBe('合成ランキングB')
  })

  it('以前の実装が別 ID で作った同じ内容のランキングがあれば、もう 1 組は作らずに移行を終える', async () => {
    // 以前の実装は移行のたびに新しい ID で作り、検証に失敗して完了フラグが立たなかった
    const dbManager = new DBManager()
    await dbManager.init()
    const manager = new CustomRankingManager(dbManager)
    await manager.createRanking({
      title: '合成ランキングA',
      baseGenre: 'game',
      conditions: [{ tag: '合成タグ1', operator: 'AND', tagType: 'both', orderIndex: 0 }],
    })
    await manager.createRanking({
      title: '合成ランキングB',
      baseGenre: 'music',
      conditions: [
        { tag: '合成タグ2', operator: 'OR', tagType: 'both', orderIndex: 0 },
        { tag: '合成タグ3', operator: 'NOT', tagType: 'lock', orderIndex: 1 },
      ],
    })

    const hook = renderHook(() => useCustomRankingsIndexedDB())
    await waitFor(() => expect(hook.result.current.isLoading).toBe(false))

    expect(await storedRankings()).toHaveLength(2)
    expect(localStorage.getItem(MIGRATION_FLAG_KEY)).toBeTruthy()
  })

  it('前回の移行が完了フラグを立てられなかった後の再実行でも、ランキングを増やさない', async () => {
    const first = renderHook(() => useCustomRankingsIndexedDB())
    await waitFor(() => expect(first.result.current.isLoading).toBe(false))
    first.unmount()

    // 完了フラグが立たず、旧データも残っていた状態（前回の検証失敗・書き込み失敗など）
    localStorage.removeItem(MIGRATION_FLAG_KEY)
    seedLegacyRankings()

    const second = renderHook(() => useCustomRankingsIndexedDB())
    await waitFor(() => expect(second.result.current.isLoading).toBe(false))

    const rankings = await storedRankings()
    expect(rankings).toHaveLength(2)
    expect(localStorage.getItem(MIGRATION_FLAG_KEY)).toBeTruthy()
  })
})
