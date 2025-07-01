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
    
    const transaction = db.transaction([this.STORE_NAME], 'readwrite')
    const store = transaction.objectStore(this.STORE_NAME)
    
    // 既存のエントリを確認
    const existingEntry = await store.get(video.id)
    
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
    
    await store.put(entry)
    
    // 最大件数チェック
    await this.enforceMaxEntries()
  }
  
  /**
   * 視聴履歴を取得
   */
  async getHistory(limit?: number, offset?: number): Promise<WatchHistoryEntry[]> {
    const db = this.dbManager.getDB()
    if (!db) throw new Error('Database not initialized')
    
    const transaction = db.transaction([this.STORE_NAME], 'readonly')
    const store = transaction.objectStore(this.STORE_NAME)
    const entries = await store.getAll()
    
    // 配列かチェック
    const entriesArray = Array.isArray(entries) ? entries : []
    
    // 新しい順にソート
    entriesArray.sort((a, b) => b.watchedAt - a.watchedAt)
    
    // ページネーション
    const start = offset || 0
    const end = limit ? start + limit : undefined
    
    const result = entriesArray.slice(start, end)
    return result
  }
  
  /**
   * 視聴履歴を検索
   */
  async searchHistory(query: string): Promise<WatchHistoryEntry[]> {
    const db = this.dbManager.getDB()
    if (!db) throw new Error('Database not initialized')
    
    const normalizedQuery = query.toLowerCase()
    
    const transaction = db.transaction([this.STORE_NAME], 'readonly')
    const store = transaction.objectStore(this.STORE_NAME)
    const entries = await store.getAll()
    
    // 配列かチェック
    const entriesArray = Array.isArray(entries) ? entries : []
    
    const filtered = entriesArray.filter(entry => {
      const titleMatch = entry.title.toLowerCase().includes(normalizedQuery)
      const authorMatch = entry.authorName?.toLowerCase().includes(normalizedQuery) || false
      return titleMatch || authorMatch
    })
    
    // 新しい順にソート
    filtered.sort((a, b) => b.watchedAt - a.watchedAt)
    
    return filtered
  }
  
  /**
   * 視聴履歴から削除
   */
  async removeFromHistory(videoIds: string | string[]): Promise<void> {
    const db = this.dbManager.getDB()
    if (!db) throw new Error('Database not initialized')
    
    const ids = Array.isArray(videoIds) ? videoIds : [videoIds]
    
    const transaction = db.transaction([this.STORE_NAME], 'readwrite')
    const store = transaction.objectStore(this.STORE_NAME)
    
    // すべての削除をPromiseで実行
    await Promise.all(ids.map(id => store.delete(id)))
  }
  
  /**
   * すべての視聴履歴をクリア
   */
  async clearHistory(): Promise<void> {
    const db = this.dbManager.getDB()
    if (!db) throw new Error('Database not initialized')
    
    const transaction = db.transaction([this.STORE_NAME], 'readwrite')
    const store = transaction.objectStore(this.STORE_NAME)
    await store.clear()
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
    
    const transaction = db.transaction([this.STORE_NAME], 'readonly')
    const store = transaction.objectStore(this.STORE_NAME)
    const entries = await store.getAll()
    
    // 配列かチェック
    const entriesArray = Array.isArray(entries) ? entries : []
    
    if (entriesArray.length === 0) {
      return {
        totalCount: 0,
        oldestWatchedAt: null,
        newestWatchedAt: null
      }
    }
    
    const watchedAts = entriesArray.map(e => e.watchedAt)
    
    return {
      totalCount: entriesArray.length,
      oldestWatchedAt: Math.min(...watchedAts),
      newestWatchedAt: Math.max(...watchedAts)
    }
  }
  
  /**
   * 古いエントリを削除
   */
  private async cleanupOldEntries(): Promise<void> {
    const db = this.dbManager.getDB()
    if (!db) return
    
    const cutoffTime = Date.now() - (this.MAX_AGE_DAYS * 24 * 60 * 60 * 1000)
    
    const transaction = db.transaction([this.STORE_NAME], 'readwrite')
    const store = transaction.objectStore(this.STORE_NAME)
    
    // すべてのエントリを取得
    const entries = await store.getAll()
    
    // 配列でない場合は空配列として処理
    const entriesArray = Array.isArray(entries) ? entries : []
    
    // 古いエントリのIDを抽出
    const toDelete = entriesArray
      .filter(entry => entry && entry.watchedAt < cutoffTime)
      .map(entry => entry.videoId)
    
    // 削除
    if (toDelete.length > 0) {
      await Promise.all(toDelete.map(id => store.delete(id)))
    }
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