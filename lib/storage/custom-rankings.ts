import { DBManager } from './db-manager'
import type { 
  CustomRankingIndexedDB, 
  CustomRankingConditionIndexedDB,
  CustomRankingWithConditions,
  CreateCustomRankingData,
  UpdateCustomRankingData,
  CustomRankingSortOrder 
} from './types'

export class CustomRankingManager {
  constructor(private dbManager: DBManager) {}

  /**
   * 新規カスタムランキングを作成
   */
  async createRanking(data: CreateCustomRankingData): Promise<string> {
    const db = this.dbManager.getDB()
    const now = Date.now()
    const rankingId = crypto.randomUUID()
    
    // 次の表示順序を取得
    const nextOrderIndex = await this.getNextOrderIndex()
    
    const ranking: CustomRankingIndexedDB = {
      id: rankingId,
      title: data.title,
      baseGenre: data.baseGenre,
      createdAt: now,
      updatedAt: now,
      orderIndex: nextOrderIndex,
      isVisible: true
    }
    
    const conditions: CustomRankingConditionIndexedDB[] = data.conditions.map((condition, index) => ({
      id: crypto.randomUUID(),
      rankingId,
      ...condition,
      orderIndex: index
    }))
    
    // 原子的操作でランキングと条件を作成
    const tx = db.transaction(['customRankings', 'customRankingConditions'], 'readwrite')
    
    try {
      await tx.objectStore('customRankings').add(ranking)
      
      for (const condition of conditions) {
        await tx.objectStore('customRankingConditions').add(condition)
      }
      
      await tx.done
      return rankingId
    } catch (error) {
      console.error('Failed to create custom ranking:', error)
      throw new Error(`Failed to create custom ranking: ${error.message}`)
    }
  }

  /**
   * カスタムランキングを更新
   */
  async updateRanking(rankingId: string, updates: UpdateCustomRankingData): Promise<void> {
    const db = this.dbManager.getDB()
    const tx = db.transaction(['customRankings', 'customRankingConditions'], 'readwrite')
    
    try {
      // 既存ランキングを取得
      const ranking = await tx.objectStore('customRankings').get(rankingId)
      if (!ranking) {
        throw new Error('Custom ranking not found')
      }
      
      // ランキングを更新
      const updatedRanking: CustomRankingIndexedDB = {
        ...ranking,
        ...updates,
        updatedAt: Date.now()
      }
      
      // 条件が更新される場合、既存条件を削除して新規作成
      if (updates.conditions) {
        // 既存条件を削除
        const conditionIndex = tx.objectStore('customRankingConditions').index('rankingId')
        const conditionCursor = await conditionIndex.openCursor(rankingId)
        
        if (conditionCursor) {
          await conditionCursor.delete()
          while (await conditionCursor.continue()) {
            await conditionCursor.delete()
          }
        }
        
        // 新しい条件を追加
        const newConditions: CustomRankingConditionIndexedDB[] = updates.conditions.map((condition, index) => ({
          id: crypto.randomUUID(),
          rankingId,
          ...condition,
          orderIndex: index
        }))
        
        for (const condition of newConditions) {
          await tx.objectStore('customRankingConditions').add(condition)
        }
      }
      
      await tx.objectStore('customRankings').put(updatedRanking)
      await tx.done
    } catch (error) {
      console.error('Failed to update custom ranking:', error)
      throw new Error(`Failed to update custom ranking: ${error.message}`)
    }
  }

  /**
   * カスタムランキングを削除
   */
  async deleteRanking(rankingId: string): Promise<void> {
    const db = this.dbManager.getDB()
    const tx = db.transaction(['customRankings', 'customRankingConditions'], 'readwrite')
    
    try {
      // 関連する条件をすべて削除
      const conditionIndex = tx.objectStore('customRankingConditions').index('rankingId')
      const conditionCursor = await conditionIndex.openCursor(rankingId)
      
      if (conditionCursor) {
        await conditionCursor.delete()
        while (await conditionCursor.continue()) {
          await conditionCursor.delete()
        }
      }
      
      // ランキングを削除
      await tx.objectStore('customRankings').delete(rankingId)
      await tx.done
    } catch (error) {
      console.error('Failed to delete custom ranking:', error)
      throw new Error(`Failed to delete custom ranking: ${error.message}`)
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
   * カスタムランキングの表示順序を更新
   */
  async updateRankingOrder(rankingOrders: { id: string; orderIndex: number }[]): Promise<void> {
    const db = this.dbManager.getDB()
    const tx = db.transaction('customRankings', 'readwrite')
    
    try {
      for (const { id, orderIndex } of rankingOrders) {
        const ranking = await tx.store.get(id)
        if (ranking) {
          ranking.orderIndex = orderIndex
          ranking.updatedAt = Date.now()
          await tx.store.put(ranking)
        }
      }
      
      await tx.done
    } catch (error) {
      console.error('Failed to update ranking order:', error)
      throw new Error(`Failed to update ranking order: ${error.message}`)
    }
  }

  /**
   * カスタムランキングの表示/非表示を切り替え
   */
  async toggleVisibility(rankingId: string): Promise<void> {
    const db = this.dbManager.getDB()
    const tx = db.transaction('customRankings', 'readwrite')
    
    try {
      const ranking = await tx.store.get(rankingId)
      if (!ranking) {
        throw new Error('Custom ranking not found')
      }
      
      ranking.isVisible = !ranking.isVisible
      ranking.updatedAt = Date.now()
      await tx.store.put(ranking)
      await tx.done
    } catch (error) {
      console.error('Failed to toggle ranking visibility:', error)
      throw new Error(`Failed to toggle ranking visibility: ${error.message}`)
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
   * 次の表示順序インデックスを取得
   */
  private async getNextOrderIndex(): Promise<number> {
    const db = this.dbManager.getDB()
    const tx = db.transaction('customRankings', 'readonly')
    
    try {
      const index = tx.store.index('orderIndex')
      const cursor = await index.openCursor(null, 'prev') // 降順で最初の1件
      
      if (cursor) {
        return cursor.value.orderIndex + 1
      }
      
      return 0 // 初回作成
    } catch (error) {
      console.error('Failed to get next order index:', error)
      return 0
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