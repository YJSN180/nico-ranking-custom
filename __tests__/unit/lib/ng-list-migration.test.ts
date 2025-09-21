import { describe, test, expect } from 'vitest'
import {
  migrateToExtendedNGList,
  migrateToExtendedUserNGList,
  createEmptyTagNGList,
  isExtendedNGList,
  calculateTotalCountWithTags
} from '@/lib/ng-list-migration-extended'
import type { NGList } from '@/types/ng-list'
import type { ExtendedUserNGList } from '@/types/ng-list-extended'

describe('NGリストデータ移行', () => {
  describe('migrateToExtendedNGList', () => {
    test('version 1のNGListをExtendedNGListに移行できる', () => {
      const oldList: NGList = {
        videoIds: ['sm12345', 'sm67890'],
        videoTitles: {
          exact: ['テスト動画1', 'テスト動画2'],
          partial: ['部分一致テスト']
        },
        authorIds: ['123456', '789012'],
        authorNames: {
          exact: ['テスト投稿者1'],
          partial: ['投稿者部分']
        }
      }

      const migrated = migrateToExtendedNGList(oldList)

      // 既存データが保持されていることを確認
      expect(migrated.videoIds).toEqual(oldList.videoIds)
      expect(migrated.videoTitles).toEqual(oldList.videoTitles)
      expect(migrated.authorIds).toEqual(oldList.authorIds)
      expect(migrated.authorNames).toEqual(oldList.authorNames)

      // 新しいtagsフィールドが追加されていることを確認
      expect(migrated.tags).toBeDefined()
      expect(migrated.tags?.locked.exact).toEqual([])
      expect(migrated.tags?.locked.partial).toEqual([])
      expect(migrated.tags?.user.exact).toEqual([])
      expect(migrated.tags?.user.partial).toEqual([])
      expect(migrated.tags?.both.exact).toEqual([])
      expect(migrated.tags?.both.partial).toEqual([])
    })

    test('既にExtendedNGListの場合はそのまま返す', () => {
      const extendedList = {
        videoIds: ['sm12345'],
        videoTitles: { exact: [], partial: [] },
        authorIds: [],
        authorNames: { exact: [], partial: [] },
        tags: {
          locked: { exact: ['ロックタグ'], partial: [] },
          user: { exact: [], partial: ['ユーザータグ'] },
          both: { exact: [], partial: [] }
        }
      }

      const result = migrateToExtendedNGList(extendedList)

      // 変更されていないことを確認
      expect(result).toBe(extendedList)
      expect(result.tags?.locked.exact).toEqual(['ロックタグ'])
      expect(result.tags?.user.partial).toEqual(['ユーザータグ'])
    })
  })

  describe('migrateToExtendedUserNGList', () => {
    test('version 1のUserNGListをversion 2に移行できる', () => {
      const oldUserList = {
        videoIds: ['sm12345', 'sm67890'],
        videoTitles: {
          exact: ['テスト動画1'],
          partial: ['部分一致']
        },
        authorIds: ['123456'],
        authorNames: {
          exact: ['投稿者1'],
          partial: []
        },
        version: 1,
        totalCount: 6,
        updatedAt: '2025-01-01T00:00:00Z'
      }

      const migrated = migrateToExtendedUserNGList(oldUserList)

      // 既存データが保持されていることを確認
      expect(migrated.videoIds).toEqual(oldUserList.videoIds)
      expect(migrated.videoTitles).toEqual(oldUserList.videoTitles)
      expect(migrated.authorIds).toEqual(oldUserList.authorIds)
      expect(migrated.authorNames).toEqual(oldUserList.authorNames)

      // versionが2に更新されていることを確認
      expect(migrated.version).toBe(2)

      // tagsが追加されていることを確認
      expect(migrated.tags).toBeDefined()
      expect(migrated.tags?.locked).toBeDefined()
      expect(migrated.tags?.user).toBeDefined()
      expect(migrated.tags?.both).toBeDefined()

      // totalCountが保持されていることを確認
      expect(migrated.totalCount).toBe(6)
    })

    test('version 2の場合はそのまま返す', () => {
      const v2UserList: ExtendedUserNGList = {
        videoIds: ['sm12345'],
        videoTitles: { exact: [], partial: [] },
        authorIds: [],
        authorNames: { exact: [], partial: [] },
        tags: {
          locked: { exact: ['既存タグ'], partial: [] },
          user: { exact: [], partial: [] },
          both: { exact: [], partial: [] }
        },
        version: 2,
        totalCount: 2,
        updatedAt: '2025-01-01T00:00:00Z'
      }

      const result = migrateToExtendedUserNGList(v2UserList)

      // 変更されていないことを確認
      expect(result).toEqual(v2UserList)
      expect(result.tags?.locked.exact).toEqual(['既存タグ'])
    })
  })

  describe('isExtendedNGList', () => {
    test('ExtendedNGListを正しく判定できる', () => {
      const extendedList = {
        videoIds: [],
        videoTitles: { exact: [], partial: [] },
        authorIds: [],
        authorNames: { exact: [], partial: [] },
        tags: createEmptyTagNGList()
      }

      expect(isExtendedNGList(extendedList)).toBe(true)
    })

    test('通常のNGListはfalseを返す', () => {
      const normalList: NGList = {
        videoIds: [],
        videoTitles: { exact: [], partial: [] },
        authorIds: [],
        authorNames: { exact: [], partial: [] }
      }

      expect(isExtendedNGList(normalList)).toBe(false)
    })
  })

  describe('calculateTotalCountWithTags', () => {
    test('タグを含めた総数を正しく計算できる', () => {
      const list = {
        videoIds: ['sm1', 'sm2'],
        videoTitles: { exact: ['動画1'], partial: ['部分'] },
        authorIds: ['123'],
        authorNames: { exact: ['投稿者'], partial: [] },
        tags: {
          locked: { exact: ['タグ1', 'タグ2'], partial: ['部分タグ'] },
          user: { exact: ['ユーザータグ'], partial: [] },
          both: { exact: [], partial: ['両方タグ'] }
        }
      }

      const total = calculateTotalCountWithTags(list)

      // 2 + 1 + 1 + 1 + 1 + 0 + 2 + 1 + 1 + 0 + 0 + 1 = 11
      expect(total).toBe(11)
    })

    test('tagsがない場合でもエラーにならない', () => {
      const list = {
        videoIds: ['sm1'],
        videoTitles: { exact: [], partial: [] },
        authorIds: [],
        authorNames: { exact: [], partial: [] }
      }

      const total = calculateTotalCountWithTags(list as any)
      expect(total).toBe(1)
    })
  })
})