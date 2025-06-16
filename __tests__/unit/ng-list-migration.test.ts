import { describe, it, expect } from 'vitest'
import { 
  migrateLegacyNGList, 
  isNewFormatNGList, 
  createEmptyNGList,
  ngListToSaveFormat
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
        derivedVideoIds: undefined
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

      expect(result).toEqual({
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
        derivedVideoIds: undefined
      })
    })
  })

  describe('isNewFormatNGList', () => {
    it('should return true for valid new format', () => {
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

      expect(isNewFormatNGList(newFormat)).toBe(true)
    })

    it('should return false for legacy format', () => {
      const legacy = {
        videoIds: [],
        videoTitles: [],
        authorIds: [],
        authorNames: []
      }

      expect(isNewFormatNGList(legacy)).toBe(false)
    })

    it('should return false for invalid data', () => {
      expect(isNewFormatNGList(null)).toBe(false)
      expect(isNewFormatNGList(undefined)).toBe(false)
      expect(isNewFormatNGList({})).toBe(false)
      expect(isNewFormatNGList('string')).toBe(false)
      expect(isNewFormatNGList(123)).toBe(false)
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
        }
      })
    })
  })

  describe('ngListToSaveFormat', () => {
    it('should remove derivedVideoIds', () => {
      const ngList: NGList = {
        videoIds: ['sm1'],
        videoTitles: {
          exact: ['Title'],
          partial: []
        },
        authorIds: ['user1'],
        authorNames: {
          exact: ['Author'],
          partial: []
        },
        derivedVideoIds: ['sm2', 'sm3']
      }

      const result = ngListToSaveFormat(ngList)

      expect(result).toEqual({
        videoIds: ['sm1'],
        videoTitles: {
          exact: ['Title'],
          partial: []
        },
        authorIds: ['user1'],
        authorNames: {
          exact: ['Author'],
          partial: []
        }
      })
      expect(result).not.toHaveProperty('derivedVideoIds')
    })
  })
})