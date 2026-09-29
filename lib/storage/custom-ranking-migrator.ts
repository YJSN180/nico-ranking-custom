import { CustomRankingManager } from './custom-rankings'
import type { CustomRanking, CustomRankingStorage } from '@/types/custom-ranking'
import type { CustomRankingConditionIndexedDB } from './types'

export interface MigrationResult {
  success: boolean
  migratedCount: number
  errors: string[]
  selectedId?: string
}

type MigratedCondition = Omit<CustomRankingConditionIndexedDB, 'id' | 'rankingId' | 'orderIndex'>

/**
 * 旧形式のランキングを IndexedDB に置く ID。旧データの ID をそのまま使い、
 * 移行が重なって走っても同じレコードを書くだけで増えないようにする
 */
function legacyRankingId(ranking: CustomRanking, index: number): string {
  return typeof ranking.id === 'string' && ranking.id.length > 0 ? ranking.id : `legacy-custom-ranking-${index}`
}

function hasSameConditions(a: MigratedCondition[], b: MigratedCondition[]): boolean {
  return (
    a.length === b.length &&
    a.every((condition, index) =>
      condition.tag === b[index].tag &&
      condition.operator === b[index].operator &&
      condition.tagType === b[index].tagType
    )
  )
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

let migrationInFlight: Promise<MigrationResult | null> | null = null

/**
 * 旧形式（localStorage）からの移行を、必要なときだけ 1 回走らせる。
 * メイン画面では useCustomRankings が複数同時にマウントされるため、同じタブの呼び出しは
 * 実行中の移行を共有する（別タブと重なっても、旧データの ID のまま書くので増えない）
 */
export function migrateLegacyCustomRankingsOnce(manager: CustomRankingManager): Promise<MigrationResult | null> {
  if (!migrationInFlight) {
    const migrator = new CustomRankingMigrator(manager)
    migrationInFlight = (async (): Promise<MigrationResult | null> => {
      if (!(await migrator.needsMigration())) return null
      return migrator.migrate()
    })().finally(() => {
      migrationInFlight = null
    })
  }
  return migrationInFlight
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
      // 選択中だったランキングを、移行後に保存した ID で選び直す
      result.selectedId = localStorageData.selectedId
        ? migrationResults.storedIds.get(localStorageData.selectedId)
        : undefined

      // 移行検証
      if (migrationResults.errors.length === 0) {
        await this.validateMigration(localStorageData, migrationResults.storedIds, result)
        
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
   * IndexedDBへの移行実行。
   * 旧データの ID のまま書き、既に入っているもの（前回途中まで進んだ移行・別タブの移行・
   * 以前の実装が別 ID で作った同じ内容の複製）は書き直さない。何度走っても件数は増えない
   */
  private async migrateToIndexedDB(
    localStorageData: CustomRankingStorage, 
    orderData: Array<{id: string, order: number, isVisible: boolean}>
  ): Promise<{migratedCount: number, errors: string[], storedIds: Map<string, string>}> {
    const errors: string[] = []
    let migratedCount = 0
    // 旧データの ID → IndexedDB 上の ID
    const storedIds = new Map<string, string>()

    // 順序情報をマップ化
    const orderMap = new Map<string, {order: number, isVisible: boolean}>()
    if (Array.isArray(orderData)) {
      orderData.forEach(item => {
        if (item && typeof item.id === 'string') {
          orderMap.set(item.id, { order: item.order, isVisible: item.isVisible })
        }
      })
    }

    const existingRankings = await this.manager.getAllRankings()
    let nextOrderIndex = existingRankings.reduce((max, ranking) => Math.max(max, ranking.orderIndex + 1), 0)

    for (const [index, oldRanking] of localStorageData.rankings.entries()) {
      const rankingId = legacyRankingId(oldRanking, index)
      try {
        const conditions: MigratedCondition[] = (oldRanking.conditions ?? []).map(condition => ({
          tag: condition.tag,
          operator: condition.operator,
          tagType: condition.tagType || 'both'
        }))

        const alreadyStored =
          existingRankings.find(ranking => ranking.id === rankingId) ??
          existingRankings.find(ranking =>
            ranking.title === oldRanking.title &&
            ranking.baseGenre === oldRanking.baseGenre &&
            hasSameConditions(ranking.conditions, conditions)
          )
        if (alreadyStored) {
          storedIds.set(rankingId, alreadyStored.id)
          migratedCount++
          continue
        }

        const orderInfo = orderMap.get(rankingId)
        const now = Date.now()
        await this.manager.putRankingWithConditions(
          {
            id: rankingId,
            title: oldRanking.title,
            baseGenre: oldRanking.baseGenre,
            createdAt: typeof oldRanking.createdAt === 'number' ? oldRanking.createdAt : now,
            updatedAt: typeof oldRanking.updatedAt === 'number' ? oldRanking.updatedAt : now,
            // 順序と表示状態はランキングのレコードに一緒に書く（後から切り替えると重なった移行で反転する）
            orderIndex: typeof orderInfo?.order === 'number' ? orderInfo.order : nextOrderIndex++,
            isVisible: orderInfo ? orderInfo.isVisible !== false : true
          },
          conditions
        )
        storedIds.set(rankingId, rankingId)
        migratedCount++
      } catch (error) {
        const errorMsg = `Failed to migrate ranking "${oldRanking.title}": ${errorMessage(error)}`
        console.error(errorMsg)
        errors.push(errorMsg)
      }
    }

    return { migratedCount, errors, storedIds }
  }

  /**
   * 移行検証。旧データの各ランキングが IndexedDB にあることを ID で確かめる
   * （総数で比べると、既に入っていたランキングがあるだけで失敗し続けていた）
   */
  private async validateMigration(
    originalData: CustomRankingStorage, 
    storedIds: Map<string, string>,
    result: MigrationResult
  ): Promise<void> {
    try {
      const migratedRankings = await this.manager.getAllRankings()
      const migratedIds = new Set(migratedRankings.map(ranking => ranking.id))

      for (const [index, originalRanking] of originalData.rankings.entries()) {
        const storedId = storedIds.get(legacyRankingId(originalRanking, index))
        if (!storedId || !migratedIds.has(storedId)) {
          throw new Error(`Ranking "${originalRanking.title}" not found after migration`)
        }
      }

      result.success = true
    } catch (error) {
      result.errors.push(`Migration validation failed: ${errorMessage(error)}`)
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
      
      // eslint-disable-next-line no-console
      console.log('localStorage cleanup completed with backup')
    } catch (error) {
      // eslint-disable-next-line no-console
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
      // eslint-disable-next-line no-console
      console.log('Migration state reset')
    } catch (error) {
      // eslint-disable-next-line no-console
      console.warn('Failed to reset migration state:', error)
    }
  }
}