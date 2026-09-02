import { describe, it, expect, vi, beforeEach } from 'vitest'

// 小キー(POPULAR_TAGS_LATEST)経由の高速パスと、未生成時の従来経路フォールバックを検証する
const kvGet = vi.fn()
const getGenreRanking = vi.fn()
const scrapeRankingPage = vi.fn()

vi.mock('@/lib/simple-kv', () => ({ kv: { get: (...args: unknown[]) => kvGet(...args) } }))
vi.mock('@/lib/cloudflare-kv', () => ({ getGenreRanking: (...args: unknown[]) => getGenreRanking(...args) }))
vi.mock('@/lib/scraper', () => ({ scrapeRankingPage: (...args: unknown[]) => scrapeRankingPage(...args) }))

import { getPopularTags, invalidatePopularTagsLatestCache, POPULAR_TAGS_LATEST_KEY } from '@/lib/popular-tags'

const latest = {
  updatedAt: '2026-09-02T00:00:00.000Z',
  genres: {
    game: { '24h': ['ゲーム実況', 'RTA'], hour: ['RTA'] },
    anime: { '24h': ['アニメ'], hour: [] },
  },
  all: { '24h': ['ゲーム実況', 'アニメ'], hour: ['RTA'] },
}

describe('getPopularTags (POPULAR_TAGS_LATEST fast path)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    invalidatePopularTagsLatestCache()
  })

  it('小キーがあればランキング本体を読まずに返す', async () => {
    kvGet.mockResolvedValue(latest)

    await expect(getPopularTags('game', '24h')).resolves.toEqual(['ゲーム実況', 'RTA'])
    await expect(getPopularTags('all', 'hour')).resolves.toEqual(['RTA'])

    expect(kvGet).toHaveBeenCalledWith(POPULAR_TAGS_LATEST_KEY)
    expect(getGenreRanking).not.toHaveBeenCalled()
    expect(scrapeRankingPage).not.toHaveBeenCalled()
  })

  it('小キーが未生成(null)なら従来経路(ランキング本体)にフォールバックする', async () => {
    kvGet.mockResolvedValue(null)
    getGenreRanking.mockResolvedValue({ items: [], popularTags: ['フォールバック'] })

    await expect(getPopularTags('game', '24h')).resolves.toEqual(['フォールバック'])
    expect(getGenreRanking).toHaveBeenCalledWith('game', '24h')
  })

  it('小キーに該当ジャンルが無い/空なら従来経路にフォールバックする', async () => {
    kvGet.mockResolvedValue(latest)
    getGenreRanking.mockResolvedValue({ items: [], popularTags: ['本体側'] })

    // anime/hour は小キー上で空配列
    await expect(getPopularTags('anime', 'hour')).resolves.toEqual(['本体側'])
    expect(getGenreRanking).toHaveBeenCalledWith('anime', 'hour')
  })

  it('小キーの読み取りが失敗しても従来経路で応答する', async () => {
    kvGet.mockRejectedValue(new Error('kv down'))
    getGenreRanking.mockResolvedValue({ items: [], popularTags: ['復旧'] })

    await expect(getPopularTags('game', '24h')).resolves.toEqual(['復旧'])
  })
})
