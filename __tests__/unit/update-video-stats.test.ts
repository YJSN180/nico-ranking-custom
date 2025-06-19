import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import type { RankingData } from '@/types/ranking'

// Mock modules before importing the script
vi.mock('@/lib/snapshot-api')
vi.mock('@/lib/cloudflare-kv', () => ({
  compressData: vi.fn(),
  decompressData: vi.fn()
}))

// Mock fetch globally
global.fetch = vi.fn()

// Store original env and console
const originalEnv = process.env
const originalConsole = { ...console }

// Setup environment variables
beforeAll(() => {
  process.env = {
    ...originalEnv,
    CLOUDFLARE_ACCOUNT_ID: 'test-account',
    CLOUDFLARE_KV_NAMESPACE_ID: 'test-namespace',
    CLOUDFLARE_KV_API_TOKEN: 'test-token'
  }
})

afterAll(() => {
  process.env = originalEnv
})

describe('update-video-stats script', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    // Clear module cache to allow re-importing
    vi.resetModules()
    // Suppress console logs during tests
    console.log = vi.fn()
    console.error = vi.fn()
  })

  afterEach(() => {
    // Restore console
    console.log = originalConsole.log
    console.error = originalConsole.error
  })

  it('should fetch ranking data, extract video IDs, and update stats in KV', async () => {
    // Arrange
    const mockRankingData: RankingData = {
      genres: {
        all: {
          '24h': {
            items: [
              { rank: 1, id: 'sm123', title: 'Video 1', thumbURL: '', views: 1000 },
              { rank: 2, id: 'sm456', title: 'Video 2', thumbURL: '', views: 2000 }
            ],
            popularTags: []
          },
          'hour': {
            items: [
              { rank: 1, id: 'sm123', title: 'Video 1', thumbURL: '', views: 1100 },
              { rank: 2, id: 'sm789', title: 'Video 3', thumbURL: '', views: 3000 }
            ],
            popularTags: []
          }
        },
        game: {
          '24h': {
            items: [
              { rank: 1, id: 'sm456', title: 'Video 2', thumbURL: '', views: 2100 },
              { rank: 2, id: 'sm999', title: 'Video 4', thumbURL: '', views: 4000 }
            ],
            popularTags: []
          },
          'hour': {
            items: [],
            popularTags: []
          }
        }
      },
      metadata: { version: 1, updatedAt: '2024-01-01T00:00:00Z', totalItems: 6 }
    }

    const mockVideoStats = {
      'sm123': { viewCounter: 1200, commentCounter: 60, mylistCounter: 12, likeCounter: 120 },
      'sm456': { viewCounter: 2200, commentCounter: 110, mylistCounter: 22, likeCounter: 220 },
      'sm789': { viewCounter: 3200, commentCounter: 160, mylistCounter: 32, likeCounter: 320 },
      'sm999': { viewCounter: 4200, commentCounter: 210, mylistCounter: 42, likeCounter: 420 }
    }

    const { fetchVideoStats } = await import('@/lib/snapshot-api')

    // Mock cloudflare-kv functions
    const { compressData, decompressData } = await import('@/lib/cloudflare-kv')
    vi.mocked(compressData).mockResolvedValue(new TextEncoder().encode(JSON.stringify(mockRankingData)))
    vi.mocked(decompressData).mockResolvedValue(mockRankingData)

    // Mock KV fetch for ranking data
    vi.mocked(global.fetch).mockImplementation(async (url, options) => {
      const urlStr = typeof url === 'string' ? url : url.toString()
      
      if (urlStr.includes('RANKING_LATEST')) {
        const data = new TextEncoder().encode(JSON.stringify(mockRankingData))
        return new Response(data, { status: 200 })
      }
      
      if (urlStr.includes('VIDEO_STATS_LATEST') && options?.method === 'PUT') {
        return new Response(null, { status: 200 })
      }
      
      return new Response(null, { status: 404 })
    })

    // Mock fetchVideoStats
    vi.mocked(fetchVideoStats).mockImplementation(async (videoIds) => {
      const result: Record<string, any> = {}
      videoIds.forEach(id => {
        if (mockVideoStats[id as keyof typeof mockVideoStats]) {
          result[id] = mockVideoStats[id as keyof typeof mockVideoStats]
        }
      })
      return result
    })

    // Act
    const { updateVideoStats } = await import('../../scripts/update-video-stats')
    await updateVideoStats()

    // Assert
    // Verify that ranking data was fetched
    expect(global.fetch).toHaveBeenCalledWith(
      expect.stringContaining('RANKING_LATEST'),
      expect.objectContaining({
        headers: expect.objectContaining({
          'Authorization': 'Bearer test-token'
        })
      })
    )

    // Verify that fetchVideoStats was called with unique video IDs
    expect(fetchVideoStats).toHaveBeenCalled()
    const allCalls = vi.mocked(fetchVideoStats).mock.calls.flat().flat()
    const uniqueIds = new Set(allCalls)
    expect(uniqueIds.size).toBe(4) // sm123, sm456, sm789, sm999

    // Verify that stats were written to KV
    expect(global.fetch).toHaveBeenCalledWith(
      expect.stringContaining('VIDEO_STATS_LATEST'),
      expect.objectContaining({
        method: 'PUT',
        headers: expect.objectContaining({
          'Authorization': 'Bearer test-token',
          'Content-Type': 'application/octet-stream'
        })
      })
    )
  })

  it('should handle ranking data fetch failure gracefully', async () => {
    // Arrange
    vi.mocked(global.fetch).mockResolvedValueOnce(
      new Response(null, { status: 404 })
    )

    // Act & Assert
    const { updateVideoStats } = await import('../../scripts/update-video-stats')
    await expect(updateVideoStats()).rejects.toThrow('No ranking data found in KV')
    expect(console.error).toHaveBeenCalledWith('No ranking data found in KV')
  })

  it('should handle empty ranking data gracefully', async () => {
    // Arrange
    const emptyRankingData: RankingData = {
      genres: {},
      metadata: { version: 1, updatedAt: '2024-01-01T00:00:00Z', totalItems: 0 }
    }

    const { compressData, decompressData } = await import('@/lib/cloudflare-kv')
    vi.mocked(compressData).mockResolvedValue(new TextEncoder().encode(JSON.stringify(emptyRankingData)))
    vi.mocked(decompressData).mockResolvedValue(emptyRankingData)
    
    vi.mocked(global.fetch).mockImplementation(async (url, options) => {
      const urlStr = typeof url === 'string' ? url : url.toString()
      
      if (urlStr.includes('RANKING_LATEST')) {
        const data = new TextEncoder().encode(JSON.stringify(emptyRankingData))
        return new Response(data, { status: 200 })
      }
      
      if (urlStr.includes('VIDEO_STATS_LATEST') && options?.method === 'PUT') {
        return new Response(null, { status: 200 })
      }
      
      return new Response(null, { status: 404 })
    })

    // Act
    const { updateVideoStats } = await import('../../scripts/update-video-stats')
    await updateVideoStats()

    // Assert
    expect(console.log).toHaveBeenCalledWith('Found 0 unique videos to update')
    expect(console.log).toHaveBeenCalledWith('Successfully updated stats for 0 videos')
  })

  it('should handle stats fetch errors gracefully', async () => {
    // Arrange
    const mockRankingData: RankingData = {
      genres: {
        all: {
          '24h': {
            items: [
              { rank: 1, id: 'sm123', title: 'Video 1', thumbURL: '', views: 1000 }
            ],
            popularTags: []
          },
          'hour': { items: [], popularTags: [] }
        }
      },
      metadata: { version: 1, updatedAt: '2024-01-01T00:00:00Z', totalItems: 1 }
    }

    const { compressData, decompressData } = await import('@/lib/cloudflare-kv')
    const { fetchVideoStats } = await import('@/lib/snapshot-api')
    vi.mocked(compressData).mockResolvedValue(new TextEncoder().encode(JSON.stringify(mockRankingData)))
    vi.mocked(decompressData).mockResolvedValue(mockRankingData)

    vi.mocked(global.fetch).mockImplementation(async (url) => {
      const urlStr = typeof url === 'string' ? url : url.toString()
      
      if (urlStr.includes('RANKING_LATEST')) {
        const data = new TextEncoder().encode(JSON.stringify(mockRankingData))
        return new Response(data, { status: 200 })
      }
      
      return new Response(null, { status: 404 })
    })

    // Mock fetchVideoStats to throw error
    vi.mocked(fetchVideoStats).mockRejectedValueOnce(new Error('Network error'))

    // Act & Assert
    const { updateVideoStats } = await import('../../scripts/update-video-stats')
    await expect(updateVideoStats()).rejects.toThrow('Network error')
    expect(console.error).toHaveBeenCalledWith('Failed to update video stats:', expect.any(Error))
  })
})