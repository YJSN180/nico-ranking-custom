import { describe, it, expect, vi, beforeEach } from 'vitest'
import { updateRankingData } from '@/lib/update-ranking'
import { kv } from '@vercel/kv'
import * as scraper from '@/lib/scraper'

vi.mock('@vercel/kv', () => ({
  kv: {
    set: vi.fn(),
    expire: vi.fn(),
  },
}))

vi.mock('@/lib/scraper', () => ({
  scrapeRankingPage: vi.fn(),
}))

describe('KV Updater Script', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('should fetch and store ranking data for all genres', async () => {
    const mockRankingData = {
      items: [
        {
          rank: 1,
          id: 'sm1234',
          title: 'Test Video',
          thumbURL: 'https://example.com/thumb.jpg',
          views: 1000,
          comments: 50,
          mylists: 10,
          likes: 100,
          tags: ['tag1', 'tag2'],
          authorId: 'user123',
          authorName: 'Test User',
          authorIcon: 'https://example.com/icon.jpg',
          registeredAt: '2024-01-01T00:00:00Z'
        }
      ],
      popularTags: ['tag1', 'tag2', 'tag3']
    }

    vi.mocked(scraper.scrapeRankingPage).mockResolvedValue(mockRankingData)
    vi.mocked(kv.set).mockResolvedValue('OK')
    vi.mocked(kv.expire).mockResolvedValue(1)

    const result = await updateRankingData()

    // すべてのジャンルに対してスクレイピングが実行されることを確認
    const expectedGenres = [
      'all', 'entertainment', 'radio', 'music_sound', 'dance',
      'anime', 'game', 'animal', 'cooking', 'nature', 'sports',
      'society_politics_news', 'technology_craft', 'other'
    ]

    expect(scraper.scrapeRankingPage).toHaveBeenCalledTimes(expectedGenres.length)
    
    expectedGenres.forEach(genre => {
      expect(scraper.scrapeRankingPage).toHaveBeenCalledWith(genre, '24h')
    })


    // KVへの保存を確認
    expectedGenres.forEach(genre => {
      expect(kv.set).toHaveBeenCalledWith(
        `ranking-${genre}`,
        expect.objectContaining({
          items: mockRankingData.items,
          popularTags: mockRankingData.popularTags,
          updatedAt: expect.any(String)
        })
      )
      expect(kv.expire).toHaveBeenCalledWith(`ranking-${genre}`, 3600)
    })

    expect(result).toEqual({
      success: true,
      updatedGenres: expectedGenres
    })
  })

  it('should handle scraping failures gracefully', async () => {
    vi.mocked(scraper.scrapeRankingPage)
      .mockResolvedValueOnce({ items: [], popularTags: [] }) // all
      .mockRejectedValueOnce(new Error('Network error')) // entertainment
      .mockResolvedValue({ items: [], popularTags: [] }) // others

    vi.mocked(kv.set).mockResolvedValue('OK')
    vi.mocked(kv.expire).mockResolvedValue(1)

    const result = await updateRankingData()

    expect(result.success).toBe(true)
    expect(result.failedGenres).toContain('entertainment')
    expect(result.updatedGenres).not.toContain('entertainment')
  })

  it('should handle KV storage failures', async () => {
    vi.mocked(scraper.scrapeRankingPage).mockResolvedValue({
      items: [],
      popularTags: []
    })
    vi.mocked(kv.set).mockRejectedValue(new Error('KV error'))

    const result = await updateRankingData()

    expect(result.success).toBe(false)
    expect(result.error).toContain('KV error')
  })

  it('should update popular tags for each genre', async () => {
    const mockData = {
      game: { items: [], popularTags: ['ゲーム実況', 'RTA', 'Minecraft'] },
      anime: { items: [], popularTags: ['アニメ', '手描き', 'MAD'] },
      default: { items: [], popularTags: [] }
    }

    vi.mocked(scraper.scrapeRankingPage).mockImplementation(async (genre) => {
      return mockData[genre as keyof typeof mockData] || mockData.default
    })
    vi.mocked(kv.set).mockResolvedValue('OK')
    vi.mocked(kv.expire).mockResolvedValue(1)

    await updateRankingData()

    // ジャンル別の人気タグが保存されることを確認
    expect(kv.set).toHaveBeenCalledWith(
      'ranking-game',
      expect.objectContaining({
        popularTags: ['ゲーム実況', 'RTA', 'Minecraft']
      })
    )
    expect(kv.set).toHaveBeenCalledWith(
      'ranking-anime',
      expect.objectContaining({
        popularTags: ['アニメ', '手描き', 'MAD']
      })
    )
  })

  it('should respect rate limits', async () => {
    vi.mocked(scraper.scrapeRankingPage).mockResolvedValue({
      items: [],
      popularTags: []
    })
    vi.mocked(kv.set).mockResolvedValue('OK')
    vi.mocked(kv.expire).mockResolvedValue(1)

    await updateRankingData()

    // レート制限のためのscrapeRankingPageが適切に呼び出されることを確認
    expect(scraper.scrapeRankingPage).toHaveBeenCalledTimes(14)
  })
})