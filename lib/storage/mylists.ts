import { DBManager } from './db-manager'
import type { Mylist, MylistVideo } from './types'

export class MylistManager {
  constructor(private dbManager: DBManager) {}

  /**
   * 新規マイリストを作成
   */
  async createMylist(name: string, description?: string): Promise<string> {
    const db = this.dbManager.getDB()
    const now = Date.now()
    const id = crypto.randomUUID()
    
    const mylist: Mylist = {
      id,
      name,
      description,
      createdAt: now,
      updatedAt: now,
      videoCount: 0,
      isDefault: false
    }
    
    const tx = db.transaction('mylists', 'readwrite')
    await tx.store.add(mylist)
    await tx.done
    
    return id
  }

  /**
   * デフォルトマイリスト（とりあえずマイリスト）を取得または作成
   */
  async getOrCreateDefaultMylist(): Promise<Mylist> {
    const db = this.dbManager.getDB()
    const tx = db.transaction('mylists', 'readonly')
    const mylists = await tx.store.getAll()
    const defaultMylist = mylists.find(m => m.isDefault === true)
    
    if (defaultMylist) {
      return defaultMylist
    }
    
    // デフォルトマイリストが存在しない場合は作成
    const now = Date.now()
    const id = crypto.randomUUID()
    const newDefaultMylist: Mylist = {
      id,
      name: 'とりあえずマイリスト',
      description: 'デフォルトのマイリスト',
      createdAt: now,
      updatedAt: now,
      videoCount: 0,
      isDefault: true
    }
    
    const writeTx = db.transaction('mylists', 'readwrite')
    await writeTx.store.add(newDefaultMylist)
    await writeTx.done
    
    return newDefaultMylist
  }

  /**
   * すべてのマイリストを取得
   */
  async getAllMylists(): Promise<Mylist[]> {
    const db = this.dbManager.getDB()
    const tx = db.transaction('mylists', 'readonly')
    const mylists = await tx.store.getAll()
    
    // 作成日時の新しい順にソート
    return mylists.sort((a, b) => {
      // デフォルトマイリストは常に最初
      if (a.isDefault) return -1
      if (b.isDefault) return 1
      return b.createdAt - a.createdAt
    })
  }

  /**
   * マイリストを取得
   */
  async getMylist(mylistId: string): Promise<Mylist | undefined> {
    const db = this.dbManager.getDB()
    const tx = db.transaction('mylists', 'readonly')
    return await tx.store.get(mylistId)
  }

  /**
   * マイリストを更新
   */
  async updateMylist(mylistId: string, updates: Partial<Omit<Mylist, 'id' | 'createdAt'>>): Promise<void> {
    const db = this.dbManager.getDB()
    const tx = db.transaction('mylists', 'readwrite')
    const mylist = await tx.store.get(mylistId)
    
    if (!mylist) {
      throw new Error('Mylist not found')
    }
    
    const updatedMylist: Mylist = {
      ...mylist,
      ...updates,
      updatedAt: Date.now()
    }
    
    await tx.store.put(updatedMylist)
    await tx.done
  }

  /**
   * マイリストを削除
   */
  async deleteMylist(mylistId: string): Promise<void> {
    const db = this.dbManager.getDB()
    
    // デフォルトマイリストは削除不可
    const mylist = await this.getMylist(mylistId)
    if (mylist?.isDefault) {
      throw new Error('Cannot delete default mylist')
    }
    
    // トランザクション開始
    const tx = db.transaction(['mylists', 'mylistVideos'], 'readwrite')
    
    // マイリスト内の動画をすべて削除
    const videoIndex = tx.objectStore('mylistVideos').index('mylistId')
    const videoCursor = await videoIndex.openCursor(mylistId)
    
    if (videoCursor) {
      await videoCursor.delete()
      while (await videoCursor.continue()) {
        await videoCursor.delete()
      }
    }
    
    // マイリストを削除
    await tx.objectStore('mylists').delete(mylistId)
    await tx.done
  }

