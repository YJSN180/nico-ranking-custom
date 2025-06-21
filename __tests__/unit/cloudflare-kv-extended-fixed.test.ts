import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

// Fetch APIをモック
const fetchMock = vi.fn()
global.fetch = fetchMock as any

describe('Cloudflare KV Integration (Fixed for 3-key split)', () => {
  const mockRankingData = {
    genres: {
      all: {
        '24h': { items: [{ id: '1', title: 'Test Video' }], popularTags: ['tag1'] },
        hour: { items: [], popularTags: [] }
      }
    },
    metadata: {
      version: 1,
      updatedAt: '2024-01-01T00:00:00Z',
      totalItems: 1
    }
  }

  beforeEach(() => {
    vi.resetModules()
    vi.clearAllMocks()
    
    // 環境変数を設定
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

  describe('getRankingFromKV (3-key split)', () => {
    it('3つのキーからデータを正しく読み取れる', async () => {
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

      fetchMock
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
      expect(fetchMock).toHaveBeenCalledTimes(3)
    })

    it('単一キーへのフォールバックが機能する', async () => {
      // 3-keyが404を返す (no fallback to single key anymore)
      fetchMock
        .mockResolvedValueOnce({ ok: false, status: 404 })
        .mockResolvedValueOnce({ ok: false, status: 404 })
        .mockResolvedValueOnce({ ok: false, status: 404 })

      const module = await import('@/lib/cloudflare-kv')
      const result = await module.getRankingFromKV()

      expect(result).toBeNull() // No data should return null
      expect(fetchMock).toHaveBeenCalledTimes(3) // Only 3-key attempts
    })
  })

  describe('getGenreRanking (最適化された読み取り)', () => {
    it('単一ジャンルの場合、該当グループのみ読み取る', async () => {
      const groupData = {
        genres: { all: mockRankingData.genres.all },
        metadata: mockRankingData.metadata
      }

      fetchMock.mockResolvedValueOnce({
        ok: true,
        arrayBuffer: async () => new TextEncoder().encode(JSON.stringify(groupData)).buffer
      })

      const module = await import('@/lib/cloudflare-kv')
      const result = await module.getGenreRanking('all', '24h')

      expect(result).not.toBeNull()
      expect(result?.items).toEqual(mockRankingData.genres.all['24h'].items)
      expect(fetchMock).toHaveBeenCalledTimes(1) // 1グループのみ
    })
  })

  describe('setRankingToKV (非推奨)', () => {
    it('Worker環境で非圧縮JSONを書き込む', async () => {
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
  })
})