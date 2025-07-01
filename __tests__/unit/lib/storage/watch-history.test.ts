import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { WatchHistoryManager } from '@/lib/storage/watch-history'
import type { WatchHistoryEntry } from '@/lib/storage/types'

// DBManagerのモックは使わず、テスト内で直接モックを作成

// IndexedDBのモック実装
const createMockDB = () => {
  const stores = new Map<string, Map<string, any>>()
  
  return {
    transaction: (storeNames: string[], mode: string) => {
      const txStores = new Map<string, any>()
      
      storeNames.forEach(storeName => {
        if (!stores.has(storeName)) {
          stores.set(storeName, new Map())
        }
        
        const store = stores.get(storeName)!
        const mockStore = {
          add: vi.fn(async (value: any) => {
            store.set(value.videoId, value)
            return value.videoId
          }),
          put: vi.fn(async (value: any) => {
            store.set(value.videoId, value)
            return value.videoId
          }),
          get: vi.fn(async (key: string) => {
            return store.get(key)
          }),
          getAll: vi.fn(async () => {
            return Array.from(store.values())
          }),
          delete: vi.fn(async (key: string) => {
            store.delete(key)
            return undefined
          }),
          clear: vi.fn(async () => {
            store.clear()
            return undefined
          }),
          openCursor: vi.fn(() => {
            const entries = Array.from(store.entries())
            let index = 0
            
            const request: any = {
              onsuccess: null,
              onerror: null
            }
            
            const advance = () => {
              if (index < entries.length) {
                const [key, value] = entries[index]
                const cursor = {
                  key,
                  value,
                  continue: () => {
                    index++
                    advance()
                  },
                  delete: vi.fn(() => {
                    store.delete(key)
                    return { onsuccess: null, onerror: null }
                  })
                }
                request.onsuccess?.({ target: { result: cursor } })
              } else {
                request.onsuccess?.({ target: { result: null } })
              }
            }
            
            setTimeout(advance, 0)
            return request
          })
        }
        
        txStores.set(storeName, mockStore)
      })
      
      return {
        objectStore: (name: string) => txStores.get(name),
        oncomplete: null,
        onerror: null,
        commit: vi.fn()
      }
    },
    close: vi.fn()
  }
}

