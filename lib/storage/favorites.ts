import type { DBManager } from './db-manager'
import type { Favorite } from './types'

export class FavoritesManager {
  constructor(private dbManager: DBManager) {}

  async addFavorite(video: Partial<Favorite>): Promise<void> {
    if (!this.dbManager.isInitialized()) {
      throw new Error('Database not initialized')
    }

    const db = this.dbManager.getDB()
    const tx = db.transaction('favorites', 'readwrite')
    
    const favorite: Favorite = {
      id: video.id!,
      title: video.title!,
      thumbURL: video.thumbURL!,
      addedAt: Date.now(),
      tags: [],
      memo: video.memo,
      views: video.views,
      comments: video.comments,
      mylists: video.mylists,
      likes: video.likes,
      authorId: video.authorId,
      authorName: video.authorName,
      authorIcon: video.authorIcon,
      registeredAt: video.registeredAt
    }

    await tx.store.put(favorite)
    await tx.done
  }

  async removeFavorite(videoId: string): Promise<void> {
    if (!this.dbManager.isInitialized()) {
      throw new Error('Database not initialized')
    }

    const db = this.dbManager.getDB()
    const tx = db.transaction('favorites', 'readwrite')
    await tx.store.delete(videoId)
    await tx.done
  }

  async getFavorite(videoId: string): Promise<Favorite | undefined> {
    if (!this.dbManager.isInitialized()) {
      throw new Error('Database not initialized')
    }

    const db = this.dbManager.getDB()
    const tx = db.transaction('favorites', 'readonly')
    return await tx.store.get(videoId)
  }

  async isFavorite(videoId: string): Promise<boolean> {
    const favorite = await this.getFavorite(videoId)
    return favorite !== undefined
  }

  async getAllFavorites(limit?: number): Promise<Favorite[]> {
    if (!this.dbManager.isInitialized()) {
      throw new Error('Database not initialized')
    }

    const db = this.dbManager.getDB()
    const tx = db.transaction('favorites', 'readonly')
    const index = tx.store.index('addedAt')
    
    const favorites: Favorite[] = []
    let cursor = await index.openCursor(null, 'prev') // 新しい順
    
    while (cursor) {
      favorites.push(cursor.value)
      if (limit && favorites.length >= limit) {
        break
      }
      cursor = await cursor.continue()
    }
    
    return favorites
  }

  async updateTags(videoId: string, tags: string[]): Promise<void> {
    if (!this.dbManager.isInitialized()) {
      throw new Error('Database not initialized')
    }

    const db = this.dbManager.getDB()
    const tx = db.transaction('favorites', 'readwrite')
    const favorite = await tx.store.get(videoId)
    
    if (favorite) {
      favorite.tags = tags
      await tx.store.put(favorite)
    }
    
    await tx.done
  }

  async updateMemo(videoId: string, memo: string): Promise<void> {
    if (!this.dbManager.isInitialized()) {
      throw new Error('Database not initialized')
    }

    const db = this.dbManager.getDB()
    const tx = db.transaction('favorites', 'readwrite')
    const favorite = await tx.store.get(videoId)
    
    if (favorite) {
      favorite.memo = memo
      await tx.store.put(favorite)
    }
    
    await tx.done
  }

  async getFavoritesByTag(tag: string): Promise<Favorite[]> {
    if (!this.dbManager.isInitialized()) {
      throw new Error('Database not initialized')
    }

    const db = this.dbManager.getDB()
    const tx = db.transaction('favorites', 'readonly')
    const index = tx.store.index('tags')
    
    const favorites: Favorite[] = []
    let cursor = await index.openCursor(tag)
    
    while (cursor) {
      favorites.push(cursor.value)
      cursor = await cursor.continue()
    }
    
    return favorites
  }
}