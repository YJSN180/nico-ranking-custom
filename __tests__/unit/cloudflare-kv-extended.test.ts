import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import type { KVRankingData } from '@/lib/cloudflare-kv'

// pako モック
vi.mock('pako', () => ({
  gzip: vi.fn((data) => new TextEncoder().encode(data)),
  ungzip: vi.fn((data, options) => {
    if (options?.to === 'string') {
      return new TextDecoder().decode(data)
    }
    return data
  })
}))

// fetch モック
const mockFetch = vi.fn()
global.fetch = mockFetch

describe('cloudflare-kv.ts - Extended Coverage', () => {
  const mockRankingData: KVRankingData = {
    genres: {
      all: {
        '24h': {
          items: [
            { rank: 1, id: 'sm123', title: 'Test Video', thumbURL: 'url', views: 1000 }
          ],
          popularTags: ['tag1', 'tag2']
        },
        hour: {
          items: [
            { rank: 1, id: 'sm456', title: 'Test Video 2', thumbURL: 'url2', views: 500 }
          ],
          popularTags: ['tag3']
        }
      }
    },
    metadata: {
      version: 1,
      updatedAt: '2024-01-01T00:00:00Z',
      totalItems: 2
    }
  }

  beforeEach(() => {
    vi.clearAllMocks()
    // 環境変数設定
    process.env.CLOUDFLARE_ACCOUNT_ID = 'test-account'
    process.env.CLOUDFLARE_KV_NAMESPACE_ID = 'test-namespace'
    process.env.CLOUDFLARE_KV_API_TOKEN = 'test-token'
    
    // グローバル変数をリセット
    ;(global as any).RANKING_KV = undefined
  })

  afterEach(() => {
    delete process.env.CLOUDFLARE_ACCOUNT_ID
    delete process.env.CLOUDFLARE_KV_NAMESPACE_ID
    delete process.env.CLOUDFLARE_KV_API_TOKEN
  })

  describe('compressData / decompressData', () => {
    it('データを正しく圧縮・解凍できる', async () => {
      const module = await import('@/lib/cloudflare-kv')
      
      const testData = { test: 'data', nested: { value: 123 } }
      const compressed = await module.compressData(testData)
      
      expect(compressed).toBeInstanceOf(Uint8Array)
      
      const decompressed = await module.decompressData(compressed)
      expect(decompressed).toEqual(testData)
    })

    it('大きなデータも正しく処理できる', async () => {
      const module = await import('@/lib/cloudflare-kv')
      
      const largeData = {
        items: Array.from({ length: 1000 }, (_, i) => ({
          id: `sm${i}`,
          title: `Video ${i}`,
          views: i * 100
        }))
      }
      
      const compressed = await module.compressData(largeData)
      const decompressed = await module.decompressData(compressed)
      
      expect(decompressed).toEqual(largeData)
    })
  })

  describe('setRankingToKV', () => {
    it('Worker環境でKVに正しく書き込む', async () => {
      const mockKV = {
        put: vi.fn()
      }
      ;(global as any).RANKING_KV = mockKV

      const module = await import('@/lib/cloudflare-kv')
      await module.setRankingToKV(mockRankingData)

      expect(mockKV.put).toHaveBeenCalledWith(
        'RANKING_LATEST',
        expect.any(Uint8Array),
        {
          metadata: {
            compressed: true,
            version: 1,
            updatedAt: '2024-01-01T00:00:00Z'
          }
        }
      )
    })

    it('KV namespaceが利用できない場合エラーをスロー', async () => {
      ;(global as any).RANKING_KV = undefined

      const module = await import('@/lib/cloudflare-kv')
      
      await expect(module.setRankingToKV(mockRankingData)).rejects.toThrow(
        'Cloudflare KV namespace not available'
      )
    })

    it('メタデータがない場合、デフォルト値を使用', async () => {
      const mockKV = {
        put: vi.fn()
      }
      ;(global as any).RANKING_KV = mockKV

      const dataWithoutMetadata = {
        genres: mockRankingData.genres
      }

      const module = await import('@/lib/cloudflare-kv')
      await module.setRankingToKV(dataWithoutMetadata)

      expect(mockKV.put).toHaveBeenCalledWith(
        'RANKING_LATEST',
        expect.any(Uint8Array),
        {
          metadata: {
            compressed: true,
            version: 1,
            updatedAt: expect.stringMatching(/^\d{4}-\d{2}-\d{2}T/)
          }
        }
      )
    })
  })

  describe('getRankingFromKV', () => {
    it('Worker環境でKVから正しく読み込む', async () => {
      const compressedData = new TextEncoder().encode(JSON.stringify(mockRankingData))
      
      const mockKV = {
        getWithMetadata: vi.fn().mockResolvedValue({
          value: compressedData,
          metadata: {
            compressed: true,
            version: 1
          }
        })
      }
      ;(global as any).RANKING_KV = mockKV

      const module = await import('@/lib/cloudflare-kv')
      const result = await module.getRankingFromKV()

      expect(mockKV.getWithMetadata).toHaveBeenCalledWith(
        'RANKING_LATEST',
        { type: 'arrayBuffer' }
      )
      expect(result).toEqual(mockRankingData)
    })

    it('データが存在しない場合nullを返す', async () => {
      const mockKV = {
        getWithMetadata: vi.fn().mockResolvedValue({
          value: null,
          metadata: null
        })
      }
      ;(global as any).RANKING_KV = mockKV

      const module = await import('@/lib/cloudflare-kv')
      const result = await module.getRankingFromKV()

      expect(result).toBeNull()
    })

    it('REST API経由でデータを取得（Worker環境外）', async () => {
      ;(global as any).RANKING_KV = undefined

      const compressedData = new TextEncoder().encode(JSON.stringify(mockRankingData))
      
      mockFetch.mockResolvedValue({
        ok: true,
        headers: new Headers({
          'cf-kv-metadata': JSON.stringify({
            compressed: true,
            version: 1
          })
        }),
        arrayBuffer: async () => compressedData.buffer
      })

      const module = await import('@/lib/cloudflare-kv')
      const result = await module.getRankingFromKV()

      expect(mockFetch).toHaveBeenCalledWith(
        'https://api.cloudflare.com/client/v4/accounts/test-account/storage/kv/namespaces/test-namespace/values/RANKING_LATEST',
        {
          headers: {
            'Authorization': 'Bearer test-token'
          }
        }
      )
      expect(result).toEqual(mockRankingData)
    })

    it('REST APIで認証情報がない場合nullを返す', async () => {
      ;(global as any).RANKING_KV = undefined
      delete process.env.CLOUDFLARE_KV_API_TOKEN

      const module = await import('@/lib/cloudflare-kv')
      const result = await module.getRankingFromKV()

      expect(result).toBeNull()
    })

    it('REST APIでエラーが発生した場合nullを返す', async () => {
      ;(global as any).RANKING_KV = undefined

      mockFetch.mockResolvedValue({
        ok: false,
        status: 404
      })

      const module = await import('@/lib/cloudflare-kv')
      const result = await module.getRankingFromKV()

      expect(result).toBeNull()
    })

    it('圧縮されていないデータも処理できる', async () => {
      const mockKV = {
        getWithMetadata: vi.fn().mockResolvedValue({
          value: JSON.stringify(mockRankingData),
          metadata: {
            compressed: false
          }
        })
      }
      ;(global as any).RANKING_KV = mockKV

      const module = await import('@/lib/cloudflare-kv')
      const result = await module.getRankingFromKV()

      expect(result).toEqual(mockRankingData)
    })
  })

  describe('getGenreRanking', () => {
    it('特定ジャンルのランキングデータを取得', async () => {
      const mockKV = {
        getWithMetadata: vi.fn().mockResolvedValue({
          value: new TextEncoder().encode(JSON.stringify(mockRankingData)),
          metadata: { compressed: true }
        })
      }
      ;(global as any).RANKING_KV = mockKV

      const module = await import('@/lib/cloudflare-kv')
      const result = await module.getGenreRanking('all', '24h')

      expect(result).toEqual({
        items: mockRankingData.genres.all['24h'].items,
        popularTags: mockRankingData.genres.all['24h'].popularTags
      })
    })

    it('存在しないジャンルの場合nullを返す', async () => {
      const mockKV = {
        getWithMetadata: vi.fn().mockResolvedValue({
          value: new TextEncoder().encode(JSON.stringify(mockRankingData)),
          metadata: { compressed: true }
        })
      }
      ;(global as any).RANKING_KV = mockKV

      const module = await import('@/lib/cloudflare-kv')
      const result = await module.getGenreRanking('nonexistent', '24h')

      expect(result).toBeNull()
    })

    it('タグ指定時のデータも取得できる', async () => {
      const dataWithTags = {
        ...mockRankingData,
        genres: {
          all: {
            '24h': {
              ...mockRankingData.genres.all['24h'],
              tags: {
                'tag1': [
                  { rank: 1, id: 'sm789', title: 'Tagged Video', thumbURL: 'url3', views: 2000 }
                ]
              }
            },
            hour: mockRankingData.genres.all.hour
          }
        }
      }

      const mockKV = {
        getWithMetadata: vi.fn().mockResolvedValue({
          value: new TextEncoder().encode(JSON.stringify(dataWithTags)),
          metadata: { compressed: true }
        })
      }
      ;(global as any).RANKING_KV = mockKV

      const module = await import('@/lib/cloudflare-kv')
      const result = await module.getGenreRanking('all', '24h', 'tag1')

      expect(result).toEqual({
        items: dataWithTags.genres.all['24h'].tags!['tag1'],
        popularTags: dataWithTags.genres.all['24h'].popularTags
      })
    })

    it('エラー時はエラーをスローせずnullを返す', async () => {
      const mockKV = {
        getWithMetadata: vi.fn().mockRejectedValue(new Error('KV Error'))
      }
      ;(global as any).RANKING_KV = mockKV

      const module = await import('@/lib/cloudflare-kv')
      const result = await module.getGenreRanking('all', '24h')

      expect(result).toBeNull()
    })
  })

  describe('エッジケース', () => {
    it('空のランキングデータも正しく処理', async () => {
      const emptyData: KVRankingData = {
        genres: {},
        metadata: {
          version: 1,
          updatedAt: '2024-01-01T00:00:00Z',
          totalItems: 0
        }
      }

      const mockKV = {
        put: vi.fn(),
        getWithMetadata: vi.fn().mockResolvedValue({
          value: new TextEncoder().encode(JSON.stringify(emptyData)),
          metadata: { compressed: true }
        })
      }
      ;(global as any).RANKING_KV = mockKV

      const module = await import('@/lib/cloudflare-kv')
      
      // 書き込み
      await module.setRankingToKV(emptyData)
      expect(mockKV.put).toHaveBeenCalled()

      // 読み込み
      const result = await module.getRankingFromKV()
      expect(result).toEqual(emptyData)
    })

    it('メタデータの型変換を正しく処理', async () => {
      const compressedData = new TextEncoder().encode(JSON.stringify(mockRankingData))
      
      // REST API経由でメタデータが文字列として返される場合
      mockFetch.mockResolvedValue({
        ok: true,
        headers: new Headers({
          'cf-kv-metadata': '{"compressed":true,"version":1}'
        }),
        arrayBuffer: async () => compressedData.buffer
      })

      const module = await import('@/lib/cloudflare-kv')
      const result = await module.getRankingFromKV()

      expect(result).toEqual(mockRankingData)
    })
  })
})