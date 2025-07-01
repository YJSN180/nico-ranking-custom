import { describe, it, expect, beforeEach, vi } from 'vitest'
import { DBManager } from '@/lib/storage/db-manager'
import { MylistManager } from '@/lib/storage/mylists'
import 'fake-indexeddb/auto'

describe('MylistManager - Race Condition Tests', () => {
  let dbManager: DBManager
  let mylistManager: MylistManager

  beforeEach(async () => {
    // Reset IndexedDB
    if (typeof window !== 'undefined' && 'indexedDB' in window) {
      const databases = await indexedDB.databases?.() || []
      for (const db of databases) {
        if (db.name) {
          indexedDB.deleteDatabase(db.name)
        }
      }
    }

    dbManager = new DBManager()
    await dbManager.init()
    mylistManager = new MylistManager(dbManager)
  })

  it('複数の同時呼び出しでもデフォルトマイリストは1つだけ作成される', async () => {
    // 10個の同時呼び出しを作成
    const promises = Array(10).fill(null).map(() => 
      mylistManager.getOrCreateDefaultMylist()
    )

    // すべての呼び出しを同時に実行
    const results = await Promise.all(promises)

    // すべての結果が同じIDを持つことを確認
    const firstId = results[0].id
    results.forEach(result => {
      expect(result.id).toBe(firstId)
      expect(result.name).toBe('とりあえずマイリスト')
    })

    // データベースに実際に1つだけ存在することを確認
    const allMylists = await mylistManager.getAllMylists()
    const defaultMylists = allMylists.filter(m => m.name === 'とりあえずマイリスト')
    
    expect(defaultMylists).toHaveLength(1)
    expect(defaultMylists[0].id).toBe(firstId)
  })

  it('異なるMylistManagerインスタンスからの同時呼び出しでも機能する', async () => {
    // 複数のMylistManagerインスタンスを作成
    const managers = Array(5).fill(null).map(() => 
      new MylistManager(dbManager)
    )

    // 各インスタンスから同時に呼び出し
    const promises = managers.map(manager => 
      manager.getOrCreateDefaultMylist()
    )

    // すべての呼び出しを同時に実行
    const results = await Promise.all(promises)

    // すべての結果が同じIDを持つことを確認
    const firstId = results[0].id
    results.forEach(result => {
      expect(result.id).toBe(firstId)
    })

    // データベースに実際に1つだけ存在することを確認
    const allMylists = await mylistManager.getAllMylists()
    const defaultMylists = allMylists.filter(m => m.name === 'とりあえずマイリスト')
    
    expect(defaultMylists).toHaveLength(1)
  })

  it('エラーが発生してもPromiseが適切にクリアされる', async () => {
    // getDBメソッドをモックしてエラーを発生させる
    const originalGetDB = dbManager.getDB.bind(dbManager)
    let callCount = 0
    
    vi.spyOn(dbManager, 'getDB').mockImplementation(() => {
      callCount++
      if (callCount === 1) {
        throw new Error('Database error')
      }
      return originalGetDB()
    })

    // 最初の呼び出しはエラーになるはず
    await expect(mylistManager.getOrCreateDefaultMylist()).rejects.toThrow('Database error')

    // 2回目の呼び出しは成功するはず（Promiseがクリアされているため）
    const result = await mylistManager.getOrCreateDefaultMylist()
    expect(result.name).toBe('とりあえずマイリスト')
  })
})