import 'fake-indexeddb/auto'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { DBManager } from '@/lib/storage/db-manager'
import { CustomRankingManager, InvalidCustomRankingDataError } from '@/lib/storage/custom-rankings'
import type { CreateCustomRankingData } from '@/lib/storage/types'

// カスタムランキングの保存は、ランキングと条件がすべて書けたときだけ確定する（途中で失敗したら何も変えない）。
// タグ名・タイトルはすべて合成値

const data = (title: string, tags: string[] = ['合成A', '合成B']): CreateCustomRankingData => ({
  title,
  baseGenre: 'game',
  conditions: tags.map((tag, index) => ({ tag, operator: index === 0 ? 'AND' : 'OR', tagType: 'both', orderIndex: index })),
})

/** n 回目の呼び出しで、書き込みの呼び出しそのものが例外を投げる（複製できない値を渡したときと同じ失敗） */
function failOnCall(method: 'add' | 'put' | 'delete', nth: number): void {
  const original = IDBObjectStore.prototype[method]
  let calls = 0
  vi.spyOn(IDBObjectStore.prototype, method).mockImplementation(function (this: IDBObjectStore, ...args: unknown[]) {
    calls++
    if (calls === nth) throw new DOMException('合成の失敗', 'DataCloneError')
    return (original as (...a: unknown[]) => IDBRequest).apply(this, args)
  })
}

