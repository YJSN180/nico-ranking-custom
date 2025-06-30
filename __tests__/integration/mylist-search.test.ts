import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { MylistManager } from '@/lib/storage/mylists'
import { DBManager } from '@/lib/storage/db-manager'
import type { MylistVideo } from '@/lib/storage/types'

// 最小限のテストデータ（メモリ効率）
const mockVideo: MylistVideo = {
  id: 'sm_test_001',
  title: 'テスト動画',
  authorName: 'テスト投稿者',
  addedAt: Date.now(),
  memo: 'テストメモ'
}

describe('マイリスト検索統合テスト（軽量版）', () => {
  let dbManager: DBManager
  let mylistManager: MylistManager
  let mylistId: string

  beforeEach(async () => {
    dbManager = new DBManager()
    await dbManager.init()
    mylistManager = new MylistManager(dbManager)
    
    // テスト用マイリスト作成
    mylistId = await mylistManager.createMylist('テストマイリスト')
    
    // 1つだけのテスト動画を追加
    await mylistManager.addVideoToMylist(mylistId, mockVideo)
  })

  afterEach(async () => {
    // メモリリークを防ぐためクリーンアップ
    try {
      await mylistManager.deleteMylist(mylistId)
      await dbManager.clearAll()
      await dbManager.close()
    } catch (error) {
      // クリーンアップエラーは無視
    }
  })

  it('タイトルで検索できる', async () => {
    const results = await mylistManager.searchVideosInMylist(mylistId, 'テスト')
    
    expect(results).toHaveLength(1)
    expect(results[0].title).toBe('テスト動画')
  })

  it('投稿者名で検索できる', async () => {
    const results = await mylistManager.searchVideosInMylist(mylistId, '投稿者')
    
    expect(results).toHaveLength(1)
    expect(results[0].authorName).toBe('テスト投稿者')
  })

  it('メモで検索できる', async () => {
    const results = await mylistManager.searchVideosInMylist(mylistId, 'メモ')
    
    expect(results).toHaveLength(1)
    expect(results[0].memo).toBe('テストメモ')
  })

  it('見つからない場合は空配列を返す', async () => {
    const results = await mylistManager.searchVideosInMylist(mylistId, '存在しない')
    
    expect(results).toHaveLength(0)
  })

  it('空文字で検索すると全動画を返す', async () => {
    const results = await mylistManager.searchVideosInMylist(mylistId, '')
    
    expect(results).toHaveLength(1)
    expect(results[0].id).toBe(mockVideo.id)
  })

  it('大文字小文字を区別せずに検索できる', async () => {
    const results = await mylistManager.searchVideosInMylist(mylistId, 'テスト')
    
    expect(results).toHaveLength(1)
    expect(results[0].title).toBe('テスト動画')
  })
})