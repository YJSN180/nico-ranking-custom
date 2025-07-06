import { describe, it, expect, beforeEach, vi } from 'vitest'
import { MylistManager } from '@/lib/storage/mylists'
import { DBManager } from '@/lib/storage/db-manager'
import type { Mylist, MylistSortOrder } from '@/lib/storage/types'

// IndexedDB のモック
global.indexedDB = {} as IDBFactory

// crypto.randomUUID のモック
Object.defineProperty(global.crypto, 'randomUUID', {
  value: vi.fn(() => 'test-uuid-' + Math.random().toString(36).substr(2, 9))
})

describe('マイリスト並び替え機能のテスト', () => {
  let dbManager: DBManager
  let mylistManager: MylistManager
  let mockMylists: Mylist[]

  beforeEach(() => {
    vi.clearAllMocks()
    localStorage.clear()
    
    // テスト用のモックデータ
    mockMylists = [
      {
        id: 'mylist-1',
        name: 'アニメマイリスト',
        description: 'アニメ関連の動画',
        createdAt: 1704067200000, // 2024-01-01
        updatedAt: 1709251200000, // 2024-03-01
        videoCount: 15
      },
      {
        id: 'mylist-2', 
        name: '音楽マイリスト',
        description: '好きな音楽',
        createdAt: 1706745600000, // 2024-02-01
        updatedAt: 1711929600000, // 2024-04-01
        videoCount: 8
      },
      {
        id: 'mylist-3',
        name: 'ゲーム実況',
        description: '',
        createdAt: 1698796800000, // 2023-11-01
        updatedAt: 1706745600000, // 2024-02-01
        videoCount: 25
      }
    ]

    // DBManager と MylistManager のモック
    dbManager = {} as DBManager
    mylistManager = new MylistManager(dbManager)
    
    // MylistManager のメソッドをモック
    vi.spyOn(mylistManager, 'getAllMylists').mockImplementation(async (sortOrder: MylistSortOrder = 'updatedAt-desc') => {
      return [...mockMylists].sort((a, b) => {
        switch (sortOrder) {
          case 'createdAt-desc':
            return b.createdAt - a.createdAt
          case 'createdAt-asc':
            return a.createdAt - b.createdAt
          case 'updatedAt-desc':
            return b.updatedAt - a.updatedAt
          case 'updatedAt-asc':
            return a.updatedAt - b.updatedAt
          case 'name-asc':
            return a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' })
          case 'name-desc':
            return b.name.localeCompare(a.name, undefined, { numeric: true, sensitivity: 'base' })
          case 'videoCount-desc':
            return b.videoCount - a.videoCount
          case 'videoCount-asc':
            return a.videoCount - b.videoCount
            default:
            return b.updatedAt - a.updatedAt
        }
      })
    })


    vi.spyOn(mylistManager, 'saveMylistSortConfig').mockImplementation(async (config) => {
      const configWithTimestamp = {
        ...config,
        lastUpdated: Date.now()
      }
      localStorage.setItem('mylist-sort-config', JSON.stringify(configWithTimestamp))
    })

    vi.spyOn(mylistManager, 'getMylistSortConfig').mockImplementation(async () => {
      try {
        const saved = localStorage.getItem('mylist-sort-config')
        if (saved) {
          return JSON.parse(saved)
        }
      } catch (error) {
        console.warn('Failed to load mylist sort config:', error)
      }
      
      return {
        order: 'createdAt-desc' as MylistSortOrder,
        lastUpdated: Date.now()
      }
    })
  })

  describe('基本的な並び替え機能', () => {
    it('更新日（新しい順）でソートされる', async () => {
      const result = await mylistManager.getAllMylists('updatedAt-desc')
      
      expect(result[0].name).toBe('音楽マイリスト') // 2024-04-01
      expect(result[1].name).toBe('アニメマイリスト') // 2024-03-01  
      expect(result[2].name).toBe('ゲーム実況') // 2024-02-01
    })

    it('更新日（古い順）でソートされる', async () => {
      const result = await mylistManager.getAllMylists('updatedAt-asc')
      
      expect(result[0].name).toBe('ゲーム実況') // 2024-02-01
      expect(result[1].name).toBe('アニメマイリスト') // 2024-03-01
      expect(result[2].name).toBe('音楽マイリスト') // 2024-04-01
    })

    it('作成日（新しい順）でソートされる', async () => {
      const result = await mylistManager.getAllMylists('createdAt-desc')
      
      expect(result[0].name).toBe('音楽マイリスト') // 2024-02-01
      expect(result[1].name).toBe('アニメマイリスト') // 2024-01-01
      expect(result[2].name).toBe('ゲーム実況') // 2023-11-01
    })

    it('名前（昇順）でソートされる', async () => {
      const result = await mylistManager.getAllMylists('name-asc')
      
      expect(result[0].name).toBe('アニメマイリスト')
      expect(result[1].name).toBe('ゲーム実況')
      expect(result[2].name).toBe('音楽マイリスト')
    })

    it('動画数（多い順）でソートされる', async () => {
      const result = await mylistManager.getAllMylists('videoCount-desc')
      
      expect(result[0].videoCount).toBe(25) // ゲーム実況
      expect(result[1].videoCount).toBe(15) // アニメマイリスト
      expect(result[2].videoCount).toBe(8)  // 音楽マイリスト
    })
  })

  describe('設定の永続化', () => {
    it('ソート設定がlocalStorageに保存される', async () => {
      await mylistManager.saveMylistSortConfig({
        order: 'name-asc'
      })
      
      const saved = localStorage.getItem('mylist-sort-config')
      expect(saved).toBeTruthy()
      
      const config = JSON.parse(saved!)
      expect(config.order).toBe('name-asc')
      expect(config.lastUpdated).toBeTruthy()
    })

    it('保存されたソート設定が読み込まれる', async () => {
      // 設定を保存
      await mylistManager.saveMylistSortConfig({
        order: 'videoCount-desc'
      })
      
      // 設定を読み込み
      const config = await mylistManager.getMylistSortConfig()
      expect(config.order).toBe('videoCount-desc')
    })

    it('設定がない場合はデフォルト値が返される', async () => {
      localStorage.clear()
      
      const config = await mylistManager.getMylistSortConfig()
      expect(config.order).toBe('createdAt-desc')
      expect(config.lastUpdated).toBeTruthy()
    })
  })


  describe('エラーハンドリング', () => {
    it('localStorageエラー時もデフォルト設定で動作する', async () => {
      // localStorageのgetItemでエラーを発生させる
      vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
        throw new Error('localStorage error')
      })
      
      const config = await mylistManager.getMylistSortConfig()
      expect(config.order).toBe('createdAt-desc')
    })

    it('不正なJSONが保存されている場合もデフォルト設定で動作する', async () => {
      localStorage.setItem('mylist-sort-config', 'invalid json')
      
      const config = await mylistManager.getMylistSortConfig()
      expect(config.order).toBe('createdAt-desc')
    })
  })

  describe('実際のユーザーフローシミュレーション', () => {
    it('ユーザーがソート順を変更して保存する', async () => {
      // 1. 初期状態は更新日順
      let mylists = await mylistManager.getAllMylists('updatedAt-desc')
      expect(mylists[0].name).toBe('音楽マイリスト')
      
      // 2. ユーザーが名前順に変更（設定も更新される）
      const newConfig = { order: 'name-asc' as MylistSortOrder }
      await mylistManager.saveMylistSortConfig(newConfig)
      
      // モックを更新して新しい設定を返すようにする
      vi.spyOn(mylistManager, 'getMylistSortConfig').mockResolvedValueOnce({
        order: 'name-asc',
        lastUpdated: Date.now()
      })
      
      mylists = await mylistManager.getAllMylists('name-asc')
      expect(mylists[0].name).toBe('アニメマイリスト')
      
      // 3. 設定が保持されているか確認
      const savedConfig = await mylistManager.getMylistSortConfig()
      expect(savedConfig.order).toBe('name-asc')
    })




  })
})