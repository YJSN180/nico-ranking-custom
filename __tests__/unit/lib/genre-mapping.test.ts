import { describe, it, expect } from 'vitest'
import { GENRE_ID_MAP } from '@/lib/genre-mapping'
import type { RankingGenre } from '@/types/ranking-config'

describe('genre-mapping', () => {
  describe('GENRE_ID_MAP', () => {
    it('should have mappings for all standard genres', () => {
      const expectedGenres: RankingGenre[] = [
        'all', 'game', 'anime', 'vocaloid', 'voicesynthesis',
        'entertainment', 'music', 'sing', 'dance', 'play',
        'commentary', 'cooking', 'travel', 'nature', 'vehicle',
        'technology', 'society', 'mmd', 'vtuber', 'radio',
        'sports', 'animal', 'other', 'custom'
      ]

      for (const genre of expectedGenres) {
        expect(GENRE_ID_MAP[genre]).toBeDefined()
        expect(typeof GENRE_ID_MAP[genre]).toBe('string')
        expect(GENRE_ID_MAP[genre].length).toBeGreaterThan(0)
      }
    })

    it('should have unique IDs for non-custom genres', () => {
      const ids = Object.entries(GENRE_ID_MAP)
        .filter(([key]) => key !== 'custom')
        .map(([, value]) => value)

      const uniqueIds = new Set(ids)
      expect(uniqueIds.size).toBe(ids.length)
    })

    it('should have "all" genre mapped', () => {
      expect(GENRE_ID_MAP.all).toBe('e9uj2uks')
    })

    it('should have "game" genre mapped', () => {
      expect(GENRE_ID_MAP.game).toBe('4eet3ca4')
    })

    it('should have "anime" genre mapped', () => {
      expect(GENRE_ID_MAP.anime).toBe('zc49b03a')
    })

    it('should have "vocaloid" genre mapped', () => {
      expect(GENRE_ID_MAP.vocaloid).toBe('dshv5do5')
    })

    it('should have "voicesynthesis" genre mapped', () => {
      expect(GENRE_ID_MAP.voicesynthesis).toBe('wnm2mhv0')
    })

    it('should have "custom" genre with special local value', () => {
      expect(GENRE_ID_MAP.custom).toBe('custom-local')
    })

    it('should have correct ID format (alphanumeric)', () => {
      for (const [genre, id] of Object.entries(GENRE_ID_MAP)) {
        if (genre === 'custom') continue // custom has special format
        expect(id).toMatch(/^[a-z0-9]+$/)
      }
    })

    it('should have 24 genre mappings', () => {
      const count = Object.keys(GENRE_ID_MAP).length
      expect(count).toBe(24)
    })
  })
})
