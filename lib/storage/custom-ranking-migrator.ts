import { CustomRankingManager } from './custom-rankings'
import type { CustomRanking, CustomRankingStorage } from '@/types/custom-ranking'
import type { CreateCustomRankingData } from './types'

interface MigrationResult {
  success: boolean
  migratedCount: number
  errors: string[]
  selectedId?: string
}

export class CustomRankingMigrator {
  private readonly STORAGE_KEY = 'custom-rankings'
  private readonly ORDER_STORAGE_KEY = 'customRankingsOrder'
  private readonly MIGRATION_FLAG_KEY = 'custom-rankings-migration-completed'

  constructor(private manager: CustomRankingManager) {}

  /**
   * localStorageからIndexedDBへの移行が必要かチェック
   */
  async needsMigration(): Promise<boolean> {
    // 移行完了フラグをチェック
    if (typeof window === 'undefined') return false
    
    try {
      const migrationCompleted = localStorage.getItem(this.MIGRATION_FLAG_KEY)
      if (migrationCompleted) return false
      
      // localStorageにデータが存在するかチェック
      const localStorageData = localStorage.getItem(this.STORAGE_KEY)
      if (!localStorageData) return false
      
      const parsed = JSON.parse(localStorageData) as CustomRankingStorage
      return parsed.rankings && parsed.rankings.length > 0
    } catch (error) {
      console.warn('Failed to check migration need:', error)
      return false
    }
  }

  /**
   * 移行を実行
   */
  async migrate(): Promise<MigrationResult> {
    const result: MigrationResult = {
      success: false,
      migratedCount: 0,
      errors: []
    }

    try {
      // localStorage から既存データを読み込み
      const localStorageData = this.readLocalStorageData()
      if (!localStorageData) {
        result.success = true
        return result
      }

      // 順序情報を読み込み
      const orderData = this.readOrderData()

      // IndexedDBへ移行
      const migrationResults = await this.migrateToIndexedDB(localStorageData, orderData)
      
      result.migratedCount = migrationResults.migratedCount
      result.errors = migrationResults.errors
      result.selectedId = localStorageData.selectedId

      // 移行検証
      if (migrationResults.errors.length === 0) {
        await this.validateMigration(localStorageData, result)
        
        if (result.success) {
          // 移行完了フラグを設定
          this.markMigrationCompleted()
          
          // localStorage のバックアップを作成して削除
          this.cleanupLocalStorage()
        }
      }

    } catch (error) {
      console.error('Migration failed:', error)
      result.errors.push(`Migration failed: ${error.message}`)
    }

    result.success = result.errors.length === 0
    return result
  }

  /**
   * localStorage からデータを読み込み
   */
  private readLocalStorageData(): CustomRankingStorage | null {
    if (typeof window === 'undefined') return null

    try {
      const stored = localStorage.getItem(this.STORAGE_KEY)
      if (!stored) return null

      const parsed = JSON.parse(stored) as CustomRankingStorage
      
      // 後方互換性: tagTypeが存在しない古いデータにデフォルト値を追加
      if (parsed.rankings) {
        parsed.rankings = parsed.rankings.map((ranking: any) => ({
          ...ranking,
          conditions: ranking.conditions?.map((condition: any) => ({
            ...condition,
            tagType: condition.tagType || 'both'
          })) || []
        }))
      }

      return parsed
    } catch (error) {
      console.error('Failed to read localStorage data:', error)
      return null
    }
  }

  /**
   * 順序データを読み込み
   */
  private readOrderData(): Array<{id: string, order: number, isVisible: boolean}> {
    if (typeof window === 'undefined') return []

    try {
      const stored = localStorage.getItem(this.ORDER_STORAGE_KEY)
      if (!stored) return []

      return JSON.parse(stored)
    } catch (error) {
      console.warn('Failed to read order data:', error)
      return []
    }
  }

