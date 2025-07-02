import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { DBManager } from '@/lib/storage/db-manager'
import { MylistManager } from '@/lib/storage/mylists'
import 'fake-indexeddb/auto'
import type { Video } from '@/lib/storage/types'

describe('同一動画の複数マイリスト登録', () => {
  let dbManager: DBManager
  let mylistManager: MylistManager

  const testVideo: Partial<Video> = {
    id: 'sm12345678',
    title: 'テスト動画',
    thumbURL: 'https://example.com/thumb.jpg',
    viewCount: 1000,
    commentCount: 100,
    mylistCount: 10,
    duration: 300,
    authorName: 'テスト投稿者',
    authorId: '123456',
    registeredAt: new Date(),
    tags: ['test']
  }

  beforeEach(async () => {
    // Clear IndexedDB
    if ('databases' in indexedDB) {
      const dbs = await indexedDB.databases()
      for (const db of dbs) {
        if (db.name) {
          indexedDB.deleteDatabase(db.name)
        }
      }
    }

    // Initialize managers
    dbManager = new DBManager()
    await dbManager.init()
    mylistManager = new MylistManager(dbManager)
  })

  afterEach(async () => {
    await dbManager.deleteDatabase()
  })

  it('同じ動画を異なるマイリストに登録できる', async () => {
    // デフォルトマイリストを取得
    const defaultMylist = await mylistManager.getOrCreateDefaultMylist()
    
    // 追加のマイリストを作成
    const mylist1 = await mylistManager.createMylist('お気に入り', '好きな動画')
    const mylist2 = await mylistManager.createMylist('後で見る', '後で見る動画')
    
    // 同じ動画を3つの異なるマイリストに追加
    await mylistManager.addVideoToMylist(defaultMylist.id, testVideo)
    await mylistManager.addVideoToMylist(mylist1, testVideo)
    await mylistManager.addVideoToMylist(mylist2, testVideo)
    
    // 各マイリストに動画が存在することを確認
    const inDefault = await mylistManager.isVideoInMylist(defaultMylist.id, testVideo.id!)
    const inMylist1 = await mylistManager.isVideoInMylist(mylist1, testVideo.id!)
    const inMylist2 = await mylistManager.isVideoInMylist(mylist2, testVideo.id!)
    
    expect(inDefault).toBe(true)
    expect(inMylist1).toBe(true)
    expect(inMylist2).toBe(true)
    
    // 動画が登録されているマイリストのリストを取得
    const containingMylists = await mylistManager.getMylistsContainingVideo(testVideo.id!)
    expect(containingMylists).toHaveLength(3)
    expect(containingMylists).toContain(defaultMylist.id)
    expect(containingMylists).toContain(mylist1)
    expect(containingMylists).toContain(mylist2)
  })

  it('同じマイリストに同じ動画を重複登録しても1つだけ保存される', async () => {
    const mylist = await mylistManager.createMylist('テストマイリスト', '')
    
    // 同じ動画を2回追加
    await mylistManager.addVideoToMylist(mylist, testVideo)
    await mylistManager.addVideoToMylist(mylist, testVideo)
    
    // マイリスト内の動画を取得
    const videos = await mylistManager.getVideosInMylist(mylist)
    
    // 1つだけ登録されていることを確認
    expect(videos).toHaveLength(1)
    expect(videos[0].id).toBe(testVideo.id)
    
    // マイリストの動画数も1であることを確認
    const updatedMylist = await mylistManager.getMylist(mylist)
    expect(updatedMylist?.videoCount).toBe(1)
  })

  it('一つのマイリストから削除しても他のマイリストには残る', async () => {
    // 3つのマイリストを作成
    const mylist1 = await mylistManager.createMylist('マイリスト1', '')
    const mylist2 = await mylistManager.createMylist('マイリスト2', '')
    const mylist3 = await mylistManager.createMylist('マイリスト3', '')
    
    // 同じ動画を全てに追加
    await mylistManager.addVideoToMylist(mylist1, testVideo)
    await mylistManager.addVideoToMylist(mylist2, testVideo)
    await mylistManager.addVideoToMylist(mylist3, testVideo)
    
    // mylist2から削除
    await mylistManager.removeVideoFromMylist(mylist2, testVideo.id!)
    
    // 確認
    const inMylist1 = await mylistManager.isVideoInMylist(mylist1, testVideo.id!)
    const inMylist2 = await mylistManager.isVideoInMylist(mylist2, testVideo.id!)
    const inMylist3 = await mylistManager.isVideoInMylist(mylist3, testVideo.id!)
    
    expect(inMylist1).toBe(true)
    expect(inMylist2).toBe(false)
    expect(inMylist3).toBe(true)
    
    // 動画が登録されているマイリストは2つ
    const containingMylists = await mylistManager.getMylistsContainingVideo(testVideo.id!)
    expect(containingMylists).toHaveLength(2)
    expect(containingMylists).toContain(mylist1)
    expect(containingMylists).toContain(mylist3)
    expect(containingMylists).not.toContain(mylist2)
  })
})