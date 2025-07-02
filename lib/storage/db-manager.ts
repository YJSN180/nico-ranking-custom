// Import types and functions
import type { IDBPDatabase } from 'idb'
import { openDB, deleteDB } from 'idb'

export interface IndexInfo {
  multiEntry: boolean
  unique: boolean
}

export interface StoreInfo {
  autoIncrement: boolean
  keyPath: string | string[] | null
}

export class DBManager {
  private db: IDBPDatabase | null = null
  private readonly dbName = 'nicoran-db'
  private readonly version = 5  // watchHistory削除

  async init(): Promise<void> {
    // eslint-disable-next-line no-console
    console.log('[DBManager] init() called')
    
    // Check if running in browser environment
    if (typeof window === 'undefined') {
      // eslint-disable-next-line no-console
      console.warn('[DBManager] Not in browser environment, skipping initialization')
      throw new Error('IndexedDB is only available in the browser')
    }
    
    // Check if IndexedDB is available
    if (!('indexedDB' in window)) {
      // eslint-disable-next-line no-console
      console.error('[DBManager] IndexedDB not available')
      throw new Error('IndexedDB is not available in this browser')
    }
    
    try {
      // eslint-disable-next-line no-console
      console.log('[DBManager] Calling openDB...')
      this.db = await this.openDB()
      // eslint-disable-next-line no-console
      console.log('[DBManager] openDB completed successfully')
    } catch (error) {
      // eslint-disable-next-line no-console
      console.error('[DBManager] init() error:', error)
      throw error
    }
  }

  private async openDB(): Promise<IDBPDatabase> {
    // eslint-disable-next-line no-console
    console.log(`[DBManager] openDB() called - name: ${this.dbName}, version: ${this.version}`)
    return await openDB(this.dbName, this.version, {
      upgrade(db, oldVersion, _newVersion, transaction) {
        // eslint-disable-next-line no-console
        console.log(`[DBManager] upgrade callback triggered - oldVersion: ${oldVersion}`)
        // お気に入りストア（互換性のため残す）
        if (!db.objectStoreNames.contains('favorites')) {
          const favStore = db.createObjectStore('favorites', {
            keyPath: 'id'
          })
          favStore.createIndex('addedAt', 'addedAt')
          favStore.createIndex('tags', 'tags', { multiEntry: true })
        }

        // 視聴履歴ストア
        if (!db.objectStoreNames.contains('history')) {
          const histStore = db.createObjectStore('history', {
            keyPath: 'id'
          })
          histStore.createIndex('watchedAt', 'watchedAt')
        }

        // マイリストストア（v2で更新）
        if (!db.objectStoreNames.contains('mylists')) {
          const mylistStore = db.createObjectStore('mylists', {
            keyPath: 'id'
          })
          mylistStore.createIndex('name', 'name')
          mylistStore.createIndex('createdAt', 'createdAt')
          mylistStore.createIndex('updatedAt', 'updatedAt')
        } else if (oldVersion < 3) {
          // isDefaultインデックスを削除
          const mylistStore = transaction.objectStore('mylists')
          if (mylistStore.indexNames.contains('isDefault')) {
            mylistStore.deleteIndex('isDefault')
          }
        }

        // マイリスト内動画ストア（v2で新規作成）
        if (!db.objectStoreNames.contains('mylistVideos')) {
          const mylistVideosStore = db.createObjectStore('mylistVideos', {
            keyPath: ['mylistId', 'id']
          })
          mylistVideosStore.createIndex('mylistId', 'mylistId')
          mylistVideosStore.createIndex('id', 'id')
          mylistVideosStore.createIndex('addedAt', 'addedAt')
          mylistVideosStore.createIndex('mylistId-addedAt', ['mylistId', 'addedAt'])
        }
        
        // 視聴履歴ストアを削除（v5で削除）
        if (db.objectStoreNames.contains('watchHistory')) {
          db.deleteObjectStore('watchHistory')
        }
      }
    })
  }

  getVersion(): number {
    return this.version
  }

  async getStoreNames(): Promise<string[]> {
    if (!this.db) {
      throw new Error('Database not initialized')
    }
    return Array.from(this.db.objectStoreNames)
  }

  async getStoreIndexes(storeName: string): Promise<string[]> {
    if (!this.db) {
      throw new Error('Database not initialized')
    }
    const tx = this.db.transaction(storeName, 'readonly')
    const store = tx.objectStore(storeName)
    return Array.from(store.indexNames)
  }

  async getIndexInfo(storeName: string, indexName: string): Promise<IndexInfo> {
    if (!this.db) {
      throw new Error('Database not initialized')
    }
    const tx = this.db.transaction(storeName, 'readonly')
    const store = tx.objectStore(storeName)
    const index = store.index(indexName)
    
    return {
      multiEntry: index.multiEntry,
      unique: index.unique
    }
  }

  async getStoreInfo(storeName: string): Promise<StoreInfo> {
    if (!this.db) {
      throw new Error('Database not initialized')
    }
    const tx = this.db.transaction(storeName, 'readonly')
    const store = tx.objectStore(storeName)
    
    return {
      autoIncrement: store.autoIncrement,
      keyPath: store.keyPath
    }
  }

  async deleteDatabase(): Promise<void> {
    if (this.db) {
      this.db.close()
      this.db = null
    }
    
    // Only delete if in browser environment
    if (typeof window !== 'undefined') {
      await deleteDB(this.dbName)
    }
  }

  isInitialized(): boolean {
    return this.db !== null
  }

  getDB(): IDBPDatabase {
    if (!this.db) {
      throw new Error('Database not initialized')
    }
    return this.db
  }
}