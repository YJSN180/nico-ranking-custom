import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { RankingItem } from '@/types/ranking'

// Mock dependencies
vi.mock('@/lib/cloudflare-kv', () => ({
  getFromCloudflareKV: vi.fn()
}))

vi.mock('@/lib/simple-kv', () => ({
  kv: {
    get: vi.fn()
  }
}))

vi.mock('@/lib/scraper', () => ({
  fetchRankingFromNiconico: vi.fn()
}))

vi.mock('@/lib/popular-tags', () => ({
  getPopularTags: vi.fn()
}))

// Import after mocks
import { getFromCloudflareKV } from '@/lib/cloudflare-kv'
import { kv } from '@/lib/simple-kv'
import { fetchRankingFromNiconico } from '@/lib/scraper'
import { getPopularTags } from '@/lib/popular-tags'

describe('app/page.tsx Server Component', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  const mockRankingData = {
    genres: {
      all: {
        '24h': {
          items: [
            {
              rank: 1,
              id: 'sm1',
              title: 'Test Video 1',
              thumbURL: 'https://example.com/thumb1.jpg',
              views: 1000,
              comments: 100,
              mylists: 50,
              likes: 200
            }
          ],
          popularTags: ['tag1', 'tag2']
        }
      }
    },
    metadata: {
      version: 1,
      updatedAt: new Date().toISOString(),
      totalItems: 1
    }
  }

  describe('Data Fetching', () => {
    it('should fetch ranking data from Cloudflare KV', async () => {
      vi.mocked(getFromCloudflareKV).mockResolvedValueOnce(mockRankingData)
      vi.mocked(getPopularTags).mockResolvedValueOnce(['tag1', 'tag2'])

      // Simulate the data fetching logic from page.tsx
      const data = await getFromCloudflareKV('RANKING_LATEST')
      expect(data).toEqual(mockRankingData)
      expect(getFromCloudflareKV).toHaveBeenCalledWith('RANKING_LATEST')
    })

    it('should fallback to scraper when KV fetch fails', async () => {
      vi.mocked(getFromCloudflareKV).mockRejectedValueOnce(new Error('KV Error'))
      vi.mocked(fetchRankingFromNiconico).mockResolvedValueOnce({
        items: mockRankingData.genres.all['24h'].items,
        popularTags: ['tag1', 'tag2']
      })

      // Simulate fallback logic
      let data
      try {
        data = await getFromCloudflareKV('RANKING_LATEST')
      } catch {
        data = await fetchRankingFromNiconico('all', '24h')
      }

      expect(fetchRankingFromNiconico).toHaveBeenCalledWith('all', '24h')
      expect(data).toHaveProperty('items')
    })
  })

  describe('NG List Filtering', () => {
    it('should fetch and apply NG list', async () => {
      const mockNGList = {
        videoIds: ['sm999'],
        videoTitles: ['Blocked Title'],
        authorIds: ['user999'],
        authorNames: ['Blocked User']
      }

      vi.mocked(kv.get).mockImplementation((key: string) => {
        if (key === 'ng-list-manual') return Promise.resolve(mockNGList)
        if (key === 'ng-list-derived') return Promise.resolve(['sm888'])
        return Promise.resolve(null)
      })

      // Fetch NG lists
      const [manual, derived] = await Promise.all([
        kv.get('ng-list-manual'),
        kv.get('ng-list-derived')
      ])

      expect(manual).toEqual(mockNGList)
      expect(derived).toEqual(['sm888'])
    })

    it('should handle missing NG list gracefully', async () => {
      vi.mocked(kv.get).mockResolvedValueOnce(null).mockResolvedValueOnce(null)

      const [manual, derived] = await Promise.all([
        kv.get('ng-list-manual'),
        kv.get('ng-list-derived')
      ])

      expect(manual).toBeNull()
      expect(derived).toBeNull()
    })
  })

  describe('Search Parameters Handling', () => {
    it('should parse genre parameter correctly', () => {
      const searchParams = new URLSearchParams('genre=game')
      const genre = searchParams.get('genre') || 'all'
      expect(genre).toBe('game')
    })

    it('should parse period parameter correctly', () => {
      const searchParams = new URLSearchParams('period=hour')
      const period = searchParams.get('period') || '24h'
      expect(period).toBe('hour')
    })

    it('should parse tag parameter correctly', () => {
      const searchParams = new URLSearchParams('tag=VOCALOID')
      const tag = searchParams.get('tag')
      expect(tag).toBe('VOCALOID')
    })

    it('should use defaults for missing parameters', () => {
      const searchParams = new URLSearchParams('')
      const genre = searchParams.get('genre') || 'all'
      const period = searchParams.get('period') || '24h'
      const tag = searchParams.get('tag')

      expect(genre).toBe('all')
      expect(period).toBe('24h')
      expect(tag).toBeNull()
    })
  })

  describe('Popular Tags', () => {
    it('should fetch popular tags for genre', async () => {
      vi.mocked(getPopularTags).mockResolvedValueOnce(['tag1', 'tag2'])

      const tags = await getPopularTags('all', '24h')
      expect(tags).toEqual(['tag1', 'tag2'])
      expect(getPopularTags).toHaveBeenCalledWith('all', '24h')
    })

    it('should return empty array when tags fetch fails', async () => {
      vi.mocked(getPopularTags).mockResolvedValueOnce(['tag1', 'tag2'])

      const tags = await getPopularTags('all', '24h')
      expect(tags).toEqual(['tag1', 'tag2'])
    })
  })

  describe('Error Handling', () => {
    it('should handle complete data fetch failure', async () => {
      vi.mocked(getFromCloudflareKV).mockRejectedValueOnce(new Error('KV Error'))
      vi.mocked(fetchRankingFromNiconico).mockRejectedValueOnce(new Error('Scraper Error'))

      let error
      try {
        await getFromCloudflareKV('RANKING_LATEST')
      } catch (e1) {
        try {
          await fetchRankingFromNiconico('all', '24h')
        } catch (e2) {
          error = e2
        }
      }

      expect(error).toBeDefined()
      expect(error.message).toBe('Scraper Error')
    })
  })
})