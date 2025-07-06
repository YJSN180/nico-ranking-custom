import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { DBManager } from '@/lib/storage/db-manager'
import type { IDBPDatabase } from 'idb'
import 'fake-indexeddb/auto'

// テスト間でデータベースをクリーンアップ
afterEach(() => {
  vi.clearAllMocks()
})

describe('DBManager', () => {
  describe('初期化', () => {
    it('データベースを初期化できる', async () => {
      // Arrange
      const dbManager = new DBManager()
      
      // Act & Assert
      await expect(dbManager.init()).resolves.not.toThrow()
    })

    it('データベースのバージョンが5である', async () => {
      // Arrange
      const dbManager = new DBManager()
      
      // Act
      await dbManager.init()
      
      // Assert
      expect(dbManager.getVersion()).toBe(5)
    })

    it('必要なオブジェクトストアが作成される', async () => {
      // Arrange
      const dbManager = new DBManager()
      
      // Act
      await dbManager.init()
      
      // Assert
      const storeNames = await dbManager.getStoreNames()
      expect(storeNames).toContain('favorites')
      expect(storeNames).toContain('history')
      expect(storeNames).toContain('mylists')
      expect(storeNames).toContain('mylistVideos')
    })
  })

  describe('お気に入りストア', () => {
    it('お気に入りストアにインデックスが作成される', async () => {
      // Arrange
      const dbManager = new DBManager()
      
      // Act
      await dbManager.init()
      
      // Assert
      const indexes = await dbManager.getStoreIndexes('favorites')
      expect(indexes).toContain('addedAt')
      expect(indexes).toContain('tags')
    })

    it('tagsインデックスはmultiEntryである', async () => {
      // Arrange
      const dbManager = new DBManager()
      
      // Act
      await dbManager.init()
      
      // Assert
      const indexInfo = await dbManager.getIndexInfo('favorites', 'tags')
      expect(indexInfo.multiEntry).toBe(true)
    })
  })

  describe('視聴履歴ストア', () => {
    it('視聴履歴ストアにwatchedAtインデックスが作成される', async () => {
      // Arrange
      const dbManager = new DBManager()
      
      // Act
      await dbManager.init()
      
      // Assert
      const indexes = await dbManager.getStoreIndexes('history')
      expect(indexes).toContain('watchedAt')
    })
  })

  describe('マイリストストア', () => {
    it('マイリストストアがautoIncrementではない', async () => {
      // Arrange
      const dbManager = new DBManager()
      
      // Act
      await dbManager.init()
      
      // Assert
      const storeInfo = await dbManager.getStoreInfo('mylists')
      expect(storeInfo.autoIncrement).toBe(false)
      expect(storeInfo.keyPath).toBe('id')
    })

    it('マイリストストアに必要なインデックスが作成される', async () => {
      // Arrange
      const dbManager = new DBManager()
      
      // Act
      await dbManager.init()
      
      // Assert
      const indexes = await dbManager.getStoreIndexes('mylists')
      expect(indexes).toContain('name')
      expect(indexes).toContain('createdAt')
      expect(indexes).toContain('updatedAt')
    })
  })

  describe('エラーハンドリング', () => {
    it('データベース未初期化時にエラーを投げる', async () => {
      // Arrange
      const dbManager = new DBManager()
      // 初期化せずにメソッドを呼び出す
      
      // Act & Assert
      await expect(dbManager.getStoreNames()).rejects.toThrow('Database not initialized')
      await expect(dbManager.getStoreIndexes('favorites')).rejects.toThrow('Database not initialized')
      await expect(dbManager.getIndexInfo('favorites', 'tags')).rejects.toThrow('Database not initialized')
    })
  })

  describe('データベース削除', () => {
    it.skip('データベースを削除できる', async () => {
      // Arrange
      const dbManager = new DBManager()
      await dbManager.init()
      
      // Act
      await dbManager.deleteDatabase()
      
      // Assert
      expect(dbManager.isInitialized()).toBe(false)
    })
  })
})