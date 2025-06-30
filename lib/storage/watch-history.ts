import { DBManager } from './db-manager'
import type { WatchHistoryEntry } from './types'

export class WatchHistoryManager {
  private dbManager: DBManager
  private readonly STORE_NAME = 'watchHistory'
  private readonly MAX_ENTRIES = 200
  private readonly MAX_AGE_DAYS = 180
  
  constructor(dbManager: DBManager) {
    this.dbManager = dbManager
  }
  
  /**
   * 視聴履歴に追加
   */
  async addToHistory(video: {
    id: string
    title: string
    thumbURL: string
    views?: number
    comments?: number
    mylists?: number
    likes?: number
    authorId?: string
    authorName?: string
    authorIcon?: string
    registeredAt?: string
  }): Promise<void> {
    const db = this.dbManager.getDB()
    if (!db) throw new Error('Database not initialized')
    
    // 古い履歴を削除
    await this.cleanupOldEntries()
    
    return new Promise((resolve, reject) => {
      const transaction = db.transaction([this.STORE_NAME], 'readwrite')
      const store = transaction.objectStore(this.STORE_NAME)
      
      // 既存のエントリを確認
      const getRequest = store.get(video.id)
      
      getRequest.onsuccess = (event) => {
        const existingEntry = (event.target as IDBRequest).result
        
        const entry: WatchHistoryEntry = {
          videoId: video.id,
          title: video.title,
          thumbURL: video.thumbURL,
          watchedAt: Date.now(),
          watchCount: existingEntry ? existingEntry.watchCount + 1 : 1,
          views: video.views,
          comments: video.comments,
          mylists: video.mylists,
          likes: video.likes,
          authorId: video.authorId,
          authorName: video.authorName,
          authorIcon: video.authorIcon,
          registeredAt: video.registeredAt
        }
        
        const putRequest = store.put(entry)
        putRequest.onsuccess = () => {
          // 最大件数チェック
          this.enforceMaxEntries().then(resolve).catch(reject)
        }
        putRequest.onerror = () => reject(putRequest.error)
      }
      
      getRequest.onerror = () => reject(getRequest.error)
    })
  }
  
  /**
   * 視聴履歴を取得
   */
  async getHistory(limit?: number, offset?: number): Promise<WatchHistoryEntry[]> {
    const db = this.dbManager.getDB()
    if (!db) throw new Error('Database not initialized')
    
    return new Promise((resolve, reject) => {
      const transaction = db.transaction([this.STORE_NAME], 'readonly')
      const store = transaction.objectStore(this.STORE_NAME)
      const request = store.getAll()
      
      request.onsuccess = (event) => {
        const entries = (event.target as IDBRequest).result as WatchHistoryEntry[]
        
        // 新しい順にソート
        entries.sort((a, b) => b.watchedAt - a.watchedAt)
        
        // ページネーション
        const start = offset || 0
        const end = limit ? start + limit : undefined
        
        resolve(entries.slice(start, end))
      }
      
      request.onerror = () => reject(request.error)
    })
  }
  
  /**
   * 視聴履歴を検索
   */
  async searchHistory(query: string): Promise<WatchHistoryEntry[]> {
    const db = this.dbManager.getDB()
    if (!db) throw new Error('Database not initialized')
    
    const normalizedQuery = query.toLowerCase()
    
    return new Promise((resolve, reject) => {
      const transaction = db.transaction([this.STORE_NAME], 'readonly')
      const store = transaction.objectStore(this.STORE_NAME)
      const request = store.getAll()
      
      request.onsuccess = (event) => {
        const entries = (event.target as IDBRequest).result as WatchHistoryEntry[]
        
        const filtered = entries.filter(entry => {
          const titleMatch = entry.title.toLowerCase().includes(normalizedQuery)
          const authorMatch = entry.authorName?.toLowerCase().includes(normalizedQuery) || false
          return titleMatch || authorMatch
        })
        
        // 新しい順にソート
        filtered.sort((a, b) => b.watchedAt - a.watchedAt)
        
        resolve(filtered)
      }
      
      request.onerror = () => reject(request.error)
    })
  }
  
