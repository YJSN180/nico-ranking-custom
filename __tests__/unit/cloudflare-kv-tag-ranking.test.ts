import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { getTagRanking } from '@/lib/cloudflare-kv'

// KV REST APIのモック
const mockFetch = vi.fn()
global.fetch = mockFetch

describe('getTagRanking', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    // 環境変数のモック
    process.env.CLOUDFLARE_ACCOUNT_ID = 'test-account'
    process.env.CLOUDFLARE_KV_NAMESPACE_ID = 'test-namespace'
    process.env.CLOUDFLARE_KV_API_TOKEN = 'test-token'
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('should return tag ranking data from the main KV data structure', async () => {
    // Arrange - KV APIレスポンスのモック
    const mockKVData = {
      genres: {
        'other': {
          '24h': {
            items: [],
            popularTags: ['音MAD', '例のアレ', 'VOICEROID実況プレイ'],
            tags: {
              '音MAD': [
                { rank: 1, id: 'sm12345', title: 'Test Video 1', thumbURL: 'https://example.com/1.jpg', views: 1000 },
                { rank: 2, id: 'sm67890', title: 'Test Video 2', thumbURL: 'https://example.com/2.jpg', views: 500 }
              ],
              '例のアレ': [
                { rank: 1, id: 'sm11111', title: 'Test Video 3', thumbURL: 'https://example.com/3.jpg', views: 2000 }
              ]
            }
          }
        }
      }
    }

    // gzip圧縮されたデータをモック
    const pako = await import('pako')
    const compressed = pako.gzip(JSON.stringify(mockKVData))
    
    mockFetch.mockResolvedValueOnce({
      ok: true,
      arrayBuffer: async () => compressed.buffer,
      headers: new Headers({
        'content-encoding': 'gzip',
        'content-type': 'application/json'
      })
    })

    // Act
    const result = await getTagRanking('other', '24h', '音MAD')

    // Assert
    expect(result).toEqual([
      { rank: 1, id: 'sm12345', title: 'Test Video 1', thumbURL: 'https://example.com/1.jpg', views: 1000 },
      { rank: 2, id: 'sm67890', title: 'Test Video 2', thumbURL: 'https://example.com/2.jpg', views: 500 }
    ])
    
    // KV APIが正しく呼ばれたことを確認
    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining('/values/RANKING_LATEST'),
      expect.objectContaining({
        headers: expect.objectContaining({
          'Authorization': 'Bearer test-token'
        })
      })
    )
  })

  it('should return null when tag data is not found', async () => {
    // Arrange
    const mockKVData = {
      genres: {
        'other': {
          '24h': {
            items: [],
            popularTags: ['音MAD'],
            tags: {
              '音MAD': []
            }
          }
        }
      }
    }

    const pako = await import('pako')
    const compressed = pako.gzip(JSON.stringify(mockKVData))
    
    mockFetch.mockResolvedValueOnce({
      ok: true,
      arrayBuffer: async () => compressed.buffer,
      headers: new Headers({
        'content-encoding': 'gzip'
      })
    })

    // Act
    const result = await getTagRanking('other', '24h', '存在しないタグ')

    // Assert
    expect(result).toBeNull()
  })

  it('should return null when genre is not found', async () => {
    // Arrange
    const mockKVData = {
      genres: {}
    }

    const pako = await import('pako')
    const compressed = pako.gzip(JSON.stringify(mockKVData))
    
    mockFetch.mockResolvedValueOnce({
      ok: true,
      arrayBuffer: async () => compressed.buffer,
      headers: new Headers({
        'content-encoding': 'gzip'
      })
    })

    // Act
    const result = await getTagRanking('nonexistent', '24h', '音MAD')

    // Assert
    expect(result).toBeNull()
  })

  it('should handle KV API errors gracefully', async () => {
    // Arrange
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 500,
      text: async () => 'Internal Server Error'
    })

    // Act
    const result = await getTagRanking('other', '24h', '音MAD')

    // Assert
    expect(result).toBeNull()
  })

  it('should handle network errors gracefully', async () => {
    // Arrange
    mockFetch.mockRejectedValueOnce(new Error('Network error'))

    // Act
    const result = await getTagRanking('other', '24h', '音MAD')

    // Assert
    expect(result).toBeNull()
  })
})