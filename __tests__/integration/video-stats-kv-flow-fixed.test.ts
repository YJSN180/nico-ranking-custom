import { describe, it, expect, vi, beforeEach, afterAll } from 'vitest'
import type { RankingData } from '@/types/ranking'

// Mock environment variables
const originalEnv = process.env

beforeAll(() => {
  process.env = {
    ...originalEnv,
    CLOUDFLARE_ACCOUNT_ID: 'test-account',
    CLOUDFLARE_KV_NAMESPACE_ID: 'test-namespace',
    CLOUDFLARE_API_TOKEN: 'test-token'
  }
})

afterAll(() => {
  process.env = originalEnv
})

// Mock modules
vi.mock('@/lib/snapshot-api')
vi.mock('@/lib/cloudflare-kv')

// Mock fetch
global.fetch = vi.fn()

describe('Video Stats KV Integration Flow', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('should complete full flow: update script → KV storage → API read', async () => {
    // 1. Setup: Mock ranking data with 3-key structure
    const mockGroup1Data = {
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

    // Mock KV operations with 3-key structure
    vi.mocked(global.fetch).mockImplementation(async (url, options) => {
      const urlStr = typeof url === 'string' ? url : url.toString()
      
      // Return group 1 data for 3-key structure
      if (urlStr.includes('RANKING_GROUP_1') && !options?.method) {
        return new Response(JSON.stringify(mockGroup1Data), { status: 200 })
      }
      
      // Return empty for other groups
      if ((urlStr.includes('RANKING_GROUP_2') || urlStr.includes('RANKING_GROUP_3')) && !options?.method) {
        return new Response(JSON.stringify({ genres: {}, metadata: mockGroup1Data.metadata }), { status: 200 })
      }
      
      if (urlStr.includes('VIDEO_STATS_LATEST') && options?.method === 'PUT') {
        // Store stats data - no compression
        const body = options.body as string
        storedStatsData = JSON.parse(body)
        return new Response(null, { status: 200 })
      }
      
      if (urlStr.includes('VIDEO_STATS_LATEST') && !options?.method) {
        // Return stored stats data
        if (!storedStatsData) {
          return new Response(null, { status: 404 })
        }
        return new Response(JSON.stringify(storedStatsData), { status: 200 })
      }
      
      return new Response(null, { status: 404 })
    })

    // 3. Mock cloudflare-kv module to return the 3-key structure
    vi.mocked(await import('@/lib/cloudflare-kv')).getRankingFromKV = vi.fn().mockResolvedValue({
      genres: mockGroup1Data.genres,
      metadata: mockGroup1Data.metadata
    })

    // 4. Run update script
    const { updateVideoStats } = await import('../../scripts/update-video-stats')
    await updateVideoStats()

    // 5. Verify stats were written to KV
    expect(storedStatsData).toBeDefined()
    expect(storedStatsData.stats).toEqual(mockVideoStats)
    expect(storedStatsData.metadata.totalVideos).toBe(3)

    // 6. Test API reading from KV - Need to clear mocks first to avoid conflicts
    vi.clearAllMocks()
    
    // Re-setup fetch mock for getVideoStatsFromKV
    vi.mocked(global.fetch).mockImplementation(async (url) => {
      const urlStr = typeof url === 'string' ? url : url.toString()
      
      if (urlStr.includes('VIDEO_STATS_LATEST')) {
        return new Response(JSON.stringify(storedStatsData), { status: 200 })
      }
      
      return new Response(null, { status: 404 })
    })
    
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
    const emptyRankingData = {
      genres: {},
      metadata: { version: 1, updatedAt: new Date().toISOString(), totalItems: 0 }
    }

    vi.mocked(global.fetch).mockImplementation(async (url, options) => {
      const urlStr = typeof url === 'string' ? url : url.toString()
      
      // Return empty for all groups
      if (urlStr.includes('RANKING_GROUP_') && !options?.method) {
        return new Response(JSON.stringify(emptyRankingData), { status: 200 })
      }
      
      if (urlStr.includes('VIDEO_STATS_LATEST') && options?.method === 'PUT') {
        return new Response(null, { status: 200 })
      }
      
      return new Response(null, { status: 404 })
    })

    // Mock cloudflare-kv module to return empty data
    vi.mocked(await import('@/lib/cloudflare-kv')).getRankingFromKV = vi.fn().mockResolvedValue(emptyRankingData)

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

    // Mock fresh stats for missing video
    const freshStats = {
      'sm789': { viewCounter: 3500, commentCounter: 175, mylistCounter: 35, likeCounter: 350 }
    }

    vi.mocked(global.fetch).mockImplementation(async (url) => {
      const urlStr = typeof url === 'string' ? url : url.toString()
      
      if (urlStr.includes('VIDEO_STATS_LATEST')) {
        return new Response(JSON.stringify(storedStats), { status: 200 })
      }
      
      return new Response(null, { status: 404 })
    })

    // Mock fetchVideoStats for missing video
    const { fetchVideoStats } = await import('@/lib/snapshot-api')
    vi.mocked(fetchVideoStats).mockImplementation(async (videoIds) => {
      const result: Record<string, any> = {}
      videoIds.forEach(id => {
        if (freshStats[id as keyof typeof freshStats]) {
          result[id] = freshStats[id as keyof typeof freshStats]
        }
      })
      return result
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
    expect(data.stats['sm789']).toEqual(freshStats['sm789'])
    expect(data.kvHitRate).toBe(2/3) // 2 out of 3 from KV
  })
})