  /**
   * 視聴履歴から削除
   */
  async removeFromHistory(videoIds: string | string[]): Promise<void> {
    const db = this.dbManager.getDB()
    if (!db) throw new Error('Database not initialized')
    
    const ids = Array.isArray(videoIds) ? videoIds : [videoIds]
    
    return new Promise((resolve, reject) => {
      const transaction = db.transaction([this.STORE_NAME], 'readwrite')
      const store = transaction.objectStore(this.STORE_NAME)
      
      let completed = 0
      const total = ids.length
      
      ids.forEach(id => {
        const request = store.delete(id)
        
        request.onsuccess = () => {
          completed++
          if (completed === total) resolve()
        }
        
        request.onerror = () => reject(request.error)
      })
      
      if (total === 0) resolve()
    })
  }
  
  /**
   * すべての視聴履歴をクリア
   */
  async clearHistory(): Promise<void> {
    const db = this.dbManager.getDB()
    if (!db) throw new Error('Database not initialized')
    
    return new Promise((resolve, reject) => {
      const transaction = db.transaction([this.STORE_NAME], 'readwrite')
      const store = transaction.objectStore(this.STORE_NAME)
      const request = store.clear()
      
      request.onsuccess = () => resolve()
      request.onerror = () => reject(request.error)
    })
  }
  
  /**
   * 視聴履歴の統計情報を取得
   */
  async getHistoryStats(): Promise<{
    totalCount: number
    oldestWatchedAt: number | null
    newestWatchedAt: number | null
  }> {
    const db = this.dbManager.getDB()
    if (!db) throw new Error('Database not initialized')
    
    return new Promise((resolve, reject) => {
      const transaction = db.transaction([this.STORE_NAME], 'readonly')
      const store = transaction.objectStore(this.STORE_NAME)
      const request = store.getAll()
      
      request.onsuccess = (event) => {
        const entries = (event.target as IDBRequest).result as WatchHistoryEntry[]
        
        if (entries.length === 0) {
          resolve({
            totalCount: 0,
            oldestWatchedAt: null,
            newestWatchedAt: null
          })
          return
        }
        
        const watchedAts = entries.map(e => e.watchedAt)
        
        resolve({
          totalCount: entries.length,
          oldestWatchedAt: Math.min(...watchedAts),
          newestWatchedAt: Math.max(...watchedAts)
        })
      }
      
      request.onerror = () => reject(request.error)
    })
  }
  
  /**
   * 古いエントリを削除
   */
  private async cleanupOldEntries(): Promise<void> {
    const db = this.dbManager.getDB()
    if (!db) return
    
    const cutoffTime = Date.now() - (this.MAX_AGE_DAYS * 24 * 60 * 60 * 1000)
    
    return new Promise((resolve, reject) => {
      const transaction = db.transaction([this.STORE_NAME], 'readwrite')
      const store = transaction.objectStore(this.STORE_NAME)
      const cursorRequest = store.openCursor()
      
      cursorRequest.onsuccess = (event) => {
        const cursor = (event.target as IDBRequest).result
        
        if (cursor) {
          const entry = cursor.value as WatchHistoryEntry
          
          if (entry.watchedAt < cutoffTime) {
            cursor.delete()
          }
          
          cursor.continue()
        } else {
          resolve()
        }
      }
      
      cursorRequest.onerror = () => reject(cursorRequest.error)
    })
  }
  
  /**
   * 最大件数を超えた場合に古いものを削除
   */
  private async enforceMaxEntries(): Promise<void> {
    const db = this.dbManager.getDB()
    if (!db) return
    
    const entries = await this.getHistory()
    
    if (entries.length <= this.MAX_ENTRIES) return
    
    // 削除する件数
    const deleteCount = entries.length - this.MAX_ENTRIES
    
    // 古い順に削除対象を選択
    const toDelete = entries
      .sort((a, b) => a.watchedAt - b.watchedAt)
      .slice(0, deleteCount)
      .map(e => e.videoId)
    
    await this.removeFromHistory(toDelete)
  }
}