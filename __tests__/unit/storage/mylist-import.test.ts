import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { IDBFactory } from 'fake-indexeddb'
import { unwrap } from 'idb'
import type { IDBPDatabase } from 'idb'
import { DBManager } from '@/lib/storage/db-manager'
import { MylistManager } from '@/lib/storage/mylists'
import { detectMylistConflicts, importMylistData, type BackupData } from '@/lib/storage/backup'

// マイリストの復元（importMylistData）を実 IndexedDB 実装（fake-indexeddb）で確かめる。
// データはすべて合成値。

function nativeStorePrototype(db: IDBPDatabase): IDBObjectStore {
  const tx = db.transaction('mylists', 'readonly')
  return Object.getPrototypeOf(unwrap(tx.objectStore('mylists'))) as IDBObjectStore
}

function makeBackup(overrides: Partial<BackupData>): BackupData {
  return {
    version: '1.0.0',
    exportDate: '2026-01-01T00:00:00.000Z',
    mylists: [],
    mylistVideos: [],
    metadata: { totalMylists: 0, totalVideos: 0, appVersion: '1.0.0' },
    ...overrides,
  }
}

describe('importMylistData', () => {
  let db: IDBPDatabase
  let manager: MylistManager

  beforeEach(async () => {
    // テストごとに空の IndexedDB を使う
    globalThis.indexedDB = new IDBFactory()
    const dbManager = new DBManager()
    await dbManager.init()
    db = dbManager.getDB()
    manager = new MylistManager(dbManager)
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  describe('完全上書き', () => {
    it('取り込みが途中で中断されたら（容量超過・タブを閉じた等）、既存のマイリストを消さない', async () => {
      const existingId = await manager.createMylist('既存の合成リスト')
      await manager.addVideoToMylist(existingId, { id: 'sm90000001', title: '既存の合成動画', thumbURL: '' })

      const proto = nativeStorePrototype(db)
      const originalPut = proto.put
      vi.spyOn(proto, 'put').mockImplementation(function (this: IDBObjectStore, value: unknown, key?: IDBValidKey) {
        if (typeof value === 'object' && value !== null && (value as { id?: unknown }).id === 'sm99999999') {
          // 取り込みの途中でトランザクションが中断された状態を再現する
          this.transaction.abort()
        }
        return originalPut.call(this, value, key)
      })

      const backup = makeBackup({
        mylists: [
          { id: 'mylist-import-1', name: '取り込む合成リスト', createdAt: 1700000000000, updatedAt: 1700000000000, videoCount: 2 },
        ],
        mylistVideos: [
          { id: 'sm90000101', mylistId: 'mylist-import-1', title: '取り込む合成動画', thumbURL: '', addedAt: 1700000000000 },
          { id: 'sm99999999', mylistId: 'mylist-import-1', title: '中断を起こす合成動画', thumbURL: '', addedAt: 1700000000001 },
        ],
      })

      const result = await importMylistData(backup, 'complete_overwrite')
      vi.restoreAllMocks()

      expect(result.success).toBe(false)
      const mylists = await manager.getAllMylists()
      expect(mylists.map((m) => m.id)).toEqual([existingId])
      const videos = await manager.getVideosInMylist(existingId)
      expect(videos.map((v) => v.id)).toEqual(['sm90000001'])
    })

    it('1 件でも書けないデータがあれば、既存のマイリストを消さずに中止する', async () => {
      const existingId = await manager.createMylist('既存の合成リスト')
      await manager.addVideoToMylist(existingId, { id: 'sm90000001', title: '既存の合成動画', thumbURL: '' })

      // id の無いマイリスト（手で編集されたファイル等）
      const backup = makeBackup({
        mylists: [{ name: '既存の合成リスト', createdAt: 1700000000000, updatedAt: 1700000000000, videoCount: 0 } as unknown as BackupData['mylists'][number]],
      })

      const result = await importMylistData(backup, 'complete_overwrite')

      expect(result.success).toBe(false)
      const mylists = await manager.getAllMylists()
      expect(mylists.map((m) => m.id)).toEqual([existingId])
      expect((await manager.getVideosInMylist(existingId)).map((v) => v.id)).toEqual(['sm90000001'])
    })
  })

  describe('ファイルの中身の検証（統合形式は readBackupFile の検証を通らない）', () => {
    // 統合バックアップの data.mylists から組み立てたデータに、所属マイリスト ID の無い動画が混ざっている
    const backupWithBrokenVideo = () =>
      makeBackup({
        mylists: [
          { id: 'mylist-import-1', name: '取り込む合成リスト', createdAt: 1700000000000, updatedAt: 1700000000000, videoCount: 2 },
        ],
        mylistVideos: [
          { id: 'sm90000101', mylistId: 'mylist-import-1', title: '合成動画', thumbURL: '', addedAt: 1700000000000 },
          { id: 'sm90000102', title: '所属の無い合成動画', thumbURL: '', addedAt: 1700000000001 } as unknown as BackupData['mylistVideos'][number],
        ],
      })

    it('ID の欠けたデータは取り込まず、一部だけ入った状態にもしない', async () => {
      const result = await importMylistData(backupWithBrokenVideo(), 'safe_add')

      expect(result.success).toBe(false)
      expect(result.errors.join('\n')).toContain('無効なファイル形式')
      expect(await manager.getAllMylists()).toEqual([])
    })

    it('追加日時が文字列の動画も、取り込み後に詳細の一覧へ出る', async () => {
      const backup = makeBackup({
        mylists: [
          { id: 'mylist-import-1', name: '取り込む合成リスト', createdAt: 1700000000000, updatedAt: 1700000000000, videoCount: 1 },
        ],
        mylistVideos: [
          { id: 'sm90000101', mylistId: 'mylist-import-1', title: '合成動画', thumbURL: '', addedAt: '2026-01-02T03:04:05.000Z' } as unknown as BackupData['mylistVideos'][number],
        ],
      })

      const result = await importMylistData(backup, 'safe_add')

      expect(result.success).toBe(true)
      const videos = await manager.getVideosInMylist('mylist-import-1')
      expect(videos.map((v) => v.id)).toEqual(['sm90000101'])
      expect(videos[0].addedAt).toBe(Date.parse('2026-01-02T03:04:05.000Z'))
    })

    it('重複の検出でも ID の欠けたデータを受け付けない', async () => {
      await manager.createMylist('取り込む合成リスト')
      const backup = makeBackup({
        mylists: [{ name: '取り込む合成リスト', createdAt: 1700000000000, updatedAt: 1700000000000, videoCount: 0 } as unknown as BackupData['mylists'][number]],
      })

      await expect(detectMylistConflicts(backup)).rejects.toThrow('無効なファイル形式')
    })
  })
})
