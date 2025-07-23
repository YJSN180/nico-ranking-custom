import { describe, it, expect } from 'vitest'
import type { RankingItem } from '@/types/ranking'
import type { ExtendedNGList } from '@/types/ng-list-extended'
import { filterWithExtendedNGList } from '@/lib/filter-with-extended-ng-list'

describe('filterWithExtendedNGList', () => {
  const createMockItem = (overrides: Partial<RankingItem>): RankingItem => ({
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
    ...overrides
  })

  const createEmptyExtendedNGList = (): ExtendedNGList => ({
    videoIds: [],
    videoTitles: {
      exact: [],
      partial: []
    },
    authorIds: [],
    authorNames: {
      exact: [],
      partial: []
    },
    tags: {
      locked: { exact: [], partial: [] },
      user: { exact: [], partial: [] },
      both: { exact: [], partial: [] }
    }
  })

  describe('既存機能の互換性', () => {
    it('should filter by video ID', () => {
      const items = [
        createMockItem({ id: 'sm1', title: 'Video 1' }),
        createMockItem({ id: 'sm2', title: 'Video 2' }),
        createMockItem({ id: 'sm3', title: 'Video 3' })
      ]
      const ngList = createEmptyExtendedNGList()
      ngList.videoIds = ['sm2']

      const result = filterWithExtendedNGList(items, ngList)

      expect(result.filteredItems).toHaveLength(2)
      expect(result.filteredItems[0].id).toBe('sm1')
      expect(result.filteredItems[1].id).toBe('sm3')
      expect(result.newDerivedIds).toHaveLength(0)
    })

    it('should filter by title and create derived IDs', () => {
      const items = [
        createMockItem({ id: 'sm1', title: 'NGワード含む動画' }),
        createMockItem({ id: 'sm2', title: '普通の動画' })
      ]
      const ngList = createEmptyExtendedNGList()
      ngList.videoTitles.partial = ['NGワード']

      const result = filterWithExtendedNGList(items, ngList)

      expect(result.filteredItems).toHaveLength(1)
      expect(result.filteredItems[0].id).toBe('sm2')
      expect(result.newDerivedIds).toEqual(['sm1'])
    })
  })

  describe('タグフィルタリング機能', () => {
    it('should filter by locked tag exact match', () => {
      const items = [
        createMockItem({ 
          id: 'sm1', 
          tagDetails: [
            { name: 'ゲーム', isLocked: true },
            { name: '実況プレイ', isLocked: false }
          ]
        }),
        createMockItem({ 
          id: 'sm2',
          tagDetails: [
            { name: '音楽', isLocked: true }
          ]
        })
      ]
      const ngList = createEmptyExtendedNGList()
      ngList.tags!.locked.exact = ['ゲーム']

      const result = filterWithExtendedNGList(items, ngList)

      expect(result.filteredItems).toHaveLength(1)
      expect(result.filteredItems[0].id).toBe('sm2')
      expect(result.newDerivedIds).toEqual(['sm1'])
    })

    it('should filter by user tag partial match', () => {
      const items = [
        createMockItem({ 
          id: 'sm1',
          tagDetails: [
            { name: '歌ってみたコラボ', isLocked: false }
          ]
        }),
        createMockItem({ 
          id: 'sm2',
          tagDetails: [
            { name: 'ゲーム実況', isLocked: false }
          ]
        })
      ]
      const ngList = createEmptyExtendedNGList()
      ngList.tags!.user.partial = ['歌ってみた']

      const result = filterWithExtendedNGList(items, ngList)

      expect(result.filteredItems).toHaveLength(1)
      expect(result.filteredItems[0].id).toBe('sm2')
      expect(result.newDerivedIds).toEqual(['sm1'])
    })

    it('should filter by both tags regardless of lock status', () => {
      const items = [
        createMockItem({ 
          id: 'sm1',
          tagDetails: [
            { name: 'VOCALOID', isLocked: true }
          ]
        }),
        createMockItem({ 
          id: 'sm2',
          tagDetails: [
            { name: 'VOCALOID', isLocked: false }
          ]
        }),
        createMockItem({ 
          id: 'sm3',
          tagDetails: [
            { name: '音楽', isLocked: true }
          ]
        })
      ]
      const ngList = createEmptyExtendedNGList()
      ngList.tags!.both.exact = ['VOCALOID']

      const result = filterWithExtendedNGList(items, ngList)

      expect(result.filteredItems).toHaveLength(1)
      expect(result.filteredItems[0].id).toBe('sm3')
      expect(result.newDerivedIds).toEqual(['sm1', 'sm2'])
    })
  })

  describe('複合フィルタリング', () => {
    it('should filter by multiple criteria', () => {
      const items = [
        createMockItem({ 
          id: 'sm1',
          title: 'ゲーム実況',
          authorName: 'NGユーザー',
          tagDetails: [
            { name: 'ゲーム', isLocked: true }
          ]
        }),
        createMockItem({ 
          id: 'sm2',
          title: '音楽動画',
          authorName: '普通のユーザー',
          tagDetails: [
            { name: '音楽', isLocked: true }
          ]
        }),
        createMockItem({ 
          id: 'sm3',
          title: '料理動画',
          authorName: '料理人',
          tagDetails: [
            { name: '料理', isLocked: true },
            { name: 'ASMR', isLocked: false }
          ]
        })
      ]
      const ngList = createEmptyExtendedNGList()
      ngList.videoTitles.partial = ['ゲーム']
      ngList.authorNames.exact = ['料理人']
      ngList.tags!.user.exact = ['ASMR']

      const result = filterWithExtendedNGList(items, ngList)

      expect(result.filteredItems).toHaveLength(1)
      expect(result.filteredItems[0].id).toBe('sm2')
      expect(result.newDerivedIds).toEqual(['sm1', 'sm3'])
    })
  })

  describe('後方互換性', () => {
    it('should work with NGList without tags', () => {
      const items = [
        createMockItem({ 
          id: 'sm1',
          title: 'タグ付き動画',
          tagDetails: [
            { name: 'ゲーム', isLocked: true }
          ]
        })
      ]
      const ngListWithoutTags: ExtendedNGList = {
        videoIds: [],
        videoTitles: { exact: [], partial: [] },
        authorIds: [],
        authorNames: { exact: [], partial: [] }
        // tagsプロパティなし
      }

      const result = filterWithExtendedNGList(items, ngListWithoutTags)

      expect(result.filteredItems).toHaveLength(1)
      expect(result.newDerivedIds).toHaveLength(0)
    })
  })

  describe('ランク番号の再計算', () => {
    it('should recalculate rank numbers after filtering', () => {
      const items = [
        createMockItem({ id: 'sm1', rank: 1 }),
        createMockItem({ id: 'sm2', rank: 2 }),
        createMockItem({ id: 'sm3', rank: 3 }),
        createMockItem({ id: 'sm4', rank: 4 })
      ]
      const ngList = createEmptyExtendedNGList()
      ngList.videoIds = ['sm2', 'sm4']

      const result = filterWithExtendedNGList(items, ngList)

      expect(result.filteredItems).toHaveLength(2)
      expect(result.filteredItems[0].id).toBe('sm1')
      expect(result.filteredItems[0].rank).toBe(1)
      expect(result.filteredItems[1].id).toBe('sm3')
      expect(result.filteredItems[1].rank).toBe(2)
    })
  })
})