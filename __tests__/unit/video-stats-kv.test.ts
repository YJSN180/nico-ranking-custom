import { describe, it, expect, vi, beforeEach } from 'vitest'
import { getVideoStatsFromKV } from '@/lib/video-stats-kv'
import type { VideoStats } from '@/lib/snapshot-api'

// Mock fetch globally
global.fetch = vi.fn()

// Store original env
const originalEnv = process.env

// Mock environment variables
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

describe('getVideoStatsFromKV', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('should return empty object when KV fetch fails', async () => {
    // Arrange
    vi.mocked(global.fetch).mockResolvedValueOnce(
      new Response(null, { status: 404 })
    )

    // Act
    const result = await getVideoStatsFromKV(['sm123', 'sm456'])

    // Assert
    expect(result).toEqual({})
    expect(global.fetch).toHaveBeenCalledWith(
      'https://api.cloudflare.com/client/v4/accounts/test-account/storage/kv/namespaces/test-namespace/values/VIDEO_STATS_LATEST',
      {
        headers: {
          'Authorization': 'Bearer test-token'
        }
      }
    )
  })

  it('should return stats for requested video IDs from KV', async () => {
    // Arrange
    const kvData = {
      stats: {
        'sm123': {
          viewCounter: 1000,
          commentCounter: 50,
          mylistCounter: 10,
          likeCounter: 100
        },
        'sm456': {
          viewCounter: 2000,
          commentCounter: 100,
          mylistCounter: 20,
          likeCounter: 200
        },
        'sm789': {
          viewCounter: 3000,
          commentCounter: 150,
          mylistCounter: 30,
          likeCounter: 300
        }
      },
      metadata: {
        version: 1,
        updatedAt: '2024-01-01T00:00:00Z',
        totalVideos: 3
      }
    }

    // Mock plain text response (no compression)
    vi.mocked(global.fetch).mockResolvedValueOnce(
      new Response(JSON.stringify(kvData), { status: 200 })
    )

    // Act
    const result = await getVideoStatsFromKV(['sm123', 'sm456'])

    // Assert
    expect(result).toEqual({
      'sm123': {
        viewCounter: 1000,
        commentCounter: 50,
        mylistCounter: 10,
        likeCounter: 100
      },
      'sm456': {
        viewCounter: 2000,
        commentCounter: 100,
        mylistCounter: 20,
        likeCounter: 200
      }
    })
  })

  it('should handle missing video IDs gracefully', async () => {
    // Arrange
    const kvData = {
      stats: {
        'sm123': {
          viewCounter: 1000,
          commentCounter: 50,
          mylistCounter: 10,
          likeCounter: 100
        }
      },
      metadata: {
        version: 1,
        updatedAt: '2024-01-01T00:00:00Z',
        totalVideos: 1
      }
    }

    // Mock plain text response (no compression)
    vi.mocked(global.fetch).mockResolvedValueOnce(
      new Response(JSON.stringify(kvData), { status: 200 })
    )

    // Act
    const result = await getVideoStatsFromKV(['sm123', 'sm999'])

    // Assert
    expect(result).toEqual({
      'sm123': {
        viewCounter: 1000,
        commentCounter: 50,
        mylistCounter: 10,
        likeCounter: 100
      }
      // sm999 is not in the result because it's not in KV
    })
  })

  it('should handle JSON parse errors gracefully', async () => {
    // Arrange - Return invalid JSON
    vi.mocked(global.fetch).mockResolvedValueOnce(
      new Response('invalid json', { status: 200 })
    )

    // Act
    const result = await getVideoStatsFromKV(['sm123'])

    // Assert
    expect(result).toEqual({})
  })

  it('should handle malformed JSON data structure gracefully', async () => {
    // Arrange - Return JSON but without expected structure
    vi.mocked(global.fetch).mockResolvedValueOnce(
      new Response(JSON.stringify({ invalid: 'structure' }), { status: 200 })
    )

    // Act
    const result = await getVideoStatsFromKV(['sm123'])

    // Assert
    expect(result).toEqual({})
  })

  it('should return empty object for empty video ID list', async () => {
    // Act
    const result = await getVideoStatsFromKV([])

    // Assert
    expect(result).toEqual({})
    expect(global.fetch).not.toHaveBeenCalled()
  })
})