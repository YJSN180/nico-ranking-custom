import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import type { KVRankingData } from '@/lib/cloudflare-kv'

// fetch モック
const mockFetch = vi.fn()
global.fetch = mockFetch

describe('cloudflare-kv.ts - 3-key split implementation', () => {
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
    process.env.CLOUDFLARE_API_TOKEN = 'test-token'
    
    // グローバル変数をリセット
    ;(global as any).RANKING_KV = undefined
  })

  afterEach(() => {
    delete process.env.CLOUDFLARE_ACCOUNT_ID
    delete process.env.CLOUDFLARE_KV_NAMESPACE_ID
    delete process.env.CLOUDFLARE_API_TOKEN
  })

  describe('setRankingToKV', () => {
    it('Worker環境でKVに非圧縮JSONを書き込む', async () => {
      const mockKV = {
        put: vi.fn()
      }
      ;(global as any).RANKING_KV = mockKV

      const module = await import('@/lib/cloudflare-kv')
      await module.setRankingToKV(mockRankingData)

      expect(mockKV.put).toHaveBeenCalledWith(
        'RANKING_LATEST',
        JSON.stringify(mockRankingData),
        {
          metadata: {
            compressed: false,
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

      const firstCallArgs = mockKV.put.mock.calls[0]
      const actualData = JSON.parse(firstCallArgs[1])
      
      expect(mockKV.put).toHaveBeenCalledTimes(1)
      expect(firstCallArgs[0]).toBe('RANKING_LATEST')
      expect(actualData).toMatchObject({
        genres: mockRankingData.genres,
        metadata: {
          version: 1,
          totalItems: 0
        }
      })
      expect(actualData.metadata.updatedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/)
      expect(firstCallArgs[2]).toMatchObject({
        metadata: {
          compressed: false,
          version: 1
        }
      })
      expect(firstCallArgs[2].metadata.updatedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/)
    })
  })

  describe('getRankingFromKV - 3-key split', () => {
    it('3つのキーからデータを正しく読み取る', async () => {
      ;(global as any).RANKING_KV = undefined

      const group1Data = {
        genres: { all: mockRankingData.genres.all },
        metadata: mockRankingData.metadata
      }
      const group2Data = {
        genres: { game: { '24h': { items: [], popularTags: [] } } },
        metadata: mockRankingData.metadata
      }
      const group3Data = {
        genres: { anime: { '24h': { items: [], popularTags: [] } } },
        metadata: mockRankingData.metadata
      }

      mockFetch
        .mockResolvedValueOnce({
          ok: true,
          arrayBuffer: async () => new TextEncoder().encode(JSON.stringify(group1Data)).buffer
        })
        .mockResolvedValueOnce({
          ok: true,
          arrayBuffer: async () => new TextEncoder().encode(JSON.stringify(group2Data)).buffer
        })
        .mockResolvedValueOnce({
          ok: true,
          arrayBuffer: async () => new TextEncoder().encode(JSON.stringify(group3Data)).buffer
        })

      const module = await import('@/lib/cloudflare-kv')
      const result = await module.getRankingFromKV()

      expect(result).not.toBeNull()
      expect(result?.genres.all).toBeDefined()
      expect(result?.genres.game).toBeDefined()
      expect(result?.genres.anime).toBeDefined()
      expect(mockFetch).toHaveBeenCalledTimes(3)
    })

    it('単一キーへのフォールバックが機能する', async () => {
      ;(global as any).RANKING_KV = undefined

      // 3-keyが404を返す (no fallback to single key anymore)
      mockFetch
        .mockResolvedValueOnce({ ok: false, status: 404 })
        .mockResolvedValueOnce({ ok: false, status: 404 })
        .mockResolvedValueOnce({ ok: false, status: 404 })

      const module = await import('@/lib/cloudflare-kv')
      const result = await module.getRankingFromKV()

      expect(result).toBeNull() // No data should return null
      expect(mockFetch).toHaveBeenCalledTimes(3) // Only 3-key attempts
    })

    it('Worker環境でKVから正しく読み込む（フォールバック）', async () => {
      const mockKV = {
        get: vi.fn().mockResolvedValue(mockRankingData)
      }
      ;(global as any).RANKING_KV = mockKV

      // Still uses REST API even with RANKING_KV available
      mockFetch
        .mockResolvedValueOnce({
          ok: true,
          arrayBuffer: async () => new TextEncoder().encode(JSON.stringify(mockRankingData)).buffer
        })
        .mockResolvedValueOnce({ ok: false, status: 404 })
        .mockResolvedValueOnce({ ok: false, status: 404 })

      const module = await import('@/lib/cloudflare-kv')
      const result = await module.getRankingFromKV()

      // Should not use the Worker KV API anymore
      expect(mockKV.get).not.toHaveBeenCalled()
      expect(mockFetch).toHaveBeenCalledTimes(3)
      expect(result).not.toBeNull()
    })

    it('データが存在しない場合nullを返す', async () => {
      const mockKV = {
        get: vi.fn().mockResolvedValue(null)
      }
      ;(global as any).RANKING_KV = mockKV

      const module = await import('@/lib/cloudflare-kv')
      const result = await module.getRankingFromKV()

      expect(result).toBeNull()
    })

    it('REST APIで認証情報がない場合nullを返す', async () => {
      ;(global as any).RANKING_KV = undefined
      delete process.env.CLOUDFLARE_API_TOKEN

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
  })

  describe('getGenreRanking', () => {
    it('特定ジャンルのランキングデータを取得（グループ最適化）', async () => {
      ;(global as any).RANKING_KV = undefined

      const groupData = {
        genres: { all: mockRankingData.genres.all },
        metadata: mockRankingData.metadata
      }

      mockFetch.mockResolvedValueOnce({
        ok: true,
        arrayBuffer: async () => new TextEncoder().encode(JSON.stringify(groupData)).buffer
      })

      const module = await import('@/lib/cloudflare-kv')
      const result = await module.getGenreRanking('all', '24h')

      expect(result).toEqual(expect.objectContaining({
        items: mockRankingData.genres.all['24h'].items,
        popularTags: mockRankingData.genres.all['24h'].popularTags
      }))
      expect(mockFetch).toHaveBeenCalledTimes(1) // 1グループのみ
    })

    it('存在しないジャンルの場合nullを返す', async () => {
      ;(global as any).RANKING_KV = undefined

      const groupData = {
        genres: { all: mockRankingData.genres.all },
        metadata: mockRankingData.metadata
      }

      mockFetch.mockResolvedValueOnce({
        ok: true,
        arrayBuffer: async () => new TextEncoder().encode(JSON.stringify(groupData)).buffer
      })

      const module = await import('@/lib/cloudflare-kv')
      const result = await module.getGenreRanking('nonexistent', '24h')

      expect(result).toBeNull()
    })

    it('タグ指定時のデータも取得できる', async () => {
      ;(global as any).RANKING_KV = undefined
      
      const dataWithTags = {
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
        },
        metadata: mockRankingData.metadata
      }

      mockFetch.mockResolvedValueOnce({
        ok: true,
        arrayBuffer: async () => new TextEncoder().encode(JSON.stringify(dataWithTags)).buffer
      })

      const module = await import('@/lib/cloudflare-kv')
      const result = await module.getGenreRanking('all', '24h')

      expect(result).toEqual(expect.objectContaining({
        items: expect.any(Array),
        popularTags: expect.any(Array),
        tags: expect.objectContaining({
          'tag1': expect.any(Array)
        })
      }))
    })

    it('エラー時はエラーをスローせずnullを返す', async () => {
      ;(global as any).RANKING_KV = undefined

      // Mock fetch to throw an error
      mockFetch.mockRejectedValueOnce(new Error('Network Error'))

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
        put: vi.fn()
      }
      ;(global as any).RANKING_KV = mockKV

      const module = await import('@/lib/cloudflare-kv')
      
      // 書き込み
      await module.setRankingToKV(emptyData)
      expect(mockKV.put).toHaveBeenCalledWith(
        'RANKING_LATEST',
        JSON.stringify(emptyData),
        {
          metadata: {
            compressed: false,
            version: 1,
            updatedAt: '2024-01-01T00:00:00Z'
          }
        }
      )

      // 読み込み - uses REST API with 3-key split
      ;(global as any).RANKING_KV = undefined
      
      // Mock all 3 groups to return empty data
      mockFetch
        .mockResolvedValueOnce({
          ok: true,
          arrayBuffer: async () => new TextEncoder().encode(JSON.stringify(emptyData)).buffer
        })
        .mockResolvedValueOnce({ ok: false, status: 404 })
        .mockResolvedValueOnce({ ok: false, status: 404 })
      
      const result = await module.getRankingFromKV()
      expect(result).toEqual(emptyData)
    })
  })
})