describe('CustomRankingManager の保存', () => {
  let dbManager: DBManager
  let manager: CustomRankingManager

  const storedConditions = async (rankingId: string) => (await manager.getRanking(rankingId))?.conditions.map((c) => [c.tag, c.operator, c.tagType]) ?? null
  const rawRanking = async (rankingId: string): Promise<Record<string, unknown> | undefined> =>
    dbManager.getDB().get('customRankings', rankingId)

  beforeEach(async () => {
    dbManager = new DBManager()
    await dbManager.init()
    manager = new CustomRankingManager(dbManager)
  })

  afterEach(async () => {
    vi.restoreAllMocks()
    const tx = dbManager.getDB().transaction(['customRankings', 'customRankingConditions'], 'readwrite')
    await tx.objectStore('customRankings').clear()
    await tx.objectStore('customRankingConditions').clear()
    await tx.done
  })

  describe('作成', () => {
    it('ランキングと条件を順番どおりに保存し、表示順は続き番号にする（同時に作っても重ならない）', async () => {
      const first = await manager.createRanking(data('合成1'))
      const [second, third] = await Promise.all([manager.createRanking(data('合成2')), manager.createRanking(data('合成3'))])
      expect(await storedConditions(first)).toEqual([['合成A', 'AND', 'both'], ['合成B', 'OR', 'both']])
      const orders = (await manager.getAllRankings()).map((r) => [r.id, r.orderIndex])
      expect(orders).toEqual([[first, 0], expect.any(Array), expect.any(Array)])
      expect(new Set(orders.map(([, order]) => order))).toEqual(new Set([0, 1, 2]))
      expect([second, third]).not.toContain(first)
    })

    it('条件の書き込みが途中で失敗したら、ランキングも条件も残さない', async () => {
      failOnCall('add', 3) // 1 回目はランキング、2・3 回目が条件
      await expect(manager.createRanking(data('合成'))).rejects.toThrow('Failed to create custom ranking')
      vi.restoreAllMocks()
      expect(await manager.getAllRankings()).toEqual([])
      expect(await dbManager.getDB().count('customRankingConditions')).toBe(0)
    })

    it('使えない内容（空のタイトル・カスタムのジャンル・壊れた条件）は、書き込む前に断る', async () => {
      await expect(manager.createRanking(data('  '))).rejects.toBeInstanceOf(InvalidCustomRankingDataError)
      await expect(manager.createRanking({ ...data('合成'), baseGenre: 'custom' })).rejects.toBeInstanceOf(InvalidCustomRankingDataError)
      const broken = { ...data('合成'), conditions: [{ tag: '合成', operator: 'XOR', tagType: 'both', orderIndex: 0 }] } as unknown as CreateCustomRankingData
      await expect(manager.createRanking(broken)).rejects.toBeInstanceOf(InvalidCustomRankingDataError)
      const noType = { ...data('合成'), conditions: [{ tag: '合成', operator: 'AND', orderIndex: 0 }] } as unknown as CreateCustomRankingData
      await expect(manager.createRanking(noType)).rejects.toBeInstanceOf(InvalidCustomRankingDataError)
      expect(await manager.getAllRankings()).toEqual([])
    })

    it('条件は保存する値だけを持つ（余分な値や複製できない値を持ち込まない）', async () => {
      const extra = {
        ...data('合成'),
        conditions: [{ tag: '合成', operator: 'AND', tagType: 'lock', orderIndex: 5, extra: () => 'x' }],
      } as unknown as CreateCustomRankingData
      const id = await manager.createRanking(extra)
      const [condition] = (await manager.getRanking(id))?.conditions ?? []
      expect(condition).toEqual({ id: expect.any(String), rankingId: id, tag: '合成', operator: 'AND', tagType: 'lock', orderIndex: 0 })
    })
  })

  describe('更新', () => {
    it('条件を差し替え、ランキングの記録に条件を混ぜない（以前に混ざったものも取り除く）', async () => {
      const id = await manager.createRanking(data('合成'))
      // 以前の更新処理は、ランキングの記録にも conditions を書いていた
      await dbManager.getDB().put('customRankings', { ...(await rawRanking(id)), conditions: [{ tag: '古い' }] })

      await manager.updateRanking(id, {
        title: '合成2',
        conditions: [{ tag: '合成C', operator: 'NOT', tagType: 'user', orderIndex: 0 }],
      })
      expect(await storedConditions(id)).toEqual([['合成C', 'NOT', 'user']])
      const record = await rawRanking(id)
      expect(record?.title).toBe('合成2')
      expect(record).not.toHaveProperty('conditions')
    })

    it('新しい条件の書き込みが途中で失敗したら、元の条件とタイトルが残る', async () => {
      const id = await manager.createRanking(data('合成', ['合成A', '合成B', '合成X']))
      failOnCall('add', 2)
      await expect(
        manager.updateRanking(id, {
          title: '変更後',
          conditions: [
            { tag: '新A', operator: 'AND', tagType: 'both', orderIndex: 0 },
            { tag: '新B', operator: 'OR', tagType: 'both', orderIndex: 1 },
          ],
        }),
      ).rejects.toThrow('Failed to update custom ranking')
      vi.restoreAllMocks()
      expect(await storedConditions(id)).toEqual([['合成A', 'AND', 'both'], ['合成B', 'OR', 'both'], ['合成X', 'OR', 'both']])
      expect((await rawRanking(id))?.title).toBe('合成')
    })

    it('空のタイトル・カスタムのジャンルへの更新は書き込む前に断り、記録を変えない', async () => {
      const id = await manager.createRanking(data('合成'))
      await expect(manager.updateRanking(id, { title: '  ' })).rejects.toBeInstanceOf(InvalidCustomRankingDataError)
      await expect(manager.updateRanking(id, { baseGenre: 'custom' })).rejects.toBeInstanceOf(InvalidCustomRankingDataError)
      const record = await rawRanking(id)
      expect(record?.title).toBe('合成')
      expect(record?.baseGenre).toBe('game')
    })

    it('壊れた条件は書き込む前に断り、元の条件を変えない', async () => {
      const id = await manager.createRanking(data('合成'))
      await expect(
        manager.updateRanking(id, { conditions: [{ tag: ' ', operator: 'AND', tagType: 'both', orderIndex: 0 }] }),
      ).rejects.toBeInstanceOf(InvalidCustomRankingDataError)
      expect(await storedConditions(id)).toEqual([['合成A', 'AND', 'both'], ['合成B', 'OR', 'both']])
    })
  })

  describe('削除・並べ替え・表示の切り替え', () => {
    it('削除するとランキングとその条件が消え、ほかのランキングの条件は残る', async () => {
      const id = await manager.createRanking(data('合成1'))
      const other = await manager.createRanking(data('合成2', ['合成C']))
      await manager.deleteRanking(id)
      expect(await manager.getRanking(id)).toBeUndefined()
      expect(await dbManager.getDB().count('customRankingConditions')).toBe(1)
      expect(await storedConditions(other)).toEqual([['合成C', 'AND', 'both']])
    })

    it('ランキングの削除が失敗したら、条件も消さない', async () => {
      const id = await manager.createRanking(data('合成'))
      failOnCall('delete', 1)
      await expect(manager.deleteRanking(id)).rejects.toThrow('Failed to delete custom ranking')
      vi.restoreAllMocks()
      expect(await storedConditions(id)).toEqual([['合成A', 'AND', 'both'], ['合成B', 'OR', 'both']])
    })

    it('並べ替えると、指定した順番になる', async () => {
      const a = await manager.createRanking(data('合成1'))
      const b = await manager.createRanking(data('合成2'))
      await manager.updateRankingOrder([{ id: a, orderIndex: 1 }, { id: b, orderIndex: 0 }])
      expect((await manager.getAllRankings()).map((r) => r.id)).toEqual([b, a])
    })

    it('並べ替えが途中で失敗したら、どの順番も変えない', async () => {
      const a = await manager.createRanking(data('合成1'))
      const b = await manager.createRanking(data('合成2'))
      failOnCall('put', 2)
      await expect(manager.updateRankingOrder([{ id: a, orderIndex: 1 }, { id: b, orderIndex: 0 }])).rejects.toThrow()
      vi.restoreAllMocks()
      expect((await manager.getAllRankings()).map((r) => [r.id, r.orderIndex])).toEqual([[a, 0], [b, 1]])
    })

    it('表示・非表示を切り替える', async () => {
      const id = await manager.createRanking(data('合成'))
      await manager.toggleVisibility(id)
      expect((await rawRanking(id))?.isVisible).toBe(false)
    })
  })
})
