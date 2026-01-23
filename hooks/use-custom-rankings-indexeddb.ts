'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { DBManager } from '@/lib/storage/db-manager'
import { CustomRankingManager } from '@/lib/storage/custom-rankings'
import { CustomRankingMigrator } from '@/lib/storage/custom-ranking-migrator'
import type { 
  CustomRankingWithConditions, 
  CreateCustomRankingData, 
  UpdateCustomRankingData,
  CustomRankingSortOrder 
} from '@/lib/storage/types'

type StorageBackend = 'indexeddb' | 'loading' | 'error'

interface UseCustomRankingsIndexedDBResult {
  rankings: CustomRankingWithConditions[]
  selectedId?: string
  selectedRanking?: CustomRankingWithConditions
  createRanking: (data: CreateCustomRankingData) => Promise<string | null>
  updateRanking: (id: string, updates: UpdateCustomRankingData) => Promise<boolean>
  deleteRanking: (id: string) => Promise<boolean>
  selectRanking: (id: string | undefined) => Promise<boolean>
  toggleVisibility: (id: string) => Promise<boolean>
  updateRankingOrder: (rankingOrders: { id: string; orderIndex: number }[]) => Promise<boolean>
  isUniqueTitle: (title: string, excludeId?: string) => Promise<boolean>
  searchRankings: (query: string) => Promise<CustomRankingWithConditions[]>
  isLoading: boolean
  storageBackend: StorageBackend
  migrationStatus?: { success: boolean; migratedCount: number; errors: string[] }
}

