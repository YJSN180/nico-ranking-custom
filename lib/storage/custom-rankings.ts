import { DBManager } from './db-manager'
import { isBaseGenre, isNonBlankString, sanitizeConditionsForStorage, type StorableCondition } from './custom-ranking-backup-schema'
import type { 
  CustomRankingIndexedDB, 
  CustomRankingConditionIndexedDB,
  CustomRankingWithConditions,
  CreateCustomRankingData,
  UpdateCustomRankingData,
  CustomRankingSortOrder 
} from './types'

/** 保存しようとした内容が使えない（空のタイトル・未知のジャンル・壊れた条件）。何も書き込まずに投げる */
export class InvalidCustomRankingDataError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'InvalidCustomRankingDataError'
  }
}

const newId = (): string =>
  globalThis.crypto?.randomUUID?.() ?? `custom-${Date.now()}-${Math.random().toString(36).slice(2, 11)}`

const messageOf = (error: unknown): string => (error instanceof Error ? error.message : String(error))

function validConditions(value: unknown): StorableCondition[] {
  const conditions = sanitizeConditionsForStorage(value)
  if (!conditions) throw new InvalidCustomRankingDataError('タグ条件に使えない値が含まれています')
  return conditions
}

function checkTitle(value: unknown): void {
  if (!isNonBlankString(value)) throw new InvalidCustomRankingDataError('タイトルが空です')
}

function checkBaseGenre(value: unknown): void {
  if (!isBaseGenre(value)) throw new InvalidCustomRankingDataError('ジャンルが正しくありません')
}

/** ランキングの記録を、決まった項目だけで作り直す（以前の更新で紛れ込んだ conditions などを持ち越さない） */
function rankingRecord(ranking: CustomRankingIndexedDB): CustomRankingIndexedDB {
  return {
    id: ranking.id,
    title: ranking.title,
    baseGenre: ranking.baseGenre,
    createdAt: ranking.createdAt,
    updatedAt: ranking.updatedAt,
    orderIndex: ranking.orderIndex,
    isVisible: ranking.isVisible,
  }
}

/**
 * トランザクションの中の書き込みをまとめて行う。途中で失敗したら、それまでの書き込みも取り消す。
 * IndexedDB は、書き込みの呼び出しが例外を投げた（複製できない値など）だけでは取り消さず、
 * 残りの書き込みが無くなった時点で確定してしまう（条件だけ消えるなどの中途半端な保存になる）
 */
async function writeAtomically<T>(tx: { abort(): void; done: Promise<void> }, work: () => Promise<T>): Promise<T> {
  // 中断したときに done が拒否されても、未処理の拒否として扱われないようにする（await した側には届く）
  tx.done.catch(() => {})
  try {
    const result = await work()
    await tx.done
    return result
  } catch (error) {
    try {
      tx.abort()
    } catch {
      // すでに確定・中断している
    }
    throw error
  }
}

export class CustomRankingManager {
  constructor(private dbManager: DBManager) {}

  /**
   * 新規カスタムランキングを作成。ランキングと条件はすべて書けたときだけ残る
   */
  async createRanking(data: CreateCustomRankingData): Promise<string> {
    checkTitle(data.title)
    checkBaseGenre(data.baseGenre)
    const conditions = validConditions(data.conditions)
    const db = this.dbManager.getDB()
    const now = Date.now()
    const rankingId = newId()

    const tx = db.transaction(['customRankings', 'customRankingConditions'], 'readwrite')
    try {
      return await writeAtomically(tx, async () => {
        const rankings = tx.objectStore('customRankings')
        // 表示順は同じトランザクションの中で決める（続けて作っても同じ順番にならない）
        const last = await rankings.index('orderIndex').openCursor(null, 'prev')
        const ranking: CustomRankingIndexedDB = {
          id: rankingId,
          title: data.title,
          baseGenre: data.baseGenre,
          createdAt: now,
          updatedAt: now,
          orderIndex: last ? last.value.orderIndex + 1 : 0,
          isVisible: true
        }
        await rankings.add(ranking)
        const conditionStore = tx.objectStore('customRankingConditions')
        for (const condition of conditions) {
          await conditionStore.add({ ...condition, id: newId(), rankingId })
        }
        return rankingId
      })
    } catch (error) {
      console.error('Failed to create custom ranking:', error)
      if (error instanceof InvalidCustomRankingDataError) throw error
      throw new Error(`Failed to create custom ranking: ${messageOf(error)}`)
    }
  }

