import { describe, it, expect, beforeEach, vi } from 'vitest'
import { MylistManager } from '@/lib/storage/mylists'
import { DBManager } from '@/lib/storage/db-manager'
import type { MylistVideo } from '@/lib/storage/types'

// Mock DBManager
vi.mock('@/lib/storage/db-manager')

// Mock IDBKeyRange
global.IDBKeyRange = {
  bound: vi.fn().mockImplementation((lower, upper) => ({ lower, upper })),
} as any

describe('MylistManager - 動画の並び替え', () => {
  let mylistManager: MylistManager
  let mockDbManager: DBManager
  let mockDB: any
  let mockTransaction: any
  let mockStore: any

  beforeEach(() => {
    // モックの設定
    mockStore = {
      get: vi.fn(),
      put: vi.fn(),
      getAll: vi.fn(),
      index: vi.fn(),
      openCursor: vi.fn(),
    }

    mockTransaction = {
      objectStore: vi.fn().mockReturnValue(mockStore),
      store: mockStore,
      done: Promise.resolve(),
    }

    mockDB = {
      transaction: vi.fn().mockReturnValue(mockTransaction),
    }

    mockDbManager = {
      getDB: vi.fn().mockReturnValue(mockDB),
      init: vi.fn(),
    } as any

    mylistManager = new MylistManager(mockDbManager)
  })

  describe('updateVideoOrder', () => {
    it('動画の順序を更新できる', async () => {
      const mylistId = 'test-mylist-id'
      const videoOrders = [
        { id: 'sm1', orderIndex: 0 },
        { id: 'sm2', orderIndex: 1 },
        { id: 'sm3', orderIndex: 2 },
      ]

      // 既存の動画データをモック
      const existingVideos = {
        sm1: { id: 'sm1', mylistId, title: '動画1', thumbURL: 'url1', addedAt: Date.now() },
        sm2: { id: 'sm2', mylistId, title: '動画2', thumbURL: 'url2', addedAt: Date.now() },
        sm3: { id: 'sm3', mylistId, title: '動画3', thumbURL: 'url3', addedAt: Date.now() },
      }

      mockStore.get.mockImplementation(([mid, vid]) => {
        if (mid === mylistId && existingVideos[vid]) {
          return Promise.resolve(existingVideos[vid])
        }
        return Promise.resolve(null)
      })

      await mylistManager.updateVideoOrder(mylistId, videoOrders)

      // 各動画のorderIndexが更新されることを確認
      expect(mockStore.put).toHaveBeenCalledTimes(3)
      expect(mockStore.put).toHaveBeenCalledWith(
        expect.objectContaining({ id: 'sm1', orderIndex: 0 })
      )
      expect(mockStore.put).toHaveBeenCalledWith(
        expect.objectContaining({ id: 'sm2', orderIndex: 1 })
      )
      expect(mockStore.put).toHaveBeenCalledWith(
        expect.objectContaining({ id: 'sm3', orderIndex: 2 })
      )
    })

    it('存在しない動画はスキップされる', async () => {
      const mylistId = 'test-mylist-id'
      const videoOrders = [
        { id: 'sm1', orderIndex: 0 },
        { id: 'sm_not_exist', orderIndex: 1 },
        { id: 'sm2', orderIndex: 2 },
      ]

      const existingVideos = {
        sm1: { id: 'sm1', mylistId, title: '動画1', thumbURL: 'url1', addedAt: Date.now() },
        sm2: { id: 'sm2', mylistId, title: '動画2', thumbURL: 'url2', addedAt: Date.now() },
      }

      mockStore.get.mockImplementation(([mid, vid]) => {
        if (mid === mylistId && existingVideos[vid]) {
          return Promise.resolve(existingVideos[vid])
        }
        return Promise.resolve(null)
      })

      await mylistManager.updateVideoOrder(mylistId, videoOrders)

      // 存在する動画のみ更新される
      expect(mockStore.put).toHaveBeenCalledTimes(2)
      expect(mockStore.put).toHaveBeenCalledWith(
        expect.objectContaining({ id: 'sm1', orderIndex: 0 })
      )
      expect(mockStore.put).toHaveBeenCalledWith(
        expect.objectContaining({ id: 'sm2', orderIndex: 2 })
      )
    })
  })

  describe('getVideosInMylist with order', () => {
    it('orderIndexが設定されている場合、その順序で動画を返す', async () => {
      const mylistId = 'test-mylist-id'
      const videos: MylistVideo[] = [
        { id: 'sm1', mylistId, title: '動画1', thumbURL: 'url1', addedAt: 1000, orderIndex: 2 },
        { id: 'sm2', mylistId, title: '動画2', thumbURL: 'url2', addedAt: 2000, orderIndex: 0 },
        { id: 'sm3', mylistId, title: '動画3', thumbURL: 'url3', addedAt: 3000, orderIndex: 1 },
      ]

      // getVideosInMylistメソッドをスパイして、直接videos配列を返すようにする
      vi.spyOn(mylistManager, 'getVideosInMylist').mockResolvedValue(videos)

      // getVideosInMylistWithOrderメソッドを呼び出す
      const result = await mylistManager.getVideosInMylistWithOrder(mylistId)

      // orderIndexでソートされていることを確認
      expect(result).toHaveLength(3)
      expect(result[0].id).toBe('sm2') // orderIndex: 0
      expect(result[1].id).toBe('sm3') // orderIndex: 1
      expect(result[2].id).toBe('sm1') // orderIndex: 2
    })

    it('orderIndexが未設定の動画は追加日時順で最後に配置される', async () => {
      const mylistId = 'test-mylist-id'
      const videos: MylistVideo[] = [
        { id: 'sm1', mylistId, title: '動画1', thumbURL: 'url1', addedAt: 1000, orderIndex: 0 },
        { id: 'sm2', mylistId, title: '動画2', thumbURL: 'url2', addedAt: 3000 }, // orderIndex未設定
        { id: 'sm3', mylistId, title: '動画3', thumbURL: 'url3', addedAt: 2000, orderIndex: 1 },
        { id: 'sm4', mylistId, title: '動画4', thumbURL: 'url4', addedAt: 4000 }, // orderIndex未設定
      ]

      // getVideosInMylistメソッドをスパイして、直接videos配列を返すようにする
      vi.spyOn(mylistManager, 'getVideosInMylist').mockResolvedValue(videos)

      const result = await mylistManager.getVideosInMylistWithOrder(mylistId)

      // orderIndexありの動画が先、なしの動画は追加日時の新しい順
      expect(result).toHaveLength(4)
      expect(result[0].id).toBe('sm1') // orderIndex: 0
      expect(result[1].id).toBe('sm3') // orderIndex: 1
      expect(result[2].id).toBe('sm4') // orderIndex未設定, addedAt: 4000
      expect(result[3].id).toBe('sm2') // orderIndex未設定, addedAt: 3000
    })
  })
})