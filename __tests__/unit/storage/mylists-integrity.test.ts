import { describe, it, expect, beforeEach } from 'vitest'
import { IDBFactory } from 'fake-indexeddb'
import { DBManager } from '@/lib/storage/db-manager'
import { MylistManager } from '@/lib/storage/mylists'

// 保存層の整合性（件数・利用者が書いたメモ）を実 IndexedDB 実装（fake-indexeddb）で確かめる。
// データはすべて合成値。
describe('MylistManager の保存整合性', () => {
  let manager: MylistManager

  beforeEach(async () => {
    // テストごとに空の IndexedDB を使う
    globalThis.indexedDB = new IDBFactory()
    const dbManager = new DBManager()
    await dbManager.init()
    manager = new MylistManager(dbManager)
  })

  it('同じ動画を 2 回削除しても（別タブ・二重操作）件数は実数とずれない', async () => {
    const mylistId = await manager.createMylist('合成リスト')
    await manager.addVideoToMylist(mylistId, { id: 'sm90000001', title: '合成動画1', thumbURL: '' })
    await manager.addVideoToMylist(mylistId, { id: 'sm90000002', title: '合成動画2', thumbURL: '' })

    await manager.removeVideoFromMylist(mylistId, 'sm90000001')
    // 別タブの古い画面から同じ動画をもう一度削除した状態
    await manager.removeVideoFromMylist(mylistId, 'sm90000001')

    const videos = await manager.getVideosInMylist(mylistId)
    const mylist = await manager.getMylist(mylistId)
    expect(videos.map((v) => v.id)).toEqual(['sm90000002'])
    expect(mylist?.videoCount).toBe(1)
  })

  it('登録済みの動画をもう一度追加しても、メモ・追加日時・並び順は消えない', async () => {
    const mylistId = await manager.createMylist('合成リスト')
    await manager.addVideoToMylist(mylistId, {
      id: 'sm90000001',
      title: '合成動画',
      thumbURL: 'https://example.invalid/thumb-a.jpg',
    })
    await manager.updateVideoMemo(mylistId, 'sm90000001', '合成メモ')
    await manager.updateVideoOrder(mylistId, [{ id: 'sm90000001', orderIndex: 3 }])
    const [before] = await manager.getVideosInMylist(mylistId)

    // 古い画面（別タブ）のマイリストモーダルから同じマイリストへ追加した状態。メモは渡らない
    await manager.addVideoToMylist(mylistId, {
      id: 'sm90000001',
      title: '合成動画（更新後）',
      thumbURL: 'https://example.invalid/thumb-b.jpg',
      views: 10,
    })

    const [after] = await manager.getVideosInMylist(mylistId)
    expect(after.memo).toBe('合成メモ')
    expect(after.addedAt).toBe(before.addedAt)
    expect(after.orderIndex).toBe(3)
    // 動画の情報そのものは新しい値に更新する
    expect(after.title).toBe('合成動画（更新後）')
    expect(after.views).toBe(10)
    expect((await manager.getMylist(mylistId))?.videoCount).toBe(1)
  })
})