  /**
   * ID を指定してランキングと条件を書き込む（同じ ID があれば置き換える）。
   * 条件の ID は `${ランキングID}:${順番}` に固定するので、同じ内容を何度書いても増えない
   * （旧形式からの移行が重なって走っても重複しないようにするため）
   */
  async putRankingWithConditions(
    ranking: CustomRankingIndexedDB,
    conditions: Omit<CustomRankingConditionIndexedDB, 'id' | 'rankingId' | 'orderIndex'>[]
  ): Promise<void> {
    const db = this.dbManager.getDB()
    const tx = db.transaction(['customRankings', 'customRankingConditions'], 'readwrite')
    await writeAtomically(tx, async () => {
      const conditionStore = tx.objectStore('customRankingConditions')

      let cursor = await conditionStore.index('rankingId').openCursor(ranking.id)
      while (cursor) {
        await cursor.delete()
        cursor = await cursor.continue()
      }

      for (const [index, condition] of conditions.entries()) {
        await conditionStore.put({
          tag: condition.tag,
          operator: condition.operator,
          tagType: condition.tagType,
          id: `${ranking.id}:${index}`,
          rankingId: ranking.id,
          orderIndex: index
        })
      }

      await tx.objectStore('customRankings').put(rankingRecord(ranking))
    })
  }

  /**
   * カスタムランキングを更新。条件を差し替えるときは、古い条件の削除と新しい条件の追加が
   * すべて成功したときだけ確定する（途中で失敗しても元の条件が残る）
   */
  async updateRanking(rankingId: string, updates: UpdateCustomRankingData): Promise<void> {
    if (updates.title !== undefined) checkTitle(updates.title)
    if (updates.baseGenre !== undefined) checkBaseGenre(updates.baseGenre)
    const conditions = updates.conditions === undefined ? undefined : validConditions(updates.conditions)
    const db = this.dbManager.getDB()
    const tx = db.transaction(['customRankings', 'customRankingConditions'], 'readwrite')

    try {
      await writeAtomically(tx, async () => {
        const rankings = tx.objectStore('customRankings')
        const ranking = await rankings.get(rankingId)
        if (!ranking) {
          throw new Error('Custom ranking not found')
        }

        const updatedRanking = rankingRecord({
          ...ranking,
          title: updates.title ?? ranking.title,
          baseGenre: updates.baseGenre ?? ranking.baseGenre,
          isVisible: updates.isVisible ?? ranking.isVisible,
          updatedAt: Date.now()
        })

        if (conditions) {
          const conditionStore = tx.objectStore('customRankingConditions')
          let cursor = await conditionStore.index('rankingId').openCursor(rankingId)
          while (cursor) {
            await cursor.delete()
            cursor = await cursor.continue()
          }
          for (const condition of conditions) {
            await conditionStore.add({ ...condition, id: newId(), rankingId })
          }
        }

        await rankings.put(updatedRanking)
      })
    } catch (error) {
      console.error('Failed to update custom ranking:', error)
      if (error instanceof InvalidCustomRankingDataError) throw error
      throw new Error(`Failed to update custom ranking: ${messageOf(error)}`)
    }
  }

  /**
   * カスタムランキングを削除（条件とランキングは一緒に消えるか、どちらも残る）
   */
  async deleteRanking(rankingId: string): Promise<void> {
    const db = this.dbManager.getDB()
    const tx = db.transaction(['customRankings', 'customRankingConditions'], 'readwrite')

    try {
      await writeAtomically(tx, async () => {
        const conditionStore = tx.objectStore('customRankingConditions')
        let cursor = await conditionStore.index('rankingId').openCursor(rankingId)
        while (cursor) {
          await cursor.delete()
          cursor = await cursor.continue()
        }
        await tx.objectStore('customRankings').delete(rankingId)
      })
    } catch (error) {
      console.error('Failed to delete custom ranking:', error)
      throw new Error(`Failed to delete custom ranking: ${messageOf(error)}`)
    }
  }

  /**
   * 単一カスタムランキングを取得（条件付き）
   */
  async getRanking(rankingId: string): Promise<CustomRankingWithConditions | undefined> {
    const db = this.dbManager.getDB()
    const tx = db.transaction(['customRankings', 'customRankingConditions'], 'readonly')
    
    try {
      const ranking = await tx.objectStore('customRankings').get(rankingId)
      if (!ranking) {
        return undefined
      }
      
      const conditionsIndex = tx.objectStore('customRankingConditions').index('rankingId-orderIndex')
      const conditionsRange = IDBKeyRange.bound([rankingId, 0], [rankingId, Infinity])
      const conditions = await conditionsIndex.getAll(conditionsRange)
      
      return {
        ...ranking,
        conditions: conditions.sort((a, b) => a.orderIndex - b.orderIndex)
      }
    } catch (error) {
      console.error('Failed to get custom ranking:', error)
      throw new Error(`Failed to get custom ranking: ${error.message}`)
    }
  }

