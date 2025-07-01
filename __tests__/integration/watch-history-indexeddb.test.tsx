import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { DBManager } from '@/lib/storage/db-manager'
import { WatchHistoryManager } from '@/lib/storage/watch-history'

describe('視聴履歴IndexedDBインテグレーションテスト', () => {
  let dbManager: DBManager
  let watchHistoryManager: WatchHistoryManager

  beforeEach(async () => {
    // 各テストの前にDBを初期化
    dbManager = new DBManager()
    await dbManager.init()
    watchHistoryManager = new WatchHistoryManager(dbManager)
  })

  afterEach(async () => {
    // テスト後にDBをクリーンアップ
    const db = dbManager.getDB()
    if (db) {
      db.close()
    }
    // DBを完全に削除
    await new Promise((resolve, reject) => {
      const deleteReq = indexedDB.deleteDatabase('NicoRankingDB')
      deleteReq.onsuccess = () => resolve(undefined)
      deleteReq.onerror = () => reject(deleteReq.error)
      deleteReq.onblocked = () => {
        console.warn('Database deletion blocked')
        resolve(undefined)
      }
    })
  })

  describe('視聴履歴の追加と取得', () => {
    it('動画を視聴履歴に追加して取得できること', async () => {
      // Arrange
      const video = {
        id: 'sm12345',
        title: 'テスト動画',
        thumbURL: 'https://example.com/thumb.jpg',
        views: 1000,
        comments: 50,
        mylists: 10,
        likes: 100,
        authorName: 'テスト投稿者',
        authorId: 'user123',
        registeredAt: '2024-01-01T00:00:00Z'
      }

      // Act
      await watchHistoryManager.addToHistory(video)
      const history = await watchHistoryManager.getHistory()

      // Assert
      expect(history).toHaveLength(1)
      expect(history[0].videoId).toBe('sm12345')
      expect(history[0].title).toBe('テスト動画')
      expect(history[0].watchCount).toBe(1)
    })

    it('同じ動画を複数回追加した場合、watchCountが増えること', async () => {
      // Arrange
      const video = {
        id: 'sm12345',
        title: 'テスト動画',
        thumbURL: 'https://example.com/thumb.jpg',
        views: 1000
      }

      // Act
      await watchHistoryManager.addToHistory(video)
      await watchHistoryManager.addToHistory(video)
      await watchHistoryManager.addToHistory(video)
      
      const history = await watchHistoryManager.getHistory()

      // Assert
      expect(history).toHaveLength(1)
      expect(history[0].watchCount).toBe(3)
    })

    it('複数の動画を追加して、新しい順に取得できること', async () => {
      // Arrange
      const video1 = {
        id: 'sm11111',
        title: '最初の動画',
        thumbURL: 'https://example.com/thumb1.jpg'
      }
      
      const video2 = {
        id: 'sm22222',
        title: '2番目の動画',
        thumbURL: 'https://example.com/thumb2.jpg'
      }

      // Act
      await watchHistoryManager.addToHistory(video1)
      await new Promise(resolve => setTimeout(resolve, 10)) // 時間差を作る
      await watchHistoryManager.addToHistory(video2)
      
      const history = await watchHistoryManager.getHistory()

      // Assert
      expect(history).toHaveLength(2)
      expect(history[0].videoId).toBe('sm22222') // 新しい方が最初
      expect(history[1].videoId).toBe('sm11111')
    })
  })

  describe('視聴履歴の検索', () => {
    it('タイトルで検索できること', async () => {
      // Arrange
      await watchHistoryManager.addToHistory({
        id: 'sm11111',
        title: '検索対象の動画',
        thumbURL: 'https://example.com/thumb1.jpg'
      })
      
      await watchHistoryManager.addToHistory({
        id: 'sm22222',
        title: '別の動画',
        thumbURL: 'https://example.com/thumb2.jpg'
      })

      // Act
      const results = await watchHistoryManager.searchHistory('検索対象')

      // Assert
      expect(results).toHaveLength(1)
      expect(results[0].videoId).toBe('sm11111')
    })
  })
})