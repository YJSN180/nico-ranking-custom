import { describe, it, expect } from 'vitest'
import type { NGList } from '../../../types/ng-list'
import type { ExtendedNGList, ExtendedUserNGList } from '../../../types/ng-list-extended'
import { 
  isExtendedNGList,
  migrateToExtendedNGList,
  migrateToExtendedUserNGList,
  calculateTotalCountWithTags
} from '../../../lib/ng-list-migration-extended'

describe('NG List Extended Migration', () => {
  describe('isExtendedNGList', () => {
    it('should return true for ExtendedNGList with tags', () => {
      const extendedList: ExtendedNGList = {
        videoIds: [],
        videoTitles: { exact: [], partial: [] },
        authorIds: [],
        authorNames: { exact: [], partial: [] },
        tags: {
          locked: { exact: [], partial: [] },
          user: { exact: [], partial: [] },
          both: { exact: [], partial: [] }
        }
      }

      expect(isExtendedNGList(extendedList)).toBe(true)
    })

    it('should return false for standard NGList without tags', () => {
      const standardList: NGList = {
        videoIds: [],
        videoTitles: { exact: [], partial: [] },
        authorIds: [],
        authorNames: { exact: [], partial: [] }
      }

      expect(isExtendedNGList(standardList)).toBe(false)
    })

    it('should return false for invalid objects', () => {
      expect(isExtendedNGList(null)).toBe(false)
      expect(isExtendedNGList(undefined)).toBe(false)
      expect(isExtendedNGList({})).toBe(false)
      expect(isExtendedNGList({ tags: {} })).toBe(false)
    })
  })

  describe('migrateToExtendedNGList', () => {
    it('should return the same object if already extended', () => {
      const extendedList: ExtendedNGList = {
        videoIds: ['sm123'],
        videoTitles: { exact: ['test'], partial: [] },
        authorIds: [],
        authorNames: { exact: [], partial: [] },
        tags: {
          locked: { exact: ['ゲーム'], partial: [] },
          user: { exact: [], partial: [] },
          both: { exact: [], partial: [] }
        }
      }

      const result = migrateToExtendedNGList(extendedList)
      expect(result).toBe(extendedList) // 同じ参照
      expect(result.tags?.locked.exact).toEqual(['ゲーム'])
    })

    it('should add empty tags to standard NGList', () => {
      const standardList: NGList = {
        videoIds: ['sm456'],
        videoTitles: { exact: [], partial: ['実況'] },
        authorIds: ['user123'],
        authorNames: { exact: ['テスト投稿者'], partial: [] }
      }

      const result = migrateToExtendedNGList(standardList)
      
      expect(result).not.toBe(standardList) // 新しいオブジェクト
      expect(result.videoIds).toEqual(['sm456'])
      expect(result.videoTitles.partial).toEqual(['実況'])
      expect(result.authorIds).toEqual(['user123'])
      expect(result.authorNames.exact).toEqual(['テスト投稿者'])
      
      // 空のタグが追加されている
      expect(result.tags).toBeDefined()
      expect(result.tags?.locked.exact).toEqual([])
      expect(result.tags?.locked.partial).toEqual([])
      expect(result.tags?.user.exact).toEqual([])
      expect(result.tags?.user.partial).toEqual([])
      expect(result.tags?.both.exact).toEqual([])
      expect(result.tags?.both.partial).toEqual([])
    })

    it('should preserve derivedVideoIds if present', () => {
      const listWithDerived: NGList = {
        videoIds: [],
        videoTitles: { exact: [], partial: [] },
        authorIds: [],
        authorNames: { exact: [], partial: [] },
        derivedVideoIds: ['sm789', 'sm012']
      }

      const result = migrateToExtendedNGList(listWithDerived)
      expect(result.derivedVideoIds).toEqual(['sm789', 'sm012'])
    })
  })

  describe('migrateToExtendedUserNGList', () => {
    it('should migrate UserNGList version 1 to version 2', () => {
      const userList = {
        videoIds: ['sm123'],
        videoTitles: { exact: ['タイトル'], partial: [] },
        authorIds: [],
        authorNames: { exact: [], partial: [] },
        version: 1,
        totalCount: 1,
        updatedAt: '2025-07-01T00:00:00Z'
      }

      const result = migrateToExtendedUserNGList(userList)
      
      expect(result.version).toBe(2) // バージョンアップ
      expect(result.tags).toBeDefined()
      expect(result.tags?.locked.exact).toEqual([])
      expect(result.totalCount).toBe(1) // 既存のカウントは維持
      expect(result.updatedAt).not.toBe('2025-07-01T00:00:00Z') // 更新日時は新しくなる
    })

    it('should not modify already migrated UserNGList', () => {
      const extendedUserList: ExtendedUserNGList = {
        videoIds: [],
        videoTitles: { exact: [], partial: [] },
        authorIds: [],
        authorNames: { exact: [], partial: [] },
        tags: {
          locked: { exact: ['ゲーム'], partial: [] },
          user: { exact: [], partial: ['実況'] },
          both: { exact: [], partial: [] }
        },
        version: 2,
        totalCount: 2,
        updatedAt: '2025-07-23T00:00:00Z'
      }

      const result = migrateToExtendedUserNGList(extendedUserList)
      expect(result).toBe(extendedUserList) // 同じ参照
      expect(result.version).toBe(2)
      expect(result.updatedAt).toBe('2025-07-23T00:00:00Z') // 更新されない
    })
  })

  describe('calculateTotalCountWithTags', () => {
    it('should calculate correct total without tags', () => {
      const list: ExtendedNGList = {
        videoIds: ['sm1', 'sm2'],
        videoTitles: { exact: ['title1'], partial: ['partial1', 'partial2'] },
        authorIds: ['author1'],
        authorNames: { exact: ['name1', 'name2'], partial: ['pname1'] }
      }

      expect(calculateTotalCountWithTags(list)).toBe(9)
    })

    it('should calculate correct total with tags', () => {
      const list: ExtendedNGList = {
        videoIds: ['sm1'],
        videoTitles: { exact: [], partial: [] },
        authorIds: [],
        authorNames: { exact: [], partial: [] },
        tags: {
          locked: { exact: ['tag1', 'tag2'], partial: ['ptag1'] },
          user: { exact: ['utag1'], partial: [] },
          both: { exact: [], partial: ['btag1', 'btag2'] }
        }
      }

      expect(calculateTotalCountWithTags(list)).toBe(7)
    })

    it('should handle undefined tags', () => {
      const list: ExtendedNGList = {
        videoIds: [],
        videoTitles: { exact: ['title'], partial: [] },
        authorIds: [],
        authorNames: { exact: [], partial: [] }
      }

      expect(calculateTotalCountWithTags(list)).toBe(1)
    })
  })
})