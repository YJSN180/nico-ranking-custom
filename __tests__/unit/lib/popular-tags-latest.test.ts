// @vitest-environment node
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

// 小キー(POPULAR_TAGS_LATEST)経由の高速パスと、未生成時の従来経路（ランキングゲートウェイ）へのフォールバックを検証する
const kvGet = vi.fn()
const scrapeRankingPage = vi.fn()

vi.mock('@/lib/simple-kv', () => ({ kv: { get: (...args: unknown[]) => kvGet(...args) } }))
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

const gatewayFetch = vi.fn()
const gatewayCalls = () => gatewayFetch.mock.calls.map((call) => new URL(String(call[0])))

describe('getPopularTags (POPULAR_TAGS_LATEST fast path)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    invalidatePopularTagsLatestCache()
    vi.stubGlobal('fetch', gatewayFetch)
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('小キーがあればゲートウェイもスクレイパーも呼ばずに返す', async () => {
    kvGet.mockResolvedValue(latest)

    await expect(getPopularTags('game', '24h')).resolves.toEqual(['ゲーム実況', 'RTA'])
    await expect(getPopularTags('all', 'hour')).resolves.toEqual(['RTA'])

    expect(kvGet).toHaveBeenCalledWith(POPULAR_TAGS_LATEST_KEY)
    expect(gatewayFetch).not.toHaveBeenCalled()
    expect(scrapeRankingPage).not.toHaveBeenCalled()
  })

  it('小キーが未生成(null)なら従来経路(ランキングゲートウェイ)にフォールバックする', async () => {
    kvGet.mockResolvedValue(null)
    gatewayFetch.mockImplementation(async () => Response.json({ popularTags: ['フォールバック'] }))

    await expect(getPopularTags('game', '24h')).resolves.toEqual(['フォールバック'])
    const [url] = gatewayCalls()
    expect(url?.pathname).toBe('/api/ranking')
    expect(url?.searchParams.get('genre')).toBe('game')
    expect(url?.searchParams.get('period')).toBe('24h')
  })

  it('小キーに該当ジャンルが無い/空なら従来経路にフォールバックする', async () => {
    kvGet.mockResolvedValue(latest)
    gatewayFetch.mockImplementation(async () => Response.json({ popularTags: ['本体側'] }))

    // anime/hour は小キー上で空配列
    await expect(getPopularTags('anime', 'hour')).resolves.toEqual(['本体側'])
    expect(gatewayCalls()[0]?.searchParams.get('genre')).toBe('anime')
    expect(gatewayCalls()[0]?.searchParams.get('period')).toBe('hour')
  })

  it('小キーが不正な形なら無視して従来経路で応答する', async () => {
    kvGet.mockResolvedValue({ popularTags: ['壊れた形'] })
    gatewayFetch.mockImplementation(async () => Response.json({ popularTags: ['本体側'] }))

    await expect(getPopularTags('game', '24h')).resolves.toEqual(['本体側'])
  })

  it('小キーの読み取りが失敗しても従来経路で応答する', async () => {
    kvGet.mockRejectedValue(new Error('kv down'))
    gatewayFetch.mockImplementation(async () => Response.json({ popularTags: ['復旧'] }))

    await expect(getPopularTags('game', '24h')).resolves.toEqual(['復旧'])
  })
})
