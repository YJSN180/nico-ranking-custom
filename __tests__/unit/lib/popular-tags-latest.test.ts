// @vitest-environment node
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

// 小キー(POPULAR_TAGS_LATEST)経由の高速パスと、未生成時の従来経路（ランキングゲートウェイ）へのフォールバックを検証する
const kvGet = vi.fn()
const scrapeRankingPage = vi.fn()

vi.mock('@/lib/simple-kv', () => ({ kv: { get: (...args: unknown[]) => kvGet(...args) } }))
vi.mock('@/lib/scraper', () => ({ scrapeRankingPage: (...args: unknown[]) => scrapeRankingPage(...args) }))

import { getPopularTags, invalidatePopularTagsLatestCache, POPULAR_TAGS_LATEST_KEY } from '@/lib/popular-tags'

// テストの「現在」。小キーの updatedAt（公開した世代の収集開始時刻）はこれとの差で鮮度を見る
const NOW = Date.parse('2026-09-02T01:00:00.000Z')
const minutesBeforeNow = (minutes: number) => new Date(NOW - minutes * 60_000).toISOString()

const latest = {
  updatedAt: minutesBeforeNow(60),
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
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(NOW)
  })

  afterEach(() => {
    vi.useRealTimers()
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

describe('getPopularTags (POPULAR_TAGS_LATEST の鮮度)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    invalidatePopularTagsLatestCache()
    vi.stubGlobal('fetch', gatewayFetch)
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(NOW)
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.unstubAllGlobals()
  })

  it('補助同期が止まって 150 分より古くなった小キーは使わず、公開中の世代（ゲートウェイ）のタグで応答する', async () => {
    kvGet.mockResolvedValue({ ...latest, updatedAt: minutesBeforeNow(151) })
    gatewayFetch.mockImplementation(async () => Response.json({ popularTags: ['公開中の世代'] }))

    await expect(getPopularTags('game', '24h')).resolves.toEqual(['公開中の世代'])
    expect(gatewayCalls()[0]?.searchParams.get('genre')).toBe('game')
  })

  it('150 分以内の小キーはそのまま使う', async () => {
    kvGet.mockResolvedValue({ ...latest, updatedAt: minutesBeforeNow(149) })

    await expect(getPopularTags('game', '24h')).resolves.toEqual(['ゲーム実況', 'RTA'])
    expect(gatewayFetch).not.toHaveBeenCalled()
  })

  it.each([
    ['欠けている', undefined],
    ['日時として読めない', 'not-a-date'],
    ['文字列でない', 1_000],
    ['時計のずれを超えて未来の', new Date(NOW + 10 * 60_000).toISOString()],
  ])('updatedAt が%s小キーは使わない', async (_label, updatedAt) => {
    kvGet.mockResolvedValue({ ...latest, updatedAt })
    gatewayFetch.mockImplementation(async () => Response.json({ popularTags: ['公開中の世代'] }))

    await expect(getPopularTags('game', '24h')).resolves.toEqual(['公開中の世代'])
  })

  it('古い小キーしか無くゲートウェイも失敗したときは、古いタグを返さない', async () => {
    kvGet.mockResolvedValue({ ...latest, updatedAt: minutesBeforeNow(24 * 60) })
    gatewayFetch.mockImplementation(async () => new Response('unavailable', { status: 503 }))

    await expect(getPopularTags('game', '24h')).resolves.toEqual([])
    await expect(getPopularTags('all', 'hour')).resolves.toEqual([])
  })

  it('「すべて」も古い小キーは使わず、各ジャンルの公開中の世代から集計する', async () => {
    kvGet.mockResolvedValue({ ...latest, updatedAt: minutesBeforeNow(151) })
    gatewayFetch.mockImplementation(async (input: unknown) => {
      const genre = new URL(String(input)).searchParams.get('genre')
      return Response.json({ popularTags: genre === 'game' ? ['新しいタグ'] : [] })
    })

    await expect(getPopularTags('all', '24h')).resolves.toEqual(['新しいタグ'])
  })
})
