import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { MylistManager } from '@/lib/storage/mylists'
import { DBManager } from '@/lib/storage/db-manager'
import type { MylistVideo } from '@/lib/storage/types'
import 'fake-indexeddb/auto'

describe('MylistManager', () => {
  let dbManager: DBManager
  let mylistManager: MylistManager

  beforeEach(async () => {
    dbManager = new DBManager()
    await dbManager.init()
    mylistManager = new MylistManager(dbManager)
  })

  afterEach(async () => {
    // クリーンアップ
    if (dbManager.isInitialized()) {
      const db = dbManager.getDB()
      const tx = db.transaction(['mylists', 'mylistVideos'], 'readwrite')
      await tx.objectStore('mylists').clear()
      await tx.objectStore('mylistVideos').clear()
      await tx.done
    }
  })

  describe('マイリスト作成', () => {
    it('新規マイリストを作成できる', async () => {
      // Act
      const mylistId = await mylistManager.createMylist('音楽コレクション', 'お気に入りの音楽')

      // Assert
      expect(mylistId).toBeTruthy()
      const mylist = await mylistManager.getMylist(mylistId)
      expect(mylist?.name).toBe('音楽コレクション')
      expect(mylist?.description).toBe('お気に入りの音楽')
      expect(mylist?.videoCount).toBe(0)
    })

    it('初期マイリストを取得または作成できる', async () => {
      // Act
      const initialMylist = await mylistManager.getOrCreateDefaultMylist()

      // Assert
      expect(initialMylist.name).toBe('とりあえずマイリスト')

      // 再度呼び出しても同じものが返る
      const sameMylist = await mylistManager.getOrCreateDefaultMylist()
      expect(sameMylist.id).toBe(initialMylist.id)
    })
  })

  describe('マイリスト管理', () => {
    it('すべてのマイリストを取得できる', async () => {
      // Arrange
      await mylistManager.getOrCreateDefaultMylist()
      const id1 = await mylistManager.createMylist('音楽')
      // 作成時刻を確実に異なるようにする
      await new Promise(resolve => setTimeout(resolve, 50))
      const id2 = await mylistManager.createMylist('ゲーム')

      // Act
      const mylists = await mylistManager.getAllMylists()

      // Assert
      expect(mylists).toHaveLength(3)
      // マイリスト名の配列を作成して確認
      const mylistNames = mylists.map(m => m.name)
      expect(mylistNames).toContain('ゲーム')
      expect(mylistNames).toContain('音楽')
      expect(mylistNames).toContain('とりあえずマイリスト')
      
      // 最新のマイリストが先頭にあることを確認（作成日時でソート）
      const sortedMylists = [...mylists].sort((a, b) => b.createdAt - a.createdAt)
      expect(mylists[0].id).toBe(sortedMylists[0].id)
    })

    it('マイリストを更新できる', async () => {
      // Arrange
      const mylistId = await mylistManager.createMylist('音楽')
      await new Promise(resolve => setTimeout(resolve, 10)) // 時間差を作る

      // Act
      await mylistManager.updateMylist(mylistId, {
        name: '音楽コレクション',
        description: '更新されました'
      })

      // Assert
      const updated = await mylistManager.getMylist(mylistId)
      expect(updated?.name).toBe('音楽コレクション')
      expect(updated?.description).toBe('更新されました')
      expect(updated?.updatedAt).toBeGreaterThan(updated?.createdAt!)
    })

    it('マイリストを削除できる', async () => {
      // Arrange
      const mylistId = await mylistManager.createMylist('削除予定')

      // Act
      await mylistManager.deleteMylist(mylistId)

      // Assert
      const deleted = await mylistManager.getMylist(mylistId)
      expect(deleted).toBeUndefined()
    })

    it('すべてのマイリストを削除できる', async () => {
      // Arrange
      const initialMylist = await mylistManager.getOrCreateDefaultMylist()

      // Act
      await mylistManager.deleteMylist(initialMylist.id)

      // Assert
      const deleted = await mylistManager.getMylist(initialMylist.id)
      expect(deleted).toBeUndefined()
    })
  })

  describe('動画管理', () => {
    let mylistId: string

    beforeEach(async () => {
      mylistId = await mylistManager.createMylist('テスト用マイリスト')
    })

    it('動画をマイリストに追加できる', async () => {
      // Arrange
      const video: Partial<MylistVideo> = {
        id: 'sm12345',
        title: 'テスト動画',
        thumbURL: 'https://example.com/thumb.jpg',
        views: 1000,
        authorName: 'テスト投稿者'
      }

      // Act
      await mylistManager.addVideoToMylist(mylistId, video)

      // Assert
      const videos = await mylistManager.getVideosInMylist(mylistId)
      expect(videos).toHaveLength(1)
      expect(videos[0].id).toBe('sm12345')
      expect(videos[0].mylistId).toBe(mylistId)

      const mylist = await mylistManager.getMylist(mylistId)
      expect(mylist?.videoCount).toBe(1)
    })

    it('同じ動画を重複して追加しても上書きされる', async () => {
      // Arrange
      const video: Partial<MylistVideo> = {
        id: 'sm12345',
        title: 'テスト動画',
        thumbURL: 'https://example.com/thumb.jpg'
      }

      // Act
      await mylistManager.addVideoToMylist(mylistId, video)
      await mylistManager.addVideoToMylist(mylistId, { ...video, title: '更新されたタイトル' })

      // Assert
      const videos = await mylistManager.getVideosInMylist(mylistId)
      expect(videos).toHaveLength(1)
      expect(videos[0].title).toBe('更新されたタイトル')
    })

    it('動画をマイリストから削除できる', async () => {
      // Arrange
      const video: Partial<MylistVideo> = {
        id: 'sm12345',
        title: 'テスト動画',
        thumbURL: 'https://example.com/thumb.jpg'
      }
      await mylistManager.addVideoToMylist(mylistId, video)

      // Act
      await mylistManager.removeVideoFromMylist(mylistId, 'sm12345')

      // Assert
      const videos = await mylistManager.getVideosInMylist(mylistId)
      expect(videos).toHaveLength(0)

      const mylist = await mylistManager.getMylist(mylistId)
      expect(mylist?.videoCount).toBe(0)
    })

    it('動画がマイリストに存在するか確認できる', async () => {
      // Arrange
      const video: Partial<MylistVideo> = {
        id: 'sm12345',
        title: 'テスト動画',
        thumbURL: 'https://example.com/thumb.jpg'
      }
      await mylistManager.addVideoToMylist(mylistId, video)

      // Act & Assert
      expect(await mylistManager.isVideoInMylist(mylistId, 'sm12345')).toBe(true)
      expect(await mylistManager.isVideoInMylist(mylistId, 'sm99999')).toBe(false)
    })

    it('動画が登録されているマイリストを取得できる', async () => {
      // Arrange
      const mylistId2 = await mylistManager.createMylist('マイリスト2')
      const video: Partial<MylistVideo> = {
        id: 'sm12345',
        title: 'テスト動画',
        thumbURL: 'https://example.com/thumb.jpg'
      }
      await mylistManager.addVideoToMylist(mylistId, video)
      await mylistManager.addVideoToMylist(mylistId2, video)

      // Act
      const mylistIds = await mylistManager.getMylistsContainingVideo('sm12345')

      // Assert
      expect(mylistIds).toHaveLength(2)
      expect(mylistIds).toContain(mylistId)
      expect(mylistIds).toContain(mylistId2)
    })

    it('マイリスト内の動画を新しい順で取得できる', async () => {
      // Arrange
      for (let i = 1; i <= 3; i++) {
        await mylistManager.addVideoToMylist(mylistId, {
          id: `sm${i}`,
          title: `動画${i}`,
          thumbURL: `https://example.com/${i}.jpg`
        })
        await new Promise(resolve => setTimeout(resolve, 10))
      }

      // Act
      const videos = await mylistManager.getVideosInMylist(mylistId)

      // Assert
      expect(videos).toHaveLength(3)
      expect(videos[0].id).toBe('sm3') // 新しい順
      expect(videos[1].id).toBe('sm2')
      expect(videos[2].id).toBe('sm1')
    })

    it('動画のメモを更新できる', async () => {
      // Arrange
      const video: Partial<MylistVideo> = {
        id: 'sm12345',
        title: 'テスト動画',
        thumbURL: 'https://example.com/thumb.jpg'
      }
      await mylistManager.addVideoToMylist(mylistId, video)

      // Act
      await mylistManager.updateVideoMemo(mylistId, 'sm12345', 'お気に入りのシーンは3:45')

      // Assert
      const videos = await mylistManager.getVideosInMylist(mylistId)
      expect(videos[0].memo).toBe('お気に入りのシーンは3:45')
    })

    it('マイリスト内動画を検索できる', async () => {
      // Arrange
      await mylistManager.addVideoToMylist(mylistId, {
        id: 'sm1',
        title: '初音ミクの歌',
        thumbURL: 'https://example.com/1.jpg',
        memo: '神曲'
      })
      await mylistManager.addVideoToMylist(mylistId, {
        id: 'sm2',
        title: 'ゲーム実況',
        thumbURL: 'https://example.com/2.jpg',
        authorName: 'ミク好き実況者'
      })
      await mylistManager.addVideoToMylist(mylistId, {
        id: 'sm3',
        title: '料理動画',
        thumbURL: 'https://example.com/3.jpg'
      })

      // Act
      const results = await mylistManager.searchVideosInMylist(mylistId, 'ミク')

      // Assert
      expect(results).toHaveLength(2)
      expect(results.map(v => v.id)).toContain('sm1')
      expect(results.map(v => v.id)).toContain('sm2')
    })
  })

  describe('マイリスト削除時の連携', () => {
    it('マイリストを削除すると関連動画も削除される', async () => {
      // Arrange
      const mylistId = await mylistManager.createMylist('削除予定')
      await mylistManager.addVideoToMylist(mylistId, {
        id: 'sm12345',
        title: 'テスト動画',
        thumbURL: 'https://example.com/thumb.jpg'
      })

      // Act
      await mylistManager.deleteMylist(mylistId)

      // Assert
      const videos = await mylistManager.getVideosInMylist(mylistId)
      expect(videos).toHaveLength(0)
    })
  })
})