  /**
   * 動画をマイリストに追加
   */
  async addVideoToMylist(mylistId: string, video: Partial<MylistVideo>): Promise<void> {
    const db = this.dbManager.getDB()
    const tx = db.transaction(['mylists', 'mylistVideos'], 'readwrite')
    
    // マイリストの存在確認
    const mylist = await tx.objectStore('mylists').get(mylistId)
    if (!mylist) {
      throw new Error('Mylist not found')
    }
    
    // 動画データを作成
    const mylistVideo: MylistVideo = {
      id: video.id!,
      mylistId,
      title: video.title!,
      thumbURL: video.thumbURL!,
      addedAt: Date.now(),
      memo: video.memo,
      views: video.views,
      comments: video.comments,
      mylists: video.mylists,
      likes: video.likes,
      authorName: video.authorName,
      authorId: video.authorId,
      authorIcon: video.authorIcon,
      registeredAt: video.registeredAt
    }
    
    // 動画を追加
    await tx.objectStore('mylistVideos').put(mylistVideo)
    
    // マイリストの動画数と更新日時を更新
    mylist.videoCount++
    mylist.updatedAt = Date.now()
    await tx.objectStore('mylists').put(mylist)
    
    await tx.done
  }

  /**
   * 動画をマイリストから削除
   */
  async removeVideoFromMylist(mylistId: string, videoId: string): Promise<void> {
    const db = this.dbManager.getDB()
    const tx = db.transaction(['mylists', 'mylistVideos'], 'readwrite')
    
    // マイリストの存在確認
    const mylist = await tx.objectStore('mylists').get(mylistId)
    if (!mylist) {
      throw new Error('Mylist not found')
    }
    
    // 動画を削除
    await tx.objectStore('mylistVideos').delete([mylistId, videoId])
    
    // マイリストの動画数と更新日時を更新
    mylist.videoCount = Math.max(0, mylist.videoCount - 1)
    mylist.updatedAt = Date.now()
    await tx.objectStore('mylists').put(mylist)
    
    await tx.done
  }

  /**
   * 動画がマイリストに存在するか確認
   */
  async isVideoInMylist(mylistId: string, videoId: string): Promise<boolean> {
    const db = this.dbManager.getDB()
    const tx = db.transaction('mylistVideos', 'readonly')
    const video = await tx.store.get([mylistId, videoId])
    return !!video
  }

  /**
   * 動画が登録されているマイリストを取得
   */
  async getMylistsContainingVideo(videoId: string): Promise<string[]> {
    const db = this.dbManager.getDB()
    const tx = db.transaction('mylistVideos', 'readonly')
    const index = tx.store.index('id')
    const cursor = await index.openCursor(videoId)
    
    const mylistIds: string[] = []
    if (cursor) {
      mylistIds.push(cursor.value.mylistId)
      while (await cursor.continue()) {
        mylistIds.push(cursor.value.mylistId)
      }
    }
    
    return mylistIds
  }

  /**
   * マイリスト内の動画を取得
   */
  async getVideosInMylist(mylistId: string, limit?: number): Promise<MylistVideo[]> {
    const db = this.dbManager.getDB()
    const tx = db.transaction('mylistVideos', 'readonly')
    const index = tx.store.index('mylistId-addedAt')
    
    const videos: MylistVideo[] = []
    let cursor = await index.openCursor(IDBKeyRange.bound([mylistId, 0], [mylistId, Infinity]), 'prev')
    
    while (cursor && (!limit || videos.length < limit)) {
      videos.push(cursor.value)
      cursor = await cursor.continue()
    }
    
    return videos
  }

  /**
   * 動画のメモを更新
   */
  async updateVideoMemo(mylistId: string, videoId: string, memo: string): Promise<void> {
    const db = this.dbManager.getDB()
    const tx = db.transaction('mylistVideos', 'readwrite')
    
    const video = await tx.store.get([mylistId, videoId])
    if (!video) {
      throw new Error('Video not found in mylist')
    }
    
    video.memo = memo
    await tx.store.put(video)
    await tx.done
  }

  /**
   * マイリスト内動画を検索
   */
  async searchVideosInMylist(mylistId: string, query: string): Promise<MylistVideo[]> {
    const videos = await this.getVideosInMylist(mylistId)
    const lowerQuery = query.toLowerCase()
    
    return videos.filter(video => 
      video.title.toLowerCase().includes(lowerQuery) ||
      (video.memo && video.memo.toLowerCase().includes(lowerQuery)) ||
      (video.authorName && video.authorName.toLowerCase().includes(lowerQuery))
    )
  }
}