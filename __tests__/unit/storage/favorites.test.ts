import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { FavoritesManager } from '@/lib/storage/favorites'
import { DBManager } from '@/lib/storage/db-manager'
import type { Favorite } from '@/lib/storage/types'
import 'fake-indexeddb/auto'

describe('FavoritesManager', () => {
  let dbManager: DBManager
  let favoritesManager: FavoritesManager

  beforeEach(async () => {
    dbManager = new DBManager()
    await dbManager.init()
    favoritesManager = new FavoritesManager(dbManager)
  })

  afterEach(async () => {
    // クリーンアップ
    if (dbManager.isInitialized()) {
      const db = dbManager.getDB()
      const tx = db.transaction('favorites', 'readwrite')
      await tx.store.clear()
      await tx.done
    }
  })

  describe('お気に入り追加', () => {
    it('動画をお気に入りに追加できる', async () => {
      // Arrange
      const video: Partial<Favorite> = {
        id: 'sm12345',
        title: 'テスト動画',
        thumbURL: 'https://example.com/thumb.jpg'
      }

      // Act
      await favoritesManager.addFavorite(video)

      // Assert
      const favorites = await favoritesManager.getAllFavorites()
      expect(favorites).toHaveLength(1)
      expect(favorites[0].id).toBe('sm12345')
      expect(favorites[0].addedAt).toBeGreaterThan(0)
      expect(favorites[0].tags).toEqual([])
    })

    it('同じ動画を重複して追加しない', async () => {
      // Arrange
      const video: Partial<Favorite> = {
        id: 'sm12345',
        title: 'テスト動画',
        thumbURL: 'https://example.com/thumb.jpg'
      }

      // Act
      await favoritesManager.addFavorite(video)
      await favoritesManager.addFavorite(video)

      // Assert
      const favorites = await favoritesManager.getAllFavorites()
      expect(favorites).toHaveLength(1)
    })

    it('追加情報も保存される', async () => {
      // Arrange
      const video: Partial<Favorite> = {
        id: 'sm12345',
        title: 'テスト動画',
        thumbURL: 'https://example.com/thumb.jpg',
        views: 1000,
        comments: 50,
        mylists: 10,
        likes: 100,
        authorName: 'テスト投稿者'
      }

      // Act
      await favoritesManager.addFavorite(video)

      // Assert
      const favorite = await favoritesManager.getFavorite('sm12345')
      expect(favorite?.views).toBe(1000)
      expect(favorite?.authorName).toBe('テスト投稿者')
    })
  })

  describe('お気に入り削除', () => {
    it('お気に入りから削除できる', async () => {
      // Arrange
      const video: Partial<Favorite> = {
        id: 'sm12345',
        title: 'テスト動画',
        thumbURL: 'https://example.com/thumb.jpg'
      }
      await favoritesManager.addFavorite(video)

      // Act
      await favoritesManager.removeFavorite('sm12345')

      // Assert
      const favorites = await favoritesManager.getAllFavorites()
      expect(favorites).toHaveLength(0)
    })

    it('存在しない動画を削除してもエラーにならない', async () => {
      // Act & Assert
      await expect(favoritesManager.removeFavorite('sm99999')).resolves.not.toThrow()
    })
  })

  describe('お気に入り確認', () => {
    it('お気に入りに登録されているか確認できる', async () => {
      // Arrange
      const video: Partial<Favorite> = {
        id: 'sm12345',
        title: 'テスト動画',
        thumbURL: 'https://example.com/thumb.jpg'
      }
      await favoritesManager.addFavorite(video)

      // Act
      const isFavorite = await favoritesManager.isFavorite('sm12345')
      const isNotFavorite = await favoritesManager.isFavorite('sm99999')

      // Assert
      expect(isFavorite).toBe(true)
      expect(isNotFavorite).toBe(false)
    })
  })

  describe('お気に入り一覧取得', () => {
    it('追加日時の新しい順で取得できる', async () => {
      // Arrange
      const video1: Partial<Favorite> = {
        id: 'sm1',
        title: '動画1',
        thumbURL: 'https://example.com/1.jpg'
      }
      const video2: Partial<Favorite> = {
        id: 'sm2',
        title: '動画2',
        thumbURL: 'https://example.com/2.jpg'
      }
      
      await favoritesManager.addFavorite(video1)
      await new Promise(resolve => setTimeout(resolve, 10)) // 時間差を作る
      await favoritesManager.addFavorite(video2)

      // Act
      const favorites = await favoritesManager.getAllFavorites()

      // Assert
      expect(favorites).toHaveLength(2)
      expect(favorites[0].id).toBe('sm2') // 新しい方が先
      expect(favorites[1].id).toBe('sm1')
    })

    it('件数を指定して取得できる', async () => {
      // Arrange
      for (let i = 1; i <= 5; i++) {
        await favoritesManager.addFavorite({
          id: `sm${i}`,
          title: `動画${i}`,
          thumbURL: `https://example.com/${i}.jpg`
        })
      }

      // Act
      const favorites = await favoritesManager.getAllFavorites(3)

      // Assert
      expect(favorites).toHaveLength(3)
    })
  })

  describe('タグ機能', () => {
    it('タグを更新できる', async () => {
      // Arrange
      const video: Partial<Favorite> = {
        id: 'sm12345',
        title: 'テスト動画',
        thumbURL: 'https://example.com/thumb.jpg'
      }
      await favoritesManager.addFavorite(video)

      // Act
      await favoritesManager.updateTags('sm12345', ['音楽', 'VOCALOID'])

      // Assert
      const favorite = await favoritesManager.getFavorite('sm12345')
      expect(favorite?.tags).toEqual(['音楽', 'VOCALOID'])
    })

    it('タグで検索できる', async () => {
      // Arrange
      await favoritesManager.addFavorite({
        id: 'sm101',
        title: '音楽動画',
        thumbURL: 'https://example.com/101.jpg'
      })
      await favoritesManager.addFavorite({
        id: 'sm102',
        title: 'ゲーム動画',
        thumbURL: 'https://example.com/102.jpg'
      })
      
      await favoritesManager.updateTags('sm101', ['音楽', 'VOCALOID'])
      await favoritesManager.updateTags('sm102', ['ゲーム'])

      // Act
      const musicVideos = await favoritesManager.getFavoritesByTag('音楽')

      // Assert
      expect(musicVideos).toHaveLength(1)
      expect(musicVideos[0].id).toBe('sm101')
    })
  })

  describe('メモ機能', () => {
    it('メモを更新できる', async () => {
      // Arrange
      const video: Partial<Favorite> = {
        id: 'sm12345',
        title: 'テスト動画',
        thumbURL: 'https://example.com/thumb.jpg'
      }
      await favoritesManager.addFavorite(video)

      // Act
      await favoritesManager.updateMemo('sm12345', 'お気に入りの動画です')

      // Assert
      const favorite = await favoritesManager.getFavorite('sm12345')
      expect(favorite?.memo).toBe('お気に入りの動画です')
    })
  })
})