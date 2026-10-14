import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { act, render, renderHook, screen, waitFor } from '@testing-library/react'
import { IDBFactory } from 'fake-indexeddb'
import { DBManager } from '@/lib/storage/db-manager'
import { CustomRankingManager } from '@/lib/storage/custom-rankings'
import { useCustomRankingsIndexedDB } from '@/hooks/use-custom-rankings-indexeddb'

// IndexedDB が使えない（プライベートモード・容量不足など）ときに、フックが
// 画面全体を落とさず、保存を伴う操作がすべて失敗として返ることを確かめる。

function Probe(): JSX.Element {
  const { storageBackend, rankings } = useCustomRankingsIndexedDB()
  return <p data-testid="probe">{`${storageBackend}:${rankings.length}`}</p>
}

const syntheticRanking = {
  title: '合成ランキング',
  baseGenre: 'game' as const,
  conditions: [{ tag: '合成タグ', operator: 'AND' as const, tagType: 'both' as const, orderIndex: 0 }],
}

describe('useCustomRankingsIndexedDB の初期化失敗', () => {
  beforeEach(() => {
    globalThis.indexedDB = new IDBFactory()
    localStorage.clear()
    vi.spyOn(console, 'error').mockImplementation(() => undefined)
    vi.spyOn(console, 'log').mockImplementation(() => undefined)
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('DBManager.init が失敗してもフックの呼び出し数が変わらず、描画が続く', async () => {
    vi.spyOn(DBManager.prototype, 'init').mockRejectedValue(new Error('IndexedDB unavailable'))

    render(<Probe />)

    // 以前は error になった再描画で "Rendered fewer hooks than expected" が投げられていた
    await waitFor(() => expect(screen.getByTestId('probe').textContent).toBe('error:0'))
  })

  it('DBManager.init が失敗したとき、各操作は何もせず失敗を返す', async () => {
    vi.spyOn(DBManager.prototype, 'init').mockRejectedValue(new Error('IndexedDB unavailable'))
    const create = vi.spyOn(CustomRankingManager.prototype, 'createRanking')

    const { result } = renderHook(() => useCustomRankingsIndexedDB())
    await waitFor(() => expect(result.current.storageBackend).toBe('error'))

    expect(result.current.isLoading).toBe(false)
    expect(result.current.rankings).toEqual([])
    expect(await result.current.createRanking(syntheticRanking)).toBeNull()
    expect(await result.current.updateRanking('id', { title: '変更' })).toBe(false)
    expect(await result.current.deleteRanking('id')).toBe(false)
    expect(await result.current.toggleVisibility('id')).toBe(false)
    expect(await result.current.updateRankingOrder([{ id: 'id', orderIndex: 0 }])).toBe(false)
    expect(await result.current.isUniqueTitle('合成ランキング')).toBe(false)
    expect(await result.current.searchRankings('合成')).toEqual([])
    expect(create).not.toHaveBeenCalled()
  })

  it('DB は開けたが一覧の読み込みに失敗したときも error として扱い、書き込みは行わない', async () => {
    vi.spyOn(CustomRankingManager.prototype, 'getAllRankings').mockRejectedValue(new Error('read failed'))
    const create = vi.spyOn(CustomRankingManager.prototype, 'createRanking')
    const remove = vi.spyOn(CustomRankingManager.prototype, 'deleteRanking')

    const { result } = renderHook(() => useCustomRankingsIndexedDB())
    await waitFor(() => expect(result.current.storageBackend).toBe('error'))

    expect(result.current.rankings).toEqual([])
    expect(await result.current.createRanking(syntheticRanking)).toBeNull()
    expect(await result.current.deleteRanking('id')).toBe(false)
    expect(create).not.toHaveBeenCalled()
    expect(remove).not.toHaveBeenCalled()
  })

  it('error 状態の selectRanking は画面内の選択だけを変え、selectedRanking は undefined のまま', async () => {
    vi.spyOn(DBManager.prototype, 'init').mockRejectedValue(new Error('IndexedDB unavailable'))

    const { result } = renderHook(() => useCustomRankingsIndexedDB())
    await waitFor(() => expect(result.current.storageBackend).toBe('error'))

    let selected = false
    await act(async () => {
      selected = await result.current.selectRanking('missing-id')
    })
    expect(selected).toBe(true)
    expect(result.current.selectedId).toBe('missing-id')
    expect(result.current.selectedRanking).toBeUndefined()
  })
})

describe('useCustomRankingsIndexedDB の保存のあとの読み直し', () => {
  beforeEach(() => {
    globalThis.indexedDB = new IDBFactory()
    localStorage.clear()
    vi.spyOn(console, 'error').mockImplementation(() => undefined)
    vi.spyOn(console, 'log').mockImplementation(() => undefined)
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('保存できたあとの一覧の読み直しに失敗しても、保存の結果は成功のまま（もう一度作らせない）', async () => {
    const { result } = renderHook(() => useCustomRankingsIndexedDB())
    await waitFor(() => expect(result.current.storageBackend).toBe('indexeddb'))

    const reload = vi.spyOn(CustomRankingManager.prototype, 'getAllRankings').mockRejectedValue(new Error('read failed'))
    let createdId: string | null = null
    await act(async () => {
      createdId = await result.current.createRanking(syntheticRanking)
    })
    expect(reload).toHaveBeenCalled()
    expect(createdId).not.toBeNull()

    let updated = false
    await act(async () => {
      updated = await result.current.updateRanking(createdId ?? '', { title: '変更' })
    })
    expect(updated).toBe(true)

    reload.mockRestore()
    const dbManager = new DBManager()
    await dbManager.init()
    const stored = await new CustomRankingManager(dbManager).getAllRankings()
    expect(stored.map((r) => r.title)).toEqual(['変更'])
  })
})