export function useCustomRankingsIndexedDB(): UseCustomRankingsIndexedDBResult {
  const [rankings, setRankings] = useState<CustomRankingWithConditions[]>([])
  const [selectedId, setSelectedId] = useState<string | undefined>()
  const [isLoading, setIsLoading] = useState(true)
  const [storageBackend, setStorageBackend] = useState<StorageBackend>('loading')
  const [migrationStatus, setMigrationStatus] = useState<{ success: boolean; migratedCount: number; errors: string[] }>()

  const dbManagerRef = useRef<DBManager | null>(null)
  const managerRef = useRef<CustomRankingManager | null>(null)

  // 初期化とマイグレーション
  useEffect(() => {
    let mounted = true

    const init = async () => {
      // SSR環境では実行しない
      if (typeof window === 'undefined') {
        return
      }

      try {
        // IndexedDB 初期化を試行
        if (!dbManagerRef.current) {
          dbManagerRef.current = new DBManager()
          await dbManagerRef.current.init()
          managerRef.current = new CustomRankingManager(dbManagerRef.current)
        }

        if (!mounted) return

        // マイグレーションチェック
        const migrator = new CustomRankingMigrator(managerRef.current)
        if (await migrator.needsMigration()) {
          console.debug('Starting custom ranking migration...')
          const result = await migrator.migrate()
          setMigrationStatus(result)

          if (result.success) {
            console.debug(`Migration completed: ${result.migratedCount} rankings migrated`)
            if (result.selectedId) {
              setSelectedId(result.selectedId)
            }
          } else {
            console.error('Migration failed:', result.errors)
          }
        }

        // IndexedDB から全ランキング読み込み
        const allRankings = await managerRef.current.getAllRankings()
        if (mounted) {
          setRankings(allRankings)
          setStorageBackend('indexeddb')
        }

      } catch (error) {
        console.error('Failed to initialize IndexedDB:', error)
        if (mounted) {
          setStorageBackend('error')
          setIsLoading(false)
        }
      } finally {
        if (mounted) {
          setIsLoading(false)
        }
      }
    }

    init()

    return () => {
      mounted = false
    }
  }, [])

  // IndexedDB から selectedId を読み込み（初回のみ）
  useEffect(() => {
    if (storageBackend === 'indexeddb' && !selectedId && rankings.length > 0 && managerRef.current) {
      // selectedId は状態管理のみで永続化しない（セッションスコープ）
      // 必要に応じて最初のランキングを自動選択
      const firstRanking = rankings.find(r => r.isVisible)
      if (firstRanking) {
        setSelectedId(firstRanking.id)
      }
    }
  }, [storageBackend, rankings, selectedId])


  // エラー状態の場合は空の結果を返す
  if (storageBackend === 'error') {
    return {
      rankings: [],
      selectedId: undefined,
      selectedRanking: undefined,
      createRanking: async () => null,
      updateRanking: async () => false,
      deleteRanking: async () => false,
      selectRanking: async () => false,
      toggleVisibility: async () => false,
      updateRankingOrder: async () => false,
      isUniqueTitle: async () => false,
      searchRankings: async () => [],
      isLoading: false,
      storageBackend,
      migrationStatus
    }
  }

  // IndexedDB 操作関数
  const createRanking = useCallback(async (data: CreateCustomRankingData): Promise<string | null> => {
    if (!managerRef.current) return null

    try {
      const newRankingId = await managerRef.current.createRanking(data)
      
      // ランキング一覧を再読み込み
      const allRankings = await managerRef.current.getAllRankings()
      setRankings(allRankings)
      
      // 新規作成したランキングを選択
      setSelectedId(newRankingId)
      
      return newRankingId
    } catch (error) {
      console.error('Failed to create ranking:', error)
      return null
    }
  }, [])

  const updateRanking = useCallback(async (id: string, updates: UpdateCustomRankingData): Promise<boolean> => {
    if (!managerRef.current) return false

    try {
      await managerRef.current.updateRanking(id, updates)
      
      // ランキング一覧を再読み込み
      const allRankings = await managerRef.current.getAllRankings()
      setRankings(allRankings)
      
      return true
    } catch (error) {
      console.error('Failed to update ranking:', error)
      return false
    }
  }, [])

  const deleteRanking = useCallback(async (id: string): Promise<boolean> => {
    if (!managerRef.current) return false

    try {
      await managerRef.current.deleteRanking(id)
      
      // ランキング一覧を再読み込み
      const allRankings = await managerRef.current.getAllRankings()
      setRankings(allRankings)
      
      // 削除されたランキングが選択中だった場合、選択を解除
      if (selectedId === id) {
        setSelectedId(undefined)
      }
      
      return true
    } catch (error) {
      console.error('Failed to delete ranking:', error)
      return false
    }
  }, [selectedId])

  const selectRanking = useCallback(async (id: string | undefined): Promise<boolean> => {
    try {
      setSelectedId(id)
      return true
    } catch (error) {
      console.error('Failed to select ranking:', error)
      return false
    }
  }, [])

  const toggleVisibility = useCallback(async (id: string): Promise<boolean> => {
    if (!managerRef.current) return false

    try {
      await managerRef.current.toggleVisibility(id)
      
      // ランキング一覧を再読み込み
      const allRankings = await managerRef.current.getAllRankings()
      setRankings(allRankings)
      
      return true
    } catch (error) {
      console.error('Failed to toggle visibility:', error)
      return false
    }
  }, [])

  const updateRankingOrder = useCallback(async (rankingOrders: { id: string; orderIndex: number }[]): Promise<boolean> => {
    if (!managerRef.current) return false

    try {
      await managerRef.current.updateRankingOrder(rankingOrders)
      
      // ランキング一覧を再読み込み
      const allRankings = await managerRef.current.getAllRankings()
      setRankings(allRankings)
      
      return true
    } catch (error) {
      console.error('Failed to update ranking order:', error)
      return false
    }
  }, [])

  const isUniqueTitle = useCallback(async (title: string, excludeId?: string): Promise<boolean> => {
    if (!managerRef.current) return false

    try {
      return await managerRef.current.isUniqueTitle(title, excludeId)
    } catch (error) {
      console.error('Failed to check title uniqueness:', error)
      return false
    }
  }, [])

  const searchRankings = useCallback(async (query: string): Promise<CustomRankingWithConditions[]> => {
    if (!managerRef.current) return []

    try {
      return await managerRef.current.searchRankings(query)
    } catch (error) {
      console.error('Failed to search rankings:', error)
      return []
    }
  }, [])

  // 選択中のランキングを計算
  const selectedRanking = selectedId 
    ? rankings.find(r => r.id === selectedId)
    : undefined

  return {
    rankings,
    selectedId,
    selectedRanking,
    createRanking,
    updateRanking,
    deleteRanking,
    selectRanking,
    toggleVisibility,
    updateRankingOrder,
    isUniqueTitle,
    searchRankings,
    isLoading,
    storageBackend,
    migrationStatus
  }
}