describe('WatchHistoryManager', () => {
  let manager: WatchHistoryManager
  let mockDB: ReturnType<typeof createMockDB>
  let mockDBManager: any
  
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2024-01-15T12:00:00Z'))
    
    mockDB = createMockDB()
    mockDBManager = {
      init: vi.fn().mockResolvedValue(true),
      getDB: vi.fn().mockReturnValue(mockDB)
    }
    
    manager = new WatchHistoryManager(mockDBManager)
  })
  
  afterEach(() => {
    vi.useRealTimers()
    vi.clearAllMocks()
  })
  
  describe('addToHistory', () => {
    it('新しい動画を視聴履歴に追加できる', async () => {
      const video = {
        id: 'sm12345',
        title: 'テスト動画',
        thumbURL: 'https://example.com/thumb.jpg',
        authorName: 'テスト投稿者',
        authorId: 'user123',
        authorIcon: 'https://example.com/icon.jpg',
        registeredAt: '2024-01-01T00:00:00Z',
        views: 1000,
        comments: 50,
        mylists: 10,
        likes: 100
      }
      
      await manager.addToHistory(video)
      
      const history = await manager.getHistory()
      expect(history).toHaveLength(1)
      expect(history[0]).toMatchObject({
        videoId: 'sm12345',
        title: 'テスト動画',
        thumbURL: 'https://example.com/thumb.jpg',
        authorName: 'テスト投稿者',
        authorId: 'user123',
        watchedAt: Date.now()
      })
    })
    
    it('同じ動画を再度視聴した場合、視聴日時が更新される', async () => {
      const video = {
        id: 'sm12345',
        title: 'テスト動画',
        thumbURL: 'https://example.com/thumb.jpg'
      }
      
      // 最初の視聴
      await manager.addToHistory(video)
      
      // 1時間後に再視聴
      vi.advanceTimersByTime(60 * 60 * 1000)
      await manager.addToHistory(video)
      
      const history = await manager.getHistory()
      expect(history).toHaveLength(1)
      expect(history[0].watchedAt).toBe(Date.now())
    })
    
    it('最大200件を超えた場合、古いものから削除される', async () => {
      // 200件追加
      for (let i = 1; i <= 200; i++) {
        await manager.addToHistory({
          id: `sm${i}`,
          title: `動画${i}`,
          thumbURL: `https://example.com/thumb${i}.jpg`
        })
        vi.advanceTimersByTime(1000) // 1秒ずつ進める
      }
      
      // 201件目を追加
      await manager.addToHistory({
        id: 'sm201',
        title: '動画201',
        thumbURL: 'https://example.com/thumb201.jpg'
      })
      
      const history = await manager.getHistory()
      expect(history).toHaveLength(200)
      expect(history[0].videoId).toBe('sm201') // 最新
      expect(history[199].videoId).toBe('sm2') // 最古（sm1は削除された）
    })
    
    it('180日を超えた履歴は自動的に削除される', async () => {
      // 古い動画を追加
      await manager.addToHistory({
        id: 'sm_old',
        title: '古い動画',
        thumbURL: 'https://example.com/old.jpg'
      })
      
      // 181日後
      vi.advanceTimersByTime(181 * 24 * 60 * 60 * 1000)
      
      // 新しい動画を追加（これにより古い履歴の削除がトリガーされる）
      await manager.addToHistory({
        id: 'sm_new',
        title: '新しい動画',
        thumbURL: 'https://example.com/new.jpg'
      })
      
      const history = await manager.getHistory()
      expect(history).toHaveLength(1)
      expect(history[0].videoId).toBe('sm_new')
    })
  })
  
  describe('getHistory', () => {
    it('視聴履歴を新しい順に取得できる', async () => {
      await manager.addToHistory({ id: 'sm1', title: '動画1', thumbURL: 'url1' })
      vi.advanceTimersByTime(1000)
      await manager.addToHistory({ id: 'sm2', title: '動画2', thumbURL: 'url2' })
      vi.advanceTimersByTime(1000)
      await manager.addToHistory({ id: 'sm3', title: '動画3', thumbURL: 'url3' })
      
      const history = await manager.getHistory()
      expect(history).toHaveLength(3)
      expect(history[0].videoId).toBe('sm3')
      expect(history[1].videoId).toBe('sm2')
      expect(history[2].videoId).toBe('sm1')
    })
    
    it('limit指定で取得件数を制限できる', async () => {
      for (let i = 1; i <= 10; i++) {
        await manager.addToHistory({
          id: `sm${i}`,
          title: `動画${i}`,
          thumbURL: `url${i}`
        })
      }
      
      const history = await manager.getHistory(5)
      expect(history).toHaveLength(5)
    })
    
    it('offset指定でページネーションができる', async () => {
      for (let i = 1; i <= 10; i++) {
        await manager.addToHistory({
          id: `sm${i}`,
          title: `動画${i}`,
          thumbURL: `url${i}`
        })
      }
      
      const page1 = await manager.getHistory(5, 0)
      const page2 = await manager.getHistory(5, 5)
      
      expect(page1).toHaveLength(5)
      expect(page2).toHaveLength(5)
      expect(page1[0].videoId).not.toBe(page2[0].videoId)
    })
  })
  
  describe('searchHistory', () => {
    beforeEach(async () => {
      await manager.addToHistory({
        id: 'sm1',
        title: 'ボカロ曲 歌ってみた',
        thumbURL: 'url1',
        authorName: '歌い手A'
      })
      await manager.addToHistory({
        id: 'sm2',
        title: 'ゲーム実況 マイクラ',
        thumbURL: 'url2',
        authorName: '実況者B'
      })
      await manager.addToHistory({
        id: 'sm3',
        title: 'ボカロ オリジナル曲',
        thumbURL: 'url3',
        authorName: 'ボカロP'
      })
    })
    
    it('タイトルで検索できる', async () => {
      const results = await manager.searchHistory('ボカロ')
      expect(results).toHaveLength(2)
      expect(results.map(r => r.videoId)).toContain('sm1')
      expect(results.map(r => r.videoId)).toContain('sm3')
    })
    
    it('投稿者名で検索できる', async () => {
      const results = await manager.searchHistory('実況者')
      expect(results).toHaveLength(1)
      expect(results[0].videoId).toBe('sm2')
    })
    
    it('大文字小文字を区別しない', async () => {
      // Add a video with English title for proper case testing
      await manager.addToHistory({ 
        id: 'sm4', 
        title: 'VOCALOID Cover Song', 
        thumbURL: 'url4',
        authorName: 'Producer'
      })
      
      const resultsUpper = await manager.searchHistory('VOCALOID')
      const resultsLower = await manager.searchHistory('vocaloid')
      const resultsMixed = await manager.searchHistory('VocaLoid')
      
      expect(resultsUpper).toHaveLength(1)
      expect(resultsLower).toHaveLength(1) 
      expect(resultsMixed).toHaveLength(1)
      expect(resultsUpper[0].videoId).toBe('sm4')
      expect(resultsLower[0].videoId).toBe('sm4')
      expect(resultsMixed[0].videoId).toBe('sm4')
    })
  })
  
  describe('removeFromHistory', () => {
    it('特定の動画を履歴から削除できる', async () => {
      await manager.addToHistory({ id: 'sm1', title: '動画1', thumbURL: 'url1' })
      await manager.addToHistory({ id: 'sm2', title: '動画2', thumbURL: 'url2' })
      
      await manager.removeFromHistory('sm1')
      
      const history = await manager.getHistory()
      expect(history).toHaveLength(1)
      expect(history[0].videoId).toBe('sm2')
    })
    
    it('複数の動画を一括削除できる', async () => {
      await manager.addToHistory({ id: 'sm1', title: '動画1', thumbURL: 'url1' })
      await manager.addToHistory({ id: 'sm2', title: '動画2', thumbURL: 'url2' })
      await manager.addToHistory({ id: 'sm3', title: '動画3', thumbURL: 'url3' })
      
      await manager.removeFromHistory(['sm1', 'sm3'])
      
      const history = await manager.getHistory()
      expect(history).toHaveLength(1)
      expect(history[0].videoId).toBe('sm2')
    })
  })
  
  describe('clearHistory', () => {
    it('すべての履歴を削除できる', async () => {
      await manager.addToHistory({ id: 'sm1', title: '動画1', thumbURL: 'url1' })
      await manager.addToHistory({ id: 'sm2', title: '動画2', thumbURL: 'url2' })
      
      await manager.clearHistory()
      
      const history = await manager.getHistory()
      expect(history).toHaveLength(0)
    })
  })
  
  describe('getHistoryStats', () => {
    it('視聴履歴の統計情報を取得できる', async () => {
      await manager.addToHistory({ id: 'sm1', title: '動画1', thumbURL: 'url1' })
      await manager.addToHistory({ id: 'sm2', title: '動画2', thumbURL: 'url2' })
      await manager.addToHistory({ id: 'sm3', title: '動画3', thumbURL: 'url3' })
      
      const stats = await manager.getHistoryStats()
      expect(stats).toEqual({
        totalCount: 3,
        oldestWatchedAt: expect.any(Number),
        newestWatchedAt: expect.any(Number)
      })
    })
  })
})