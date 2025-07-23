import { describe, it, expect, vi, beforeEach } from 'vitest'
import { fetchFixedTagsFromWatchAPI, enrichRankingItemsWithFixedTags } from '@/lib/tag-fetcher'
import type { RankingItem } from '@/types/ranking'

// Mock fetch
global.fetch = vi.fn()

describe('tag-fetcher', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('fetchFixedTagsFromWatchAPI', () => {
    it('should fetch only fixed tags from Watch API', async () => {
      const mockResponse = {
        data: {
          tag: {
            items: [
              { name: 'ゲーム', isLocked: true, isNicodicArticleExists: true },
              { name: '実況プレイ動画', isLocked: true, isNicodicArticleExists: true },
              { name: 'ユーザータグ1', isLocked: false, isNicodicArticleExists: false },
              { name: 'ユーザータグ2', isLocked: false, isNicodicArticleExists: false },
            ]
          }
        }
      }

      ;(global.fetch as any).mockResolvedValueOnce({
        ok: true,
        json: async () => mockResponse
      })

      const tags = await fetchFixedTagsFromWatchAPI('sm12345678')

      expect(tags).toEqual(['ゲーム', '実況プレイ動画'])
      expect(global.fetch).toHaveBeenCalledWith(
        expect.stringMatching(/^https:\/\/www\.nicovideo\.jp\/api\/watch\/v3_guest\/sm12345678\?_frontendId=6&_frontendVersion=0&actionTrackId=/),
        expect.objectContaining({
          headers: expect.objectContaining({
            'X-Frontend-Id': '6',
            'X-Frontend-Version': '0'
          })
        })
      )
    })

    it('should return null when API returns error', async () => {
      ;(global.fetch as any).mockResolvedValueOnce({
        ok: false,
        status: 404
      })

      const tags = await fetchFixedTagsFromWatchAPI('sm12345678')

      expect(tags).toBeNull()
    })

    it('should return null when fetch throws error', async () => {
      ;(global.fetch as any).mockRejectedValueOnce(new Error('Network error'))

      const tags = await fetchFixedTagsFromWatchAPI('sm12345678')

      expect(tags).toBeNull()
    })

    it('should return empty array when no fixed tags exist', async () => {
      const mockResponse = {
        data: {
          tag: {
            items: [
              { name: 'ユーザータグ1', isLocked: false },
              { name: 'ユーザータグ2', isLocked: false },
            ]
          }
        }
      }

      ;(global.fetch as any).mockResolvedValueOnce({
        ok: true,
        json: async () => mockResponse
      })

      const tags = await fetchFixedTagsFromWatchAPI('sm12345678')

      expect(tags).toEqual([])
    })
  })

  describe('enrichRankingItemsWithFixedTags', () => {
    const mockItems: RankingItem[] = [
      {
        rank: 1,
        id: 'sm12345678',
        title: 'テスト動画1',
        thumbURL: 'https://example.com/thumb1.jpg',
        views: 1000,
        comments: 100,
        mylists: 50,
        likes: 200,
      },
      {
        rank: 2,
        id: 'sm87654321',
        title: 'テスト動画2',
        thumbURL: 'https://example.com/thumb2.jpg',
        views: 2000,
        comments: 200,
        mylists: 100,
        likes: 400,
      }
    ]

    it('should enrich items with fixed tags', async () => {
      // Mock successful API responses
      ;(global.fetch as any)
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({
            data: {
              tag: {
                items: [
                  { name: 'ゲーム', isLocked: true },
                  { name: '実況プレイ動画', isLocked: true },
                  { name: 'ユーザータグ', isLocked: false },
                ]
              }
            }
          })
        })
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({
            data: {
              tag: {
                items: [
                  { name: '音楽', isLocked: true },
                  { name: 'VOCALOID', isLocked: true },
                ]
              }
            }
          })
        })

      const enrichedItems = await enrichRankingItemsWithFixedTags(mockItems)

      expect(enrichedItems[0].tags).toEqual(['ゲーム', '実況プレイ動画'])
      expect(enrichedItems[1].tags).toEqual(['音楽', 'VOCALOID'])
    })

    it('should handle API failures gracefully', async () => {
      // First request succeeds, second fails
      ;(global.fetch as any)
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({
            data: {
              tag: {
                items: [
                  { name: 'ゲーム', isLocked: true },
                ]
              }
            }
          })
        })
        .mockResolvedValueOnce({
          ok: false,
          status: 500
        })

      const enrichedItems = await enrichRankingItemsWithFixedTags(mockItems)

      expect(enrichedItems[0].tags).toEqual(['ゲーム'])
      expect(enrichedItems[1].tags).toEqual([]) // Failed request should result in empty array
    })

    it('should skip items that already have tags', async () => {
      const itemsWithTags: RankingItem[] = [
        {
          ...mockItems[0],
          tags: ['既存タグ1', '既存タグ2']
        },
        mockItems[1]
      ]

      ;(global.fetch as any).mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          data: {
            tag: {
              items: [
                { name: '音楽', isLocked: true },
              ]
            }
          }
        })
      })

      const enrichedItems = await enrichRankingItemsWithFixedTags(itemsWithTags)

      expect(enrichedItems[0].tags).toEqual(['既存タグ1', '既存タグ2']) // Unchanged
      expect(enrichedItems[1].tags).toEqual(['音楽'])
      expect(global.fetch).toHaveBeenCalledTimes(1) // Only called for the second item
    })

    it('should respect rate limiting with delays', async () => {
      const startTime = Date.now()

      ;(global.fetch as any)
        .mockResolvedValue({
          ok: true,
          json: async () => ({
            data: {
              tag: {
                items: []
              }
            }
          })
        })

      await enrichRankingItemsWithFixedTags(mockItems)

      const elapsed = Date.now() - startTime
      // Should have at least 300ms delay between requests
      expect(elapsed).toBeGreaterThanOrEqual(300)
    })
  })
})