  /**
   * IndexedDBへの移行実行
   */
  private async migrateToIndexedDB(
    localStorageData: CustomRankingStorage, 
    orderData: Array<{id: string, order: number, isVisible: boolean}>
  ): Promise<{migratedCount: number, errors: string[]}> {
    const errors: string[] = []
    let migratedCount = 0

    // 順序情報をマップ化
    const orderMap = new Map<string, {order: number, isVisible: boolean}>()
    orderData.forEach(item => {
      orderMap.set(item.id, { order: item.order, isVisible: item.isVisible })
    })

    for (const oldRanking of localStorageData.rankings) {
      try {
        const orderInfo = orderMap.get(oldRanking.id)
        
        const createData: CreateCustomRankingData = {
          title: oldRanking.title,
          baseGenre: oldRanking.baseGenre,
          conditions: oldRanking.conditions.map((condition, index) => ({
            tag: condition.tag,
            operator: condition.operator,
            tagType: condition.tagType,
            orderIndex: index
          }))
        }

        const newRankingId = await this.manager.createRanking(createData)

        // 順序情報があれば適用
        if (orderInfo) {
          await this.manager.updateRankingOrder([{
            id: newRankingId,
            orderIndex: orderInfo.order
          }])

          if (!orderInfo.isVisible) {
            await this.manager.toggleVisibility(newRankingId)
          }
        }

        migratedCount++
      } catch (error) {
        const errorMsg = `Failed to migrate ranking "${oldRanking.title}": ${error.message}`
        console.error(errorMsg)
        errors.push(errorMsg)
      }
    }

    return { migratedCount, errors }
  }

  /**
   * 移行検証
   */
  private async validateMigration(
    originalData: CustomRankingStorage, 
    result: MigrationResult
  ): Promise<void> {
    try {
      const migratedRankings = await this.manager.getAllRankings()
      
      // 件数チェック
      if (migratedRankings.length !== originalData.rankings.length) {
        throw new Error(
          `Count mismatch: expected ${originalData.rankings.length}, got ${migratedRankings.length}`
        )
      }

      // 各ランキングの内容チェック
      for (const originalRanking of originalData.rankings) {
        const migratedRanking = migratedRankings.find(r => r.title === originalRanking.title)
        
        if (!migratedRanking) {
          throw new Error(`Ranking "${originalRanking.title}" not found after migration`)
        }

        // 条件数チェック
        if (migratedRanking.conditions.length !== originalRanking.conditions.length) {
          throw new Error(
            `Condition count mismatch for "${originalRanking.title}": expected ${originalRanking.conditions.length}, got ${migratedRanking.conditions.length}`
          )
        }

        // 基本情報チェック
        if (migratedRanking.baseGenre !== originalRanking.baseGenre) {
          throw new Error(`Base genre mismatch for "${originalRanking.title}"`)
        }
      }

      result.success = true
    } catch (error) {
      result.errors.push(`Migration validation failed: ${error.message}`)
    }
  }

  /**
   * 移行完了フラグを設定
   */
  private markMigrationCompleted(): void {
    try {
      localStorage.setItem(this.MIGRATION_FLAG_KEY, Date.now().toString())
    } catch (error) {
      console.warn('Failed to mark migration completed:', error)
    }
  }

  /**
   * localStorage のクリーンアップ（バックアップ保持）
   */
  private cleanupLocalStorage(): void {
    try {
      // バックアップ作成
      const mainData = localStorage.getItem(this.STORAGE_KEY)
      const orderData = localStorage.getItem(this.ORDER_STORAGE_KEY)
      
      if (mainData) {
        localStorage.setItem(`${this.STORAGE_KEY}-backup`, mainData)
      }
      if (orderData) {
        localStorage.setItem(`${this.ORDER_STORAGE_KEY}-backup`, orderData)
      }

      // 元データ削除
      localStorage.removeItem(this.STORAGE_KEY)
      localStorage.removeItem(this.ORDER_STORAGE_KEY)
      
      console.log('localStorage cleanup completed with backup')
    } catch (error) {
      console.warn('Failed to cleanup localStorage:', error)
    }
  }

  /**
   * バックアップからの復元
   */
  async restoreFromBackup(): Promise<boolean> {
    try {
      const backupData = localStorage.getItem(`${this.STORAGE_KEY}-backup`)
      const backupOrderData = localStorage.getItem(`${this.ORDER_STORAGE_KEY}-backup`)
      
      if (backupData) {
        localStorage.setItem(this.STORAGE_KEY, backupData)
      }
      if (backupOrderData) {
        localStorage.setItem(this.ORDER_STORAGE_KEY, backupOrderData)
      }
      
      // 移行フラグを削除
      localStorage.removeItem(this.MIGRATION_FLAG_KEY)
      
      return true
    } catch (error) {
      console.error('Failed to restore from backup:', error)
      return false
    }
  }

  /**
   * 移行状態をリセット（開発・テスト用）
   */
  resetMigrationState(): void {
    if (typeof window === 'undefined') return
    
    try {
      localStorage.removeItem(this.MIGRATION_FLAG_KEY)
      console.log('Migration state reset')
    } catch (error) {
      console.warn('Failed to reset migration state:', error)
    }
  }
}