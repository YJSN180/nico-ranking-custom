import { describe, it, expect, vi, beforeEach } from 'vitest'
import { getGroupIdForGenre, extractGenreData, getCachedResponse } from '@/workers/kv-optimization'
import type { RankingGenre } from '@/types/ranking-config'

// Mock unified-compression module
vi.mock('@/lib/unified-compression', () => ({
  decompressAndParseJSON: vi.fn()
}))

describe('KV Optimization', () => {
  describe('getGroupIdForGenre', () => {
    it('should return group 1 for genres: all, game, anime, vocaloid, voicesynthesis, entertainment, music, sing', () => {
      const group1Genres: RankingGenre[] = ['all', 'game', 'anime', 'vocaloid', 'voicesynthesis', 'entertainment', 'music', 'sing']
      group1Genres.forEach(genre => {
        expect(getGroupIdForGenre(genre)).toBe(1)
      })
    })

    it('should return group 2 for genres: dance, play, commentary, cooking, travel, nature, vehicle, technology', () => {
      const group2Genres: RankingGenre[] = ['dance', 'play', 'commentary', 'cooking', 'travel', 'nature', 'vehicle', 'technology']
      group2Genres.forEach(genre => {
        expect(getGroupIdForGenre(genre)).toBe(2)
      })
    })

    it('should return group 3 for genres: society, mmd, vtuber, radio, sports, animal, other', () => {
      const group3Genres: RankingGenre[] = ['society', 'mmd', 'vtuber', 'radio', 'sports', 'animal', 'other']
      group3Genres.forEach(genre => {
        expect(getGroupIdForGenre(genre)).toBe(3)
      })
    })

    it('should return group 1 for unknown genres', () => {
      expect(getGroupIdForGenre('unknown' as RankingGenre)).toBe(1)
    })
  })

  describe('extractGenreData', () => {
    it('should extract specific genre and period data from decompressed content', async () => {
      const mockData = {
        genres: {
          game: {
            '24h': {
              items: [{ id: '1', title: 'Game Video' }],
              popularTags: ['tag1', 'tag2']
            },
            'hour': {
              items: [{ id: '2', title: 'Game Video 2' }],
              popularTags: ['tag3']
            }
          },
          anime: {
            '24h': {
              items: [{ id: '3', title: 'Anime Video' }],
              popularTags: ['anime1']
            }
          }
        },
        metadata: {
          updatedAt: '2025-01-01T00:00:00Z',
          version: 1
        }
      }

      const { decompressAndParseJSON } = await import('@/lib/unified-compression')
      vi.mocked(decompressAndParseJSON).mockResolvedValue({ data: mockData })

      const compressed = new Uint8Array([1, 2, 3]) // Dummy compressed data

      const result = await extractGenreData(compressed, 'game', '24h')
      
      expect(result).toEqual({
        items: [{ id: '1', title: 'Game Video' }],
        popularTags: ['tag1', 'tag2'],
        metadata: mockData.metadata
      })
    })

    it('should return empty data for non-existent genre', async () => {
      const mockData = {
        genres: {},
        metadata: { updatedAt: '2025-01-01T00:00:00Z' }
      }

      const { decompressAndParseJSON } = await import('@/lib/unified-compression')
      vi.mocked(decompressAndParseJSON).mockResolvedValue({ data: mockData })

      const compressed = new Uint8Array([1, 2, 3]) // Dummy compressed data

      const result = await extractGenreData(compressed, 'nonexistent' as any, '24h')
      
      expect(result).toEqual({
        items: [],
        popularTags: [],
        metadata: mockData.metadata
      })
    })
  })

  describe('getCachedResponse', () => {
    const mockCache = {
      match: vi.fn(),
      put: vi.fn()
    }

    beforeEach(() => {
      vi.clearAllMocks()
      // @ts-ignore - Mock global caches
      global.caches = { default: mockCache }
    })

    it('should return cached response if available', async () => {
      const cachedResponse = new Response('cached data', {
        headers: { 'X-Cache-Status': 'HIT' }
      })
      mockCache.match.mockResolvedValue(cachedResponse)

      const getter = vi.fn()
      const result = await getCachedResponse('test-key', getter)

      expect(mockCache.match).toHaveBeenCalledWith('test-key')
      expect(getter).not.toHaveBeenCalled()
      expect(result).toBe(cachedResponse)
    })

    it('should call getter and cache response if not cached', async () => {
      mockCache.match.mockResolvedValue(null)
      
      const freshResponse = new Response('fresh data', {
        status: 200,
        headers: { 'X-Cache-Status': 'MISS' }
      })
      const getter = vi.fn().mockResolvedValue(freshResponse)

      const result = await getCachedResponse('test-key', getter)

      expect(mockCache.match).toHaveBeenCalledWith('test-key')
      expect(getter).toHaveBeenCalled()
      expect(mockCache.put).toHaveBeenCalledWith('test-key', expect.any(Response))
      expect(result).toBeInstanceOf(Response)
    })

    it('should not cache error responses', async () => {
      mockCache.match.mockResolvedValue(null)
      
      const errorResponse = new Response('error', { status: 500 })
      const getter = vi.fn().mockResolvedValue(errorResponse)

      const result = await getCachedResponse('test-key', getter)

      expect(getter).toHaveBeenCalled()
      expect(mockCache.put).not.toHaveBeenCalled()
      expect(result).toBe(errorResponse)
    })
  })
})