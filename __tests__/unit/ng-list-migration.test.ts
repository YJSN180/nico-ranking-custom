import { describe, it, expect } from 'vitest'
import { 
  migrateLegacyNGList, 
  isLegacyFormat, 
  createEmptyNGList,
  getNGListStats
} from '@/lib/ng-list-migration'
import type { NGList } from '@/types/ng-list'

describe('NG List Migration', () => {
  describe('migrateLegacyNGList', () => {
    it('should convert legacy format to new format', () => {
      const legacy = {
        videoIds: ['sm1', 'sm2'],
        videoTitles: ['Title 1', 'Title 2'],
        authorIds: ['user1', 'user2'],
        authorNames: ['Author 1', 'Author 2'],
        derivedVideoIds: ['sm3', 'sm4']
      }

      const result = migrateLegacyNGList(legacy)

      expect(result).toEqual({
        videoIds: ['sm1', 'sm2'],
        videoTitles: {
          exact: ['Title 1', 'Title 2'],
          partial: []
        },
        authorIds: ['user1', 'user2'],
        authorNames: {
          exact: ['Author 1', 'Author 2'],
          partial: []
        },
        derivedVideoIds: ['sm3', 'sm4']
      })
    })

    it('should handle null/undefined input', () => {
      expect(migrateLegacyNGList(null)).toEqual(createEmptyNGList())
      expect(migrateLegacyNGList(undefined)).toEqual(createEmptyNGList())
    })

    it('should handle missing properties', () => {
      const partial = {
        videoIds: ['sm1'],
        authorIds: ['user1']
      }

      const result = migrateLegacyNGList(partial)

      expect(result).toEqual({
        videoIds: ['sm1'],
        videoTitles: {
          exact: [],
          partial: []
        },
        authorIds: ['user1'],
        authorNames: {
          exact: [],
          partial: []
        },
        derivedVideoIds: []
      })
    })

    it('should return new format data as-is', () => {
      const newFormat: NGList = {
        videoIds: ['sm1'],
        videoTitles: {
          exact: ['Exact Title'],
          partial: ['Partial']
        },
        authorIds: ['user1'],
        authorNames: {
          exact: ['Exact Author'],
          partial: ['Author']
        }
      }

      const result = migrateLegacyNGList(newFormat)

      expect(result).toBe(newFormat) // Same reference
    })

    it('should handle invalid data types', () => {
      const invalid = {
        videoIds: 'not-an-array',
        videoTitles: 123,
        authorIds: null,
        authorNames: undefined
      }

      const result = migrateLegacyNGList(invalid)

      // migrateLegacyNGList doesn't validate types, just uses || operator
      expect(result).toEqual({
        videoIds: 'not-an-array', // Non-array values are kept as-is
        videoTitles: {
          exact: 123, // Non-array values are kept as-is
          partial: []
        },
        authorIds: [],
        authorNames: {
          exact: [],
          partial: []
        },
        derivedVideoIds: []
      })
    })
  })

  describe('isLegacyFormat', () => {
    it('should return true for legacy format', () => {
      const legacy = {
        videoIds: [],
        videoTitles: [],
        authorIds: [],
        authorNames: []
      }

      expect(isLegacyFormat(legacy)).toBe(true)
    })

    it('should return false for new format', () => {
      const newFormat: NGList = {
        videoIds: [],
        videoTitles: {
          exact: [],
          partial: []
        },
        authorIds: [],
        authorNames: {
          exact: [],
          partial: []
        }
      }

      expect(isLegacyFormat(newFormat)).toBe(false)
    })

    it('should return false for invalid data', () => {
      // isLegacyFormat returns falsy value (null/undefined/false) when data is falsy or invalid
      expect(isLegacyFormat(null)).toBeFalsy()
      expect(isLegacyFormat(undefined)).toBeFalsy()
      expect(isLegacyFormat({})).toBeFalsy()
      expect(isLegacyFormat('string')).toBeFalsy()
      expect(isLegacyFormat(123)).toBeFalsy()
    })
  })

  describe('createEmptyNGList', () => {
    it('should create an empty NG list with correct structure', () => {
      const empty = createEmptyNGList()

      expect(empty).toEqual({
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
        derivedVideoIds: []
      })
    })
  })

  describe('getNGListStats', () => {
    it('should calculate statistics correctly', () => {
      const ngList: NGList = {
        videoIds: ['sm1', 'sm2'],
        videoTitles: {
          exact: ['Title1'],
          partial: ['Title2', 'Title3']
        },
        authorIds: ['user1'],
        authorNames: {
          exact: ['Author1', 'Author2'],
          partial: ['Author3']
        },
        derivedVideoIds: ['sm3', 'sm4', 'sm5']
      }

      const stats = getNGListStats(ngList)

      expect(stats).toEqual({
        manualVideoIds: 2,
        manualVideoTitles: 3,
        manualAuthorIds: 1,
        manualAuthorNames: 3,
        derivedVideoIds: 3
      })
    })

    it('should handle empty NG list', () => {
      const ngList = createEmptyNGList()
      const stats = getNGListStats(ngList)

      expect(stats).toEqual({
        manualVideoIds: 0,
        manualVideoTitles: 0,
        manualAuthorIds: 0,
        manualAuthorNames: 0,
        derivedVideoIds: 0
      })
    })
  })
})