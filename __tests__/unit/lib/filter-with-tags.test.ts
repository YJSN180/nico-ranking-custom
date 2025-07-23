import { describe, it, expect } from 'vitest'
import type { RankingItem } from '@/types/ranking'
import type { ExtendedNGList } from '@/types/ng-list-extended'
import { filterByTags } from '@/lib/filter-with-tags'

describe('filterByTags', () => {
  const createMockItem = (tagDetails: RankingItem['tagDetails']): RankingItem => ({
    rank: 1,
    id: 'sm12345',
    title: 'Test Video',
    thumbURL: 'https://example.com/thumb.jpg',
    views: 1000,
    comments: 100,
    mylists: 50,
    likes: 30,
    authorId: 'user123',
    authorName: 'Test Author',
    tagDetails
  })

  const createEmptyTags = (): ExtendedNGList['tags'] => ({
    locked: { exact: [], partial: [] },
    user: { exact: [], partial: [] },
    both: { exact: [], partial: [] }
  })

  describe('ロックタグフィルタリング', () => {
    it('should not filter when tags are empty', () => {
      const item = createMockItem([
        { name: 'ゲーム', isLocked: true },
        { name: '実況プレイ', isLocked: false }
      ])
      const ngTags = createEmptyTags()

      expect(filterByTags(item, ngTags)).toBe(false)
    })

    it('should filter by locked tag exact match', () => {
      const item = createMockItem([
        { name: 'ゲーム', isLocked: true },
        { name: '実況プレイ', isLocked: false }
      ])
      const ngTags = createEmptyTags()
      ngTags!.locked.exact = ['ゲーム']

      expect(filterByTags(item, ngTags)).toBe(true)
    })

    it('should not filter user tags when checking locked tags', () => {
      const item = createMockItem([
        { name: 'ゲーム', isLocked: false },
        { name: '実況プレイ', isLocked: false }
      ])
      const ngTags = createEmptyTags()
      ngTags!.locked.exact = ['ゲーム']

      expect(filterByTags(item, ngTags)).toBe(false)
    })

    it('should filter by locked tag partial match', () => {
      const item = createMockItem([
        { name: 'ゲーム実況', isLocked: true }
      ])
      const ngTags = createEmptyTags()
      ngTags!.locked.partial = ['ゲーム']

      expect(filterByTags(item, ngTags)).toBe(true)
    })
  })

  describe('ユーザータグフィルタリング', () => {
    it('should filter by user tag exact match', () => {
      const item = createMockItem([
        { name: '歌ってみた', isLocked: false }
      ])
      const ngTags = createEmptyTags()
      ngTags!.user.exact = ['歌ってみた']

      expect(filterByTags(item, ngTags)).toBe(true)
    })

    it('should not filter locked tags when checking user tags', () => {
      const item = createMockItem([
        { name: '歌ってみた', isLocked: true }
      ])
      const ngTags = createEmptyTags()
      ngTags!.user.exact = ['歌ってみた']

      expect(filterByTags(item, ngTags)).toBe(false)
    })

    it('should filter by user tag partial match', () => {
      const item = createMockItem([
        { name: '歌ってみたカバー', isLocked: false }
      ])
      const ngTags = createEmptyTags()
      ngTags!.user.partial = ['歌ってみた']

      expect(filterByTags(item, ngTags)).toBe(true)
    })
  })

  describe('両方（ロック・ユーザー問わず）フィルタリング', () => {
    it('should filter locked tags by both exact match', () => {
      const item = createMockItem([
        { name: '音楽', isLocked: true }
      ])
      const ngTags = createEmptyTags()
      ngTags!.both.exact = ['音楽']

      expect(filterByTags(item, ngTags)).toBe(true)
    })

    it('should filter user tags by both exact match', () => {
      const item = createMockItem([
        { name: '音楽', isLocked: false }
      ])
      const ngTags = createEmptyTags()
      ngTags!.both.exact = ['音楽']

      expect(filterByTags(item, ngTags)).toBe(true)
    })

    it('should filter by both partial match', () => {
      const item = createMockItem([
        { name: 'BGM素材', isLocked: true },
        { name: 'オリジナルBGM', isLocked: false }
      ])
      const ngTags = createEmptyTags()
      ngTags!.both.partial = ['BGM']

      expect(filterByTags(item, ngTags)).toBe(true)
    })
  })

  describe('エッジケース', () => {
    it('should handle undefined tags', () => {
      const item = createMockItem([
        { name: 'タグ', isLocked: true }
      ])

      expect(filterByTags(item, undefined)).toBe(false)
    })

    it('should handle items without tagDetails', () => {
      const item = createMockItem(undefined)
      const ngTags = createEmptyTags()
      ngTags!.locked.exact = ['ゲーム']

      expect(filterByTags(item, ngTags)).toBe(false)
    })

    it('should handle empty tagDetails array', () => {
      const item = createMockItem([])
      const ngTags = createEmptyTags()
      ngTags!.locked.exact = ['ゲーム']

      expect(filterByTags(item, ngTags)).toBe(false)
    })

    it('should check multiple tags and return true if any matches', () => {
      const item = createMockItem([
        { name: '東方', isLocked: true },
        { name: 'ゲーム', isLocked: true },
        { name: '実況プレイ', isLocked: false }
      ])
      const ngTags = createEmptyTags()
      ngTags!.locked.exact = ['ゲーム']

      expect(filterByTags(item, ngTags)).toBe(true)
    })
  })
})