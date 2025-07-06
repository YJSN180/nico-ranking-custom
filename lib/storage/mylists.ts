import { DBManager } from './db-manager'
import type { Mylist, MylistVideo, MylistSortOrder, MylistSortConfig } from './types'

export class MylistManager {
  private static defaultMylistPromise: Promise<Mylist> | null = null
  
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
      videoCount: 0
    }
    
    const tx = db.transaction('mylists', 'readwrite')
    await tx.store.add(mylist)
    await tx.done
    
    return id
  }

  /**
   * 初期マイリスト（とりあえずマイリスト）を取得または作成
   */
  async getOrCreateDefaultMylist(): Promise<Mylist> {
    // 既に進行中のPromiseがある場合はそれを返す（重複作成を防ぐ）
    if (MylistManager.defaultMylistPromise) {
      return MylistManager.defaultMylistPromise
    }

    // 新しいPromiseを作成して保存
    MylistManager.defaultMylistPromise = this._getOrCreateDefaultMylistInternal()
    
    try {
      const result = await MylistManager.defaultMylistPromise
      return result
    } finally {
      // 完了後はPromiseをクリア（次回は再チェック可能にする）
      MylistManager.defaultMylistPromise = null
    }
  }

  /**
   * 初期マイリストの内部実装（同期制御されたメソッド）
   */
  private async _getOrCreateDefaultMylistInternal(): Promise<Mylist> {
    const db = this.dbManager.getDB()
    
    // 既存のマイリストを確認
    const tx = db.transaction('mylists', 'readonly')
    const allMylists = await tx.store.getAll()
    
    // マイリストが1つもない場合は初期マイリストを作成
    if (allMylists.length === 0) {
      const now = Date.now()
      const id = crypto.randomUUID()
      const newInitialMylist: Mylist = {
        id,
        name: 'とりあえずマイリスト',
        description: '',
        createdAt: now,
        updatedAt: now,
        videoCount: 0
      }
      
      const writeTx = db.transaction('mylists', 'readwrite')
      await writeTx.store.add(newInitialMylist)
      await writeTx.done
      
      return newInitialMylist
    }
    
    // 既存のマイリストがある場合は最初のものを返す（互換性のため）
    return allMylists.sort((a, b) => a.createdAt - b.createdAt)[0]
  }

  /**
   * すべてのマイリストを取得
   */
  async getAllMylists(sortOrder: MylistSortOrder = 'updatedAt-desc'): Promise<Mylist[]> {
    const db = this.dbManager.getDB()
    const tx = db.transaction('mylists', 'readonly')
    const mylists = await tx.store.getAll()
    
    return this.sortMylists(mylists, sortOrder)
  }

  /**
   * マイリストをソートする
   */
  private sortMylists(mylists: Mylist[], sortOrder: MylistSortOrder): Mylist[] {
    return [...mylists].sort((a, b) => {
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
        case 'custom':
          // カスタム順の場合、customOrderフィールドでソート（未設定の場合は作成日順）
          const aOrder = a.customOrder ?? a.createdAt
          const bOrder = b.customOrder ?? b.createdAt
          return aOrder - bOrder
        default:
          return b.updatedAt - a.updatedAt
      }
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
    
    // 既存の動画を確認
    const existingVideo = await tx.objectStore('mylistVideos').get([mylistId, video.id!])
    const isNewVideo = !existingVideo
    
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
      registeredAt: video.registeredAt,
      duration: video.duration
    }
    
    // 動画を追加（既存の場合は上書き）
    await tx.objectStore('mylistVideos').put(mylistVideo)
    
    // マイリストの更新日時を更新、新規の場合のみ動画数を増やす
    if (isNewVideo) {
      mylist.videoCount++
    }
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
    const { searchMylistVideos } = await import('@/lib/search/video-search')
    const videos = await this.getVideosInMylist(mylistId)
    
    return searchMylistVideos(videos, {
      searchQuery: query,
      searchFields: ['title', 'author', 'memo']
    })
  }

  /**
   * 動画の順序を更新
   */
  async updateVideoOrder(mylistId: string, videoOrders: { id: string; orderIndex: number }[]): Promise<void> {
    const db = this.dbManager.getDB()
    const tx = db.transaction('mylistVideos', 'readwrite')
    
    for (const { id: videoId, orderIndex } of videoOrders) {
      const video = await tx.store.get([mylistId, videoId])
      if (video) {
        video.orderIndex = orderIndex
        await tx.store.put(video)
      }
    }
    
    await tx.done
  }

  /**
   * マイリスト内の動画を順序付きで取得
   */
  async getVideosInMylistWithOrder(mylistId: string, limit?: number): Promise<MylistVideo[]> {
    const videos = await this.getVideosInMylist(mylistId, limit)
    
    // orderIndexでソート（未設定の動画は最後に配置）
    return videos.sort((a, b) => {
      // 両方にorderIndexがある場合
      if (a.orderIndex !== undefined && b.orderIndex !== undefined) {
        return a.orderIndex - b.orderIndex
      }
      // aのみorderIndexがある場合（aが先）
      if (a.orderIndex !== undefined) {
        return -1
      }
      // bのみorderIndexがある場合（bが先）
      if (b.orderIndex !== undefined) {
        return 1
      }
      // 両方orderIndexがない場合は追加日時の新しい順
      return b.addedAt - a.addedAt
    })
  }

  /**
   * マイリストのカスタム順序を更新
   */
  async updateMylistCustomOrder(mylistId: string, customOrder: number): Promise<void> {
    const db = this.dbManager.getDB()
    const tx = db.transaction('mylists', 'readwrite')
    
    const mylist = await tx.store.get(mylistId)
    if (!mylist) {
      throw new Error('Mylist not found')
    }
    
    mylist.customOrder = customOrder
    mylist.updatedAt = Date.now()
    
    await tx.store.put(mylist)
    await tx.done
  }

  /**
   * 複数のマイリストのカスタム順序を一括更新
   */
  async updateMultipleMylistOrders(updates: { mylistId: string; customOrder: number }[]): Promise<void> {
    const db = this.dbManager.getDB()
    const tx = db.transaction('mylists', 'readwrite')
    
    for (const update of updates) {
      const mylist = await tx.store.get(update.mylistId)
      if (mylist) {
        mylist.customOrder = update.customOrder
        mylist.updatedAt = Date.now()
        await tx.store.put(mylist)
      }
    }
    
    await tx.done
  }

  /**
   * マイリストソート設定を保存
   */
  async saveMylistSortConfig(config: MylistSortConfig): Promise<void> {
    const configWithTimestamp = {
      ...config,
      lastUpdated: Date.now()
    }
    localStorage.setItem('mylist-sort-config', JSON.stringify(configWithTimestamp))
  }

  /**
   * マイリストソート設定を読み込み
   */
  async getMylistSortConfig(): Promise<MylistSortConfig> {
    try {
      const saved = localStorage.getItem('mylist-sort-config')
      if (saved) {
        return JSON.parse(saved)
      }
    } catch (error) {
      console.warn('Failed to load mylist sort config:', error)
    }
    
    // デフォルト設定
    return {
      order: 'updatedAt-desc',
      lastUpdated: Date.now()
    }
  }
}