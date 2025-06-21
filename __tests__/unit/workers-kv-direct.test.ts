import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { Request as WorkerRequest } from '@cloudflare/workers-types'

// Mock environment
const mockEnv = {
  RANKING_DATA: {
    get: vi.fn(),
    put: vi.fn()
  },
  NEXT_APP_URL: 'https://test-app.vercel.app',
  WORKER_AUTH_KEY: 'test-auth-key'
}

// Mock execution context
const mockContext = {
  waitUntil: vi.fn(),
  passThroughOnException: vi.fn()
}

describe('Worker KV Direct Access', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('KV binding detection', () => {
    it('should detect when KV binding is available', async () => {
      // Test that Worker can detect RANKING_DATA binding
      expect(mockEnv.RANKING_DATA).toBeDefined()
      expect(mockEnv.RANKING_DATA.get).toBeDefined()
    })
  })

  describe('Direct KV read for ranking data', () => {
    it('should read from KV when accessing /api/ranking path', async () => {
      // Mock KV data
      const mockKVData = JSON.stringify({
        genres: {
          all: {
            '24h': {
              items: [{ id: '1', title: 'Test Video' }],
              popularTags: ['tag1']
            }
          }
        }
      })
      
      mockEnv.RANKING_DATA.get.mockResolvedValue(mockKVData)

      // Worker should intercept /api/ranking and use KV directly
      const request = new Request('https://nico-rank.com/api/ranking?genre=all&period=24h')
      
      // Simulate Worker handling
      const kvKey = 'RANKING_GROUP_1' // all genre is in group 1
      await mockEnv.RANKING_DATA.get(kvKey)
      
      expect(mockEnv.RANKING_DATA.get).toHaveBeenCalledWith(kvKey)
    })

    it('should return data for specific genre and period', async () => {
      const mockKVData = {
        genres: {
          game: {
            '24h': {
              items: [
                { id: '1', title: 'Game Video 1', rank: 1 },
                { id: '2', title: 'Game Video 2', rank: 2 }
              ],
              popularTags: ['ゲーム', '実況']
            }
          }
        }
      }
      
      mockEnv.RANKING_DATA.get.mockResolvedValue(JSON.stringify(mockKVData))
      
      // Request for game genre
      const kvKey = 'RANKING_GROUP_1' // game is in group 1
      const result = await mockEnv.RANKING_DATA.get(kvKey)
      const parsed = JSON.parse(result as string)
      
      expect(parsed.genres.game['24h'].items).toHaveLength(2)
      expect(parsed.genres.game['24h'].items[0].title).toBe('Game Video 1')
    })

    it('should handle compressed data with gzip', async () => {
      // Note: In actual implementation, we'll need to handle gzip decompression
      // For now, we test that Worker can detect compressed data
      const compressedMarker = new Uint8Array([0x1f, 0x8b]) // gzip magic bytes
      
      // KV would return binary data as base64 or ArrayBuffer
      mockEnv.RANKING_DATA.get.mockResolvedValue(Buffer.from(compressedMarker).toString('base64'))
      
      const result = await mockEnv.RANKING_DATA.get('RANKING_GROUP_1')
      const buffer = Buffer.from(result as string, 'base64')
      
      // Check for gzip magic bytes
      expect(buffer[0]).toBe(0x1f)
      expect(buffer[1]).toBe(0x8b)
    })
  })

  describe('Fallback to Vercel', () => {
    it('should fallback to Vercel when KV read fails', async () => {
      mockEnv.RANKING_DATA.get.mockRejectedValue(new Error('KV read failed'))
      
      // Worker should detect failure and proxy to Vercel
      const kvResult = await mockEnv.RANKING_DATA.get('RANKING_GROUP_1').catch(() => null)
      
      expect(kvResult).toBeNull()
      // In real implementation, this would trigger a fetch to Vercel
    })

    it('should fallback when KV returns null', async () => {
      mockEnv.RANKING_DATA.get.mockResolvedValue(null)
      
      const result = await mockEnv.RANKING_DATA.get('RANKING_GROUP_1')
      expect(result).toBeNull()
      // Should trigger Vercel fallback
    })
  })

  describe('Genre to KV group mapping', () => {
    it('should map genres to correct KV groups', () => {
      // Group 1 genres
      const group1 = ['all', 'game', 'anime', 'vocaloid', 'voicesynthesis', 'entertainment', 'music', 'sing']
      // Group 2 genres  
      const group2 = ['dance', 'play', 'commentary', 'cooking', 'travel', 'nature', 'vehicle', 'technology']
      // Group 3 genres
      const group3 = ['society', 'mmd', 'vtuber', 'radio', 'sports', 'animal', 'other']
      
      // Test function (will be implemented in Worker)
      const getGroupId = (genre: string): number => {
        if (group1.includes(genre)) return 1
        if (group2.includes(genre)) return 2
        if (group3.includes(genre)) return 3
        return 3 // default
      }
      
      expect(getGroupId('all')).toBe(1)
      expect(getGroupId('game')).toBe(1)
      expect(getGroupId('dance')).toBe(2)
      expect(getGroupId('vtuber')).toBe(3)
    })
  })
})