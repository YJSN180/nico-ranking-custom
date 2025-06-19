import { describe, it, expect, vi, beforeEach, afterAll } from 'vitest'
import type { RankingData } from '@/types/ranking'

// Mock environment variables
const originalEnv = process.env

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

// Mock modules
vi.mock('@/lib/snapshot-api')
vi.mock('@/lib/cloudflare-kv', () => ({
  compressData: vi.fn(async (data: any) => new TextEncoder().encode(data)),
  decompressData: vi.fn(async (data: Uint8Array) => new TextDecoder().decode(data))
}))

// Mock fetch
global.fetch = vi.fn()

describe('Video Stats KV Integration Flow', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('should complete full flow: update script → KV storage → API read', async () => {
    // 1. Setup: Mock ranking data in KV
    const mockRankingData: RankingData = {
      genres: {
        all: {
          '24h': {
            items: [
              { rank: 1, id: 'sm123', title: 'Video 1', thumbURL: '', views: 1000 },
              { rank: 2, id: 'sm456', title: 'Video 2', thumbURL: '', views: 2000 }
            ],
            popularTags: ['tag1', 'tag2']
          },
          'hour': {
            items: [
              { rank: 1, id: 'sm789', title: 'Video 3', thumbURL: '', views: 3000 }
            ],
            popularTags: []
          }
        }
      },
      metadata: { version: 1, updatedAt: new Date().toISOString(), totalItems: 3 }
    }

    // 2. Mock video stats from Snapshot API
    const mockVideoStats = {
      'sm123': { viewCounter: 1100, commentCounter: 55, mylistCounter: 11, likeCounter: 110 },
      'sm456': { viewCounter: 2100, commentCounter: 105, mylistCounter: 21, likeCounter: 210 },
      'sm789': { viewCounter: 3100, commentCounter: 155, mylistCounter: 31, likeCounter: 310 }
    }

    const { fetchVideoStats } = await import('@/lib/snapshot-api')
    vi.mocked(fetchVideoStats).mockImplementation(async (videoIds) => {
      const result: Record<string, any> = {}
      videoIds.forEach(id => {
        if (mockVideoStats[id as keyof typeof mockVideoStats]) {
          result[id] = mockVideoStats[id as keyof typeof mockVideoStats]
        }
      })
      return result
    })

    let storedStatsData: any = null

    // Mock KV operations
    vi.mocked(global.fetch).mockImplementation(async (url, options) => {
      const urlStr = typeof url === 'string' ? url : url.toString()
      
      if (urlStr.includes('RANKING_LATEST') && !options?.method) {
        // Return ranking data
        const data = new TextEncoder().encode(JSON.stringify(mockRankingData))
        return new Response(data, { status: 200 })
      }
      
      if (urlStr.includes('VIDEO_STATS_LATEST') && options?.method === 'PUT') {
        // Store stats data
        const body = options.body as Uint8Array
        storedStatsData = JSON.parse(new TextDecoder().decode(body))
        return new Response(null, { status: 200 })
      }
      
      if (urlStr.includes('VIDEO_STATS_LATEST') && !options?.method) {
        // Return stored stats data
        if (!storedStatsData) {
          return new Response(null, { status: 404 })
        }
        const data = new TextEncoder().encode(JSON.stringify(storedStatsData))
        return new Response(data, { status: 200 })
      }
      
      return new Response(null, { status: 404 })
    })

    // 3. Run update script
    const { updateVideoStats } = await import('../../scripts/update-video-stats')
    await updateVideoStats()

    // 4. Verify stats were written to KV
    expect(storedStatsData).toBeDefined()
    expect(storedStatsData.stats).toEqual(mockVideoStats)
    expect(storedStatsData.metadata.totalVideos).toBe(3)

    // 5. Test API reading from KV
    const { getVideoStatsFromKV } = await import('@/lib/video-stats-kv')
    const kvStats = await getVideoStatsFromKV(['sm123', 'sm456'])
    
    expect(kvStats).toEqual({
      'sm123': mockVideoStats['sm123'],
      'sm456': mockVideoStats['sm456']
    })

    // 6. Test API with partial KV hit
    const partialStats = await getVideoStatsFromKV(['sm123', 'sm999'])
    expect(partialStats).toEqual({
      'sm123': mockVideoStats['sm123']
      // sm999 not found
    })
  })

  it('should handle empty ranking data gracefully', async () => {
    const emptyRankingData: RankingData = {
      genres: {},
      metadata: { version: 1, updatedAt: new Date().toISOString(), totalItems: 0 }
    }

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

    const { updateVideoStats } = await import('../../scripts/update-video-stats')
    await expect(updateVideoStats()).resolves.not.toThrow()
  })
})

describe('Video Stats API with KV Integration', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('should prefer KV data over Snapshot API', async () => {
    // Mock stored stats in KV
    const storedStats = {
      stats: {
        'sm123': { viewCounter: 1500, commentCounter: 75, mylistCounter: 15, likeCounter: 150 },
        'sm456': { viewCounter: 2500, commentCounter: 125, mylistCounter: 25, likeCounter: 250 }
      },
      metadata: {
        version: 1,
        updatedAt: new Date().toISOString(),
        totalVideos: 2
      }
    }

    vi.mocked(global.fetch).mockImplementation(async (url) => {
      const urlStr = typeof url === 'string' ? url : url.toString()
      
      if (urlStr.includes('VIDEO_STATS_LATEST')) {
        const data = new TextEncoder().encode(JSON.stringify(storedStats))
        return new Response(data, { status: 200 })
      }
      
      return new Response(null, { status: 404 })
    })

    // Import and test the API
    const { NextRequest } = await import('next/server')
    const { GET } = await import('@/app/api/edge/video-stats/route')
    
    const request = new NextRequest('http://localhost/api/edge/video-stats?ids=sm123,sm456,sm789')
    const response = await GET(request)
    const data = await response.json()

    expect(response.status).toBe(200)
    expect(data.stats['sm123']).toEqual(storedStats.stats['sm123'])
    expect(data.stats['sm456']).toEqual(storedStats.stats['sm456'])
    expect(data.kvHitRate).toBe(2/3) // 2 out of 3 from KV
  })
})