  /**
   * すべてのカスタムランキングを取得（条件付き）
   */
  async getAllRankings(sortOrder: CustomRankingSortOrder = 'orderIndex-asc'): Promise<CustomRankingWithConditions[]> {
    const db = this.dbManager.getDB()
    const tx = db.transaction(['customRankings', 'customRankingConditions'], 'readonly')
    
    try {
      const rankings = await tx.objectStore('customRankings').getAll()
      const allConditions = await tx.objectStore('customRankingConditions').getAll()
      
      // 条件をランキングIDでグループ化
      const conditionMap = new Map<string, CustomRankingConditionIndexedDB[]>()
      allConditions.forEach(condition => {
        if (!conditionMap.has(condition.rankingId)) {
          conditionMap.set(condition.rankingId, [])
        }
        conditionMap.get(condition.rankingId)!.push(condition)
      })
      
      // ランキングと条件を結合
      const rankingsWithConditions: CustomRankingWithConditions[] = rankings.map(ranking => ({
        ...ranking,
        conditions: (conditionMap.get(ranking.id) || []).sort((a, b) => a.orderIndex - b.orderIndex)
      }))
      
      return this.sortRankings(rankingsWithConditions, sortOrder)
    } catch (error) {
      console.error('Failed to get all custom rankings:', error)
      throw new Error(`Failed to get all custom rankings: ${error.message}`)
    }
  }

  /**
   * 表示されているカスタムランキングのみを取得
   */
  async getVisibleRankings(sortOrder: CustomRankingSortOrder = 'orderIndex-asc'): Promise<CustomRankingWithConditions[]> {
    const allRankings = await this.getAllRankings(sortOrder)
    return allRankings.filter(ranking => ranking.isVisible)
  }

  /**
   * カスタムランキングの表示順序を更新（すべての順番が変わるか、どれも変わらない）
   */
  async updateRankingOrder(rankingOrders: { id: string; orderIndex: number }[]): Promise<void> {
    const db = this.dbManager.getDB()
    const tx = db.transaction('customRankings', 'readwrite')

    try {
      await writeAtomically(tx, async () => {
        for (const { id, orderIndex } of rankingOrders) {
          const ranking = await tx.store.get(id)
          if (ranking) {
            await tx.store.put(rankingRecord({ ...ranking, orderIndex, updatedAt: Date.now() }))
          }
        }
      })
    } catch (error) {
      console.error('Failed to update ranking order:', error)
      throw new Error(`Failed to update ranking order: ${messageOf(error)}`)
    }
  }

  /**
   * カスタムランキングの表示/非表示を切り替え
   */
  async toggleVisibility(rankingId: string): Promise<void> {
    const db = this.dbManager.getDB()
    const tx = db.transaction('customRankings', 'readwrite')

    try {
      await writeAtomically(tx, async () => {
        const ranking = await tx.store.get(rankingId)
        if (!ranking) {
          throw new Error('Custom ranking not found')
        }
        await tx.store.put(rankingRecord({ ...ranking, isVisible: !ranking.isVisible, updatedAt: Date.now() }))
      })
    } catch (error) {
      console.error('Failed to toggle ranking visibility:', error)
      throw new Error(`Failed to toggle ranking visibility: ${messageOf(error)}`)
    }
  }

  /**
   * タイトルの重複チェック
   */
  async isUniqueTitle(title: string, excludeId?: string): Promise<boolean> {
    try {
      const rankings = await this.getAllRankings()
      return !rankings.some(ranking => 
        ranking.title === title && ranking.id !== excludeId
      )
    } catch (error) {
      console.error('Failed to check title uniqueness:', error)
      return false
    }
  }

  /**
   * ランキングをソート
   */
  private sortRankings(rankings: CustomRankingWithConditions[], sortOrder: CustomRankingSortOrder): CustomRankingWithConditions[] {
    return [...rankings].sort((a, b) => {
      switch (sortOrder) {
        case 'orderIndex-asc':
          return a.orderIndex - b.orderIndex
        case 'createdAt-desc':
          return b.createdAt - a.createdAt
        case 'createdAt-asc':
          return a.createdAt - b.createdAt
        case 'updatedAt-desc':
          return b.updatedAt - a.updatedAt
        case 'updatedAt-asc':
          return a.updatedAt - b.updatedAt
        case 'title-asc':
          return a.title.localeCompare(b.title, undefined, { numeric: true, sensitivity: 'base' })
        case 'title-desc':
          return b.title.localeCompare(a.title, undefined, { numeric: true, sensitivity: 'base' })
        default:
          return a.orderIndex - b.orderIndex
      }
    })
  }

  /**
   * カスタムランキング内の条件を検索
   */
  async searchRankings(query: string): Promise<CustomRankingWithConditions[]> {
    try {
      const allRankings = await this.getAllRankings()
      const lowercaseQuery = query.toLowerCase()
      
      return allRankings.filter(ranking => 
        ranking.title.toLowerCase().includes(lowercaseQuery) ||
        ranking.conditions.some(condition => 
          condition.tag.toLowerCase().includes(lowercaseQuery)
        )
      )
    } catch (error) {
      console.error('Failed to search rankings:', error)
      return []
    }
  }
}