import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { DBManager } from '@/lib/storage/db-manager'
import { MylistManager } from '@/lib/storage/mylists'
import { exportMylistData, importMylistData, validateBackupData } from '@/lib/storage/backup'
import type { Mylist, MylistVideo } from '@/lib/storage/types'

describe('Backup Fix - エクスポート・インポート機能の修正', () => {
  let dbManager: DBManager
  let mylistManager: MylistManager

  beforeEach(async () => {
    dbManager = new DBManager()
    await dbManager.init()
    mylistManager = new MylistManager(dbManager)
  })

  afterEach(async () => {
    // データをクリーンアップ
    try {
      const db = dbManager.getDB()
      if (db) {
        // 全データを削除
        const tx = db.transaction(['mylists', 'mylistVideos'], 'readwrite')
        await tx.objectStore('mylists').clear()
        await tx.objectStore('mylistVideos').clear()
        await tx.done
        
        // DBを閉じる
        db.close()
      }
    } catch (error) {
      // エラーは無視（テスト分離のためのクリーンアップ）
    }
  })

  it('MylistVideoのデータ構造を確認', async () => {
    // マイリストを作成
    const mylistId = await mylistManager.createMylist('テストマイリスト')
    
    // 動画を追加（必須フィールドを含む完全なデータ）
    const video: Partial<MylistVideo> = {
      id: 'sm12345',
      title: 'テスト動画',
      thumbURL: 'https://example.com/thumb.jpg'
    }
    
    await mylistManager.addVideoToMylist(mylistId, video)
    
    // データをエクスポート
    const exportedData = await exportMylistData()
    
    // エクスポートされたデータの構造を確認
    expect(exportedData.mylistVideos).toHaveLength(1)
    const exportedVideo = exportedData.mylistVideos[0]
    
    // 実際のフィールド名を確認
    expect(exportedVideo).toHaveProperty('id', 'sm12345')
    expect(exportedVideo).toHaveProperty('mylistId', mylistId)
    expect(exportedVideo).not.toHaveProperty('videoId') // videoIdフィールドは存在しない
  })

  it('validateBackupDataがMylistVideoのidフィールドを正しく検証する（修正後）', async () => {
    // 正しい形式のバックアップデータ
    const validBackup = {
      version: '1.0.0',
      exportDate: new Date().toISOString(),
      mylists: [{
        id: 'test-id',
        name: 'テストマイリスト',
        createdAt: Date.now(),
        updatedAt: Date.now(),
        videoCount: 0
      }],
      mylistVideos: [{
        id: 'sm12345', // 修正後：idフィールドが正しく検証される
        mylistId: 'test-id',
        title: 'テスト動画',
        thumbURL: 'https://example.com/thumb.jpg',
        addedAt: Date.now()
      }],
      metadata: {
        totalMylists: 1,
        totalVideos: 1,
        appVersion: '1.0.0'
      }
    }
    
    // 修正後：正しいデータはvalidationが成功する
    const isValid = validateBackupData(validBackup)
    expect(isValid).toBe(true)
  })

  it('validateBackupDataが不正なMylistVideoデータを検出する', async () => {
    // videoIdフィールドを使った古い形式（不正）
    const invalidBackup = {
      version: '1.0.0',
      exportDate: new Date().toISOString(),
      mylists: [{
        id: 'test-id',
        name: 'テストマイリスト',
        createdAt: Date.now(),
        updatedAt: Date.now(),
        videoCount: 0
      }],
      mylistVideos: [{
        videoId: 'sm12345', // 不正：videoIdフィールド
        mylistId: 'test-id',
        title: 'テスト動画',
        thumbURL: 'https://example.com/thumb.jpg',
        addedAt: Date.now()
      }],
      metadata: {
        totalMylists: 1,
        totalVideos: 1,
        appVersion: '1.0.0'
      }
    }
    
    // 不正なデータはvalidationが失敗する
    const isValid = validateBackupData(invalidBackup)
    expect(isValid).toBe(false)
  })

  it('エクスポート・インポートの完全なフロー', async () => {
    // テストデータを作成
    const mylistId = await mylistManager.createMylist('マイリスト1')
    
    const video1: Partial<MylistVideo> = {
      id: 'sm11111',
      title: '動画1',
      thumbURL: 'https://example.com/thumb1.jpg',
      views: 1000,
      comments: 50,
      mylists: 10,
      likes: 100
    }
    
    const video2: Partial<MylistVideo> = {
      id: 'sm22222',
      title: '動画2',
      thumbURL: 'https://example.com/thumb2.jpg',
      views: 2000,
      comments: 100,
      mylists: 20,
      likes: 200
    }
    
    await mylistManager.addVideoToMylist(mylistId, video1)
    await mylistManager.addVideoToMylist(mylistId, video2)
    
    // エクスポート
    const exportedData = await exportMylistData()
    
    // データを確認
    expect(exportedData.mylists).toHaveLength(1)
    expect(exportedData.mylistVideos).toHaveLength(2)
    
    // データをクリアしてインポートを試みる
    // DBを閉じて新しいインスタンスを作成
    const db = dbManager.getDB()
    if (db) {
      db.close()
    }
    
    // 新しいDBManagerインスタンスを作成
    dbManager = new DBManager()
    await dbManager.init()
    mylistManager = new MylistManager(dbManager)
    
    // 念のため、既存のデータをクリア
    const newDb = dbManager.getDB()
    if (newDb) {
      const tx = newDb.transaction(['mylists', 'mylistVideos'], 'readwrite')
      await tx.objectStore('mylists').clear()
      await tx.objectStore('mylistVideos').clear()
      await tx.done
    }
    
    // インポート（修正後：正常に動作するはず）
    const result = await importMylistData(exportedData)
    expect(result.success).toBe(true)
    expect(result.error).toBeUndefined()
    
    // インポート後のデータを確認
    const importedMylists = await mylistManager.getAllMylists()
    expect(importedMylists).toHaveLength(1)
    expect(importedMylists[0].name).toBe('マイリスト1')
    
    const importedVideos = await mylistManager.getVideosInMylist(mylistId)
    expect(importedVideos).toHaveLength(2)
    
    // 動画データの完整性を確認
    const video1Data = importedVideos.find(v => v.id === 'sm11111')
    const video2Data = importedVideos.find(v => v.id === 'sm22222')
    
    expect(video1Data).toBeTruthy()
    expect(video1Data?.title).toBe('動画1')
    // 統計情報は意図的にエクスポートから除外されている
    expect(video1Data?.views).toBeUndefined()
    
    expect(video2Data).toBeTruthy()
    expect(video2Data?.title).toBe('動画2')
    // 統計情報は意図的にエクスポートから除外されている
    expect(video2Data?.views).toBeUndefined()
  })
})