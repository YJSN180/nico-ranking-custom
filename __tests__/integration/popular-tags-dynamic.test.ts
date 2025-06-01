import { describe, it, expect, vi, beforeEach } from 'vitest'
import { getPopularTags } from '../../lib/popular-tags'
import { fetchRanking } from '../../lib/complete-hybrid-scraper'
import type { RankingGenre } from '../../types/ranking-config'

// KVモックをセットアップ
vi.mock('@vercel/kv', () => ({
  kv: {
    get: vi.fn(),
    set: vi.fn()
  }
}))

// complete-hybrid-scraperをモック
vi.mock('../../lib/complete-hybrid-scraper', () => ({
  fetchRanking: vi.fn()
}))

describe('getPopularTags dynamic fetching', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('should fetch popular tags dynamically for new genres', async () => {
    const mockFetchRanking = vi.mocked(fetchRanking)
    
    // ラジオジャンルのモックデータ
    mockFetchRanking.mockResolvedValue({
      genre: 'oxzi6bje',
      label: 'ラジオ',
      items: [],
      popularTags: [
        'ラジオ',
        '声優',
        '男性声優',
        '文化放送',
        'ラジオドラマ',
        'ボイロラジオ',
        'アニメ'
      ]
    })

    const tags = await getPopularTags('radio')
    
    expect(tags).toEqual([
      'ラジオ',
      '声優',
      '男性声優',
      '文化放送',
      'ラジオドラマ',
      'ボイロラジオ',
      'アニメ'
    ])
    expect(mockFetchRanking).toHaveBeenCalledWith('oxzi6bje', null, '24h')
  })

  it('should return fallback tags when dynamic fetch fails', async () => {
    const mockFetchRanking = vi.mocked(fetchRanking)
    
    // fetchRankingがエラーを投げる
    mockFetchRanking.mockRejectedValue(new Error('Network error'))

    const tags = await getPopularTags('animal')
    
    // フォールバックタグが返される
    expect(tags).toContain('動物')
    expect(tags).toContain('AV(アニマルビデオ)')
    expect(tags).toContain('猫')
    expect(tags).toContain('犬')
  })

  it('should handle all 23 genres correctly', async () => {
    const genres: RankingGenre[] = [
      'all', 'game', 'anime', 'vocaloid', 'voicesynthesis', 'entertainment',
      'music', 'sing', 'dance', 'play', 'commentary', 'cooking',
      'travel', 'nature', 'vehicle', 'technology', 'society', 'mmd',
      'vtuber', 'radio', 'sports', 'animal', 'other'
    ]

    for (const genre of genres) {
      const mockFetchRanking = vi.mocked(fetchRanking)
      mockFetchRanking.mockResolvedValue({
        genre: genre,
        label: genre,
        items: [],
        popularTags: []
      })

      const tags = await getPopularTags(genre)
      
      // すべてのジャンルで少なくともフォールバックタグが返される
      expect(tags).toBeDefined()
      expect(Array.isArray(tags)).toBe(true)
      expect(tags.length).toBeGreaterThan(0)
    }
  })
})