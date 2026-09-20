// @vitest-environment node
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  fetchRankingPageWithRetry,
  RankingNotReadyError,
} from '../../lib/pipeline/fetch-ranking'
import {
  buildGenreRanking,
  type RunUpdateConfig,
} from '../../lib/pipeline/run-update'
import { collectRankingItems } from '../../lib/pipeline/collect-ranking-items'
import {
  validateGenre,
  assertCounts,
} from '../../lib/pipeline/publication-contract'
import type { RankingItem } from '../../types/ranking'
import { createServer } from 'node:http'
import type { AddressInfo } from 'node:net'

const item: RankingItem = {
  id: 'sm1',
  rank: 1,
  title: 'video',
  thumbURL: '',
  views: 1,
}
const html = (data: unknown) =>
  `<meta name="server-response" content="${JSON.stringify(data).replace(/&/g, '&amp;').replace(/"/g, '&quot;')}">`
const notReady = {
  meta: {
    status: 202,
    code: 'HTTP_202',
    errorHeading:
      '\u3053\u306e\u30e9\u30f3\u30ad\u30f3\u30b0\u306f\u6e96\u5099\u4e2d\u3067\u3059\u3002',
  },
  data: { response: [] },
}
const ranking = (totalCount = 100) => ({
  meta: { status: 200, code: 'HTTP_200' },
  data: {
    response: {
      $getTeibanRanking: { data: { items: [item] } },
      $getTeibanRankingFeaturedKeyAndTrendTags: {
        data: { trendTags: ['ready', 'waiting'] },
      },
      page: { pagination: { page: 1, pageSize: 100, totalCount } },
    },
  },
})

afterEach(() => {
  vi.unstubAllGlobals()
  vi.unstubAllEnvs()
  vi.restoreAllMocks()
})

describe('upstream ranking responses', () => {
  it('classifies only explicit HTTP 202 metadata and does not retry it as a parse failure', async () => {
    const fetch = vi
      .fn()
      .mockResolvedValue(new Response(html(notReady), { status: 202 }))
    vi.stubGlobal('fetch', fetch)
    await expect(
      fetchRankingPageWithRetry('nature', 'hour', 'waiting'),
    ).rejects.toMatchObject({
      name: 'RankingNotReadyError',
      genre: 'nature',
      period: 'hour',
      tag: 'waiting',
      page: 1,
    })
    expect(fetch).toHaveBeenCalledTimes(1)
  })

  it.each([
    [200, notReady],
    [202, { meta: { status: 500 } }],
    [202, { meta: { status: 202, code: 'HTTP_202' }, data: { response: [] } }],
    [200, { data: { response: {} } }],
    [200, { data: { response: { $getTeibanRanking: { data: {} } } } }],
  ])(
    'does not treat malformed HTTP %s responses as unavailable tags',
    async (status, data) => {
      vi.stubGlobal(
        'fetch',
        vi.fn().mockResolvedValue(new Response(html(data), { status })),
      )
      await expect(
        fetchRankingPageWithRetry('nature', 'hour', 'waiting', 1, 1),
      ).rejects.not.toBeInstanceOf(RankingNotReadyError)
    },
  )

  it.each([100, 200])(
    'uses upstream pagination for totalCount=%s',
    async (totalCount) => {
      vi.stubGlobal(
        'fetch',
        vi.fn().mockResolvedValue(new Response(html(ranking(totalCount)))),
      )
      expect(
        (await fetchRankingPageWithRetry('nature', 'hour')).hasNextPage,
      ).toBe(totalCount > 100)
    },
  )

  it('does not turn HTTP 500 into an empty ranking', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(new Response('error', { status: 500 })),
    )
    await expect(
      fetchRankingPageWithRetry('nature', 'hour', 'waiting', 1, 1),
    ).rejects.toThrow('Fetch failed: 500')
  })
})

function config(
  strategy: 'shared' | 'per-period' = 'shared',
  order: 'tag-first' | 'period-first' = 'tag-first',
): RunUpdateConfig<RankingItem> {
  return {
    genres: ['nature'],
    periods: ['24h', 'hour'],
    targetCount: 1000,
    maxPages: 10,
    onError: 'throw',
    tagOnError: 'throw',
    omitNotReadyTags: true,
    includeTagRankings: true,
    popularTagsStrategy: strategy,
    tagFetchOrder: order,
    normalizeItems: (items) => items,
    filterItems: async (items) => ({ filteredItems: items, newDerivedIds: [] }),
    fetchPage: vi.fn(async (genre, period, tag, page) => {
      if (tag === 'waiting' && period === 'hour')
        throw new RankingNotReadyError(genre, period, tag, page)
      return {
        items: [item],
        popularTags: ['ready', 'waiting'],
        hasNextPage: false,
      }
    }),
  }
}

describe('collection failure policy', () => {
  it.each([
    ['shared', 'tag-first'],
    ['shared', 'period-first'],
    ['per-period', 'period-first'],
  ] as const)(
    'records unavailable first-page tags without empty replacements (%s/%s)',
    async (strategy, order) => {
      const result = await buildGenreRanking(config(strategy, order), 'nature')
      expect(result.hadErrors).toBe(false)
      expect(result.data.hour.items).toHaveLength(1)
      expect(result.data.hour.popularTags).toEqual(['ready'])
      expect(result.data.hour.tags).not.toHaveProperty('waiting')
      expect(result.data['24h'].popularTags).toContain('waiting')
      expect(result.data['24h'].tags?.waiting).toHaveLength(1)
      expect(result.unavailableTags).toEqual([
        { period: 'hour', tag: 'waiting', reason: 'upstream-not-ready' },
      ])
      expect(() => validateGenre('nature', result.data)).not.toThrow()
    },
  )

  it('still fails when the main ranking is not ready', async () => {
    const c = config()
    c.fetchPage = vi
      .fn()
      .mockRejectedValue(
        new RankingNotReadyError('nature', '24h', undefined, 1),
      )
    await expect(buildGenreRanking(c, 'nature')).rejects.toBeInstanceOf(
      RankingNotReadyError,
    )
    expect(c.fetchPage).toHaveBeenCalledTimes(1)
  })

  it.each(['shared', 'per-period'] as const)(
    'propagates ordinary tag errors with %s strategy',
    async (strategy) => {
      const c = config(strategy)
      c.fetchPage = vi.fn(async (_genre, _period, tag) => {
        if (tag) throw new Error('upstream 500')
        return { items: [item], popularTags: ['ready'], hasNextPage: false }
      })
      await expect(buildGenreRanking(c, 'nature')).rejects.toThrow(
        'upstream 500',
      )
    },
  )

  it('does not silently truncate a tag if page 2 becomes unavailable', async () => {
    const c = config()
    c.fetchPage = vi.fn(async (genre, period, tag, page) => {
      if (tag && page === 2)
        throw new RankingNotReadyError(genre, period, tag, page)
      return {
        items: [item],
        popularTags: ['ready'],
        hasNextPage: Boolean(tag),
      }
    })
    await expect(buildGenreRanking(c, 'nature')).rejects.toMatchObject({
      page: 2,
    })
  })

  it('requires an explicit opt-in to omit unavailable tags', async () => {
    const c = config()
    c.omitNotReadyTags = false
    await expect(buildGenreRanking(c, 'nature')).rejects.toBeInstanceOf(
      RankingNotReadyError,
    )
  })
})

describe('publication count guards', () => {
  const previous = {
    'all/24h': 995,
    'all/hour': 996,
    'play/24h': 1000,
    'play/hour': 174,
  }
  it('allows a complete small hourly genre to vary without stopping the whole publication', () => {
    expect(() =>
      assertCounts({ ...previous, 'play/hour': 80 }, previous),
    ).not.toThrow()
  })
  it('still rejects a 24h genre collapse', () => {
    expect(() =>
      assertCounts({ ...previous, 'play/24h': 400 }, previous),
    ).toThrow('50%')
  })
  it('still rejects the overall hourly ranking collapsing', () => {
    expect(() =>
      assertCounts({ ...previous, 'all/hour': 400 }, previous),
    ).toThrow('50%')
  })
  it('rejects a widespread hourly collapse even if all/hour stays stable', () => {
    expect(() =>
      assertCounts(
        { 'all/hour': 1000, 'game/hour': 100, 'music/hour': 100 },
        { 'all/hour': 1000, 'game/hour': 1000, 'music/hour': 1000 },
      ),
    ).toThrow('Hourly ranking total')
  })
})

describe('pagination after NG filtering', () => {
  it('stops at the upstream last page even if filtering leaves fewer than the target', async () => {
    const fetchPage = vi.fn(async () => ({
      items: Array.from({ length: 100 }, (_, n) => ({ ...item, id: `sm${n}` })),
      hasNextPage: false,
    }))
    const result = await collectRankingItems({
      fetchPage,
      normalizeItems: (items) => items,
      filterItems: async (items) => ({
        filteredItems: items.slice(1),
        newDerivedIds: [],
      }),
      targetCount: 300,
      maxPages: 10,
      stopWhenPageItemsLessThan: 100,
    })
    expect(result.items).toHaveLength(99)
    expect(fetchPage).toHaveBeenCalledTimes(1)
  })
  it('does not stop early on a short page when upstream confirms more pages', async () => {
    const fetchPage = vi.fn(async (page: number) => ({
      items: [{ ...item, id: `sm${page}` }],
      hasNextPage: page < 2,
    }))
    const result = await collectRankingItems({
      fetchPage,
      normalizeItems: (items) => items,
      filterItems: async (items) => ({
        filteredItems: items,
        newDerivedIds: [],
      }),
      targetCount: 300,
      maxPages: 10,
      stopWhenPageItemsLessThan: 100,
    })
    expect(result.items).toHaveLength(2)
    expect(fetchPage).toHaveBeenCalledTimes(2)
  })
})

it('aborts stalled tag response bodies and preserves existing video tags', async () => {
  const server = createServer((_request, response) => {
    response.writeHead(200, { 'Content-Type': 'text/html' })
    response.write('<html>')
  })
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
  const originalFetch = globalThis.fetch
  const url = `http://127.0.0.1:${(server.address() as AddressInfo).port}`
  const fetch = vi.fn((_url: unknown, options?: RequestInit) =>
    originalFetch(url, options),
  )
  vi.stubGlobal('fetch', fetch)
  for (const key of [
    'TAG_FETCH_NICOLOG_TIMEOUT_MS',
    'TAG_FETCH_GETTHUMB_TIMEOUT_MS',
  ])
    vi.stubEnv(key, '100')
  for (const key of [
    'TAG_FETCH_NICOLOG_MIN_INTERVAL_MS',
    'TAG_FETCH_GETTHUMB_MIN_INTERVAL_MS',
  ])
    vi.stubEnv(key, '0')
  vi.resetModules()
  try {
    const { enrichRankingItemsWithTagDetails } =
      await import('../../lib/tag-fetcher-simple')
    const [result] = await enrichRankingItemsWithTagDetails(
      [{ ...item, tags: ['original'] }],
      1,
      0,
      false,
    )
    expect(result.tags).toEqual(['original'])
    expect(fetch).toHaveBeenCalledTimes(2)
  } finally {
    server.closeAllConnections()
    await new Promise<void>((resolve) => server.close(() => resolve()))
  }
}, 3000)
