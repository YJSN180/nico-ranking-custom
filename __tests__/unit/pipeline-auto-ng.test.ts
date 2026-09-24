// @vitest-environment node
// 粗悪コンテンツ自動NG（lqng）をパイプラインで公開前に当てる（計画 S6）。
// ID・タイトルはすべて合成値。
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  createKvJsonReader,
  loadPipelineAutoNg,
  type PipelineAutoNg,
} from '../../lib/pipeline/auto-ng'
import { createPipelineNgFilter } from '../../lib/pipeline/ng-filter'
import { buildGenreRanking } from '../../lib/pipeline/run-update'
import { DEFAULT_LQNG_CONFIG, type LqngConfig, type LqngVerdicts, type VideoVerdict } from '../../lib/lqng/types'
import { createEmptyNGList } from '../../lib/ng-list-migration'
import type { NGList } from '../../types/ng-list'
import type { RankingItem } from '../../types/ranking'

const ENV = {
  CLOUDFLARE_ACCOUNT_ID: 'account',
  CLOUDFLARE_KV_NAMESPACE_ID: 'namespace',
  CLOUDFLARE_API_TOKEN: 'token',
}
const KV_VALUES = 'https://api.cloudflare.com/client/v4/accounts/account/storage/kv/namespaces/namespace/values/'
const CONFIG_KEY = 'lqng:config'
const VERDICTS_KEY = 'lqng:verdicts'

const NOW = new Date('2026-01-10T03:00:00.000Z')
const hoursFromNow = (hours: number): string => new Date(NOW.getTime() + hours * 3_600_000).toISOString()

const config: LqngConfig = {
  ...DEFAULT_LQNG_CONFIG,
  enabled: true,
  allowlist: { authorIds: ['9001'], videoIds: ['sm9002'] },
}

const video = (status: VideoVerdict['status'], authorId: string, extra: Partial<VideoVerdict> = {}): VideoVerdict => ({
  status,
  reasons: status === 'ng' ? ['B'] : [],
  authorId,
  title: 't',
  registeredAt: NOW.toISOString(),
  since: NOW.toISOString(),
  ...extra,
})

const verdicts: LqngVerdicts = {
  version: 1,
  updatedAt: NOW.toISOString(),
  authors: {
    '1001': { status: 'ng', reasons: ['A_C'], since: NOW.toISOString(), evidence: [] },
    '9001': { status: 'ng', reasons: ['D'], since: NOW.toISOString(), evidence: [] }, // 許可リストの投稿者
  },
  videos: {
    sm1: video('ng', '2001'),
    sm2: video('hold', '2002', { holdSignals: ['low_followers'], holdUntil: hoursFromNow(5) }),
    sm4: video('released', '2004'),
    sm5: video('ng', '9001'), // 許可リストの投稿者の動画
    sm9002: video('ng', '2005'), // 許可リストの動画
  },
}

const item = (id: string, authorId: string): RankingItem => ({ rank: 0, id, title: 't', thumbURL: '', views: 0, authorId })

// 上流の 1 ページ（本体・タグ別とも同じ並び）
const upstreamPage = (): RankingItem[] => [
  item('sm1', '2001'), // 確定 NG の動画
  item('sm10', '1001'), // 確定 NG の投稿者
  item('sm2', '2002'), // 保留中
  item('sm4', '2004'), // 解放済み
  item('sm5', '9001'), // 許可リストの投稿者（動画も NG 判定あり）
  item('sm9002', '2005'), // 許可リストの動画
  item('sm20', '3001'), // 判定なし
]
const ALL_IDS = upstreamPage().map((i) => i.id)

type Respond = () => Response
const json = (value: unknown): Respond => () => new Response(JSON.stringify(value))
const text = (body: string): Respond => () => new Response(body)
const status = (code: number): Respond => () => new Response('error', { status: code })

/** Cloudflare KV REST の値の読み取りだけを返す fetch。未登録のキーは 404 */
function stubKv(values: Record<string, Respond>) {
  const fetch = vi.fn(async (input: string | URL | Request) => {
    const url = String(input)
    const key = url.startsWith(KV_VALUES) ? decodeURIComponent(url.slice(KV_VALUES.length)) : ''
    const respond = values[key]
    return respond ? respond() : new Response('not found', { status: 404 })
  })
  vi.stubGlobal('fetch', fetch)
  return fetch
}

const load = (): Promise<PipelineAutoNg> => loadPipelineAutoNg(createKvJsonReader(ENV), NOW)

/** 実際の収集（buildGenreRanking）に、パイプラインの NG 適用を通して 1 ジャンルを作る */
async function collect(auto: PipelineAutoNg, ngList: NGList = createEmptyNGList()) {
  const filter = createPipelineNgFilter(ngList, auto.sets)
  const result = await buildGenreRanking<RankingItem>(
    {
      genres: ['nature'],
      periods: ['24h', 'hour'],
      targetCount: 1000,
      maxPages: 10,
      onError: 'throw',
      tagOnError: 'throw',
      includeTagRankings: true,
      popularTagsStrategy: 'shared',
      tagFetchOrder: 'tag-first',
      normalizeItems: (items) => items,
      filterItems: filter.filterItems,
      fetchPage: async () => ({ items: upstreamPage(), popularTags: ['tagA'], hasNextPage: false }),
    },
    'nature',
  )
  const ids = (period: '24h' | 'hour') => result.data[period].items.map((i) => i.id)
  const tagIds = (period: '24h' | 'hour') => result.data[period].tags.tagA.map((i) => i.id)
  return { ids, tagIds, excluded: filter.autoNgExcluded }
}

const NONE_EXCLUDED = { '24h': { ranking: 0, tags: 0 }, hour: { ranking: 0, tags: 0 } }

afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('auto NG before publication', () => {
  it('ng: excludes confirmed video and author verdicts and counts them per period', async () => {
    const fetch = stubKv({ [CONFIG_KEY]: json(config), [VERDICTS_KEY]: json(verdicts) })
    const auto = await load()

    expect(auto.status).toBe('applied')
    // パイプラインがすでに使っている読み方（同じ名前空間・Bearer 認証の REST）で読む
    expect(fetch).toHaveBeenCalledWith(
      `${KV_VALUES}lqng%3Averdicts`,
      expect.objectContaining({ headers: { Authorization: 'Bearer token' } }),
    )
    const { ids, tagIds, excluded } = await collect(auto)
    for (const period of ['24h', 'hour'] as const) {
      expect(ids(period)).toEqual(['sm2', 'sm4', 'sm5', 'sm9002', 'sm20'])
      expect(tagIds(period)).toEqual(['sm2', 'sm4', 'sm5', 'sm9002', 'sm20'])
    }
    expect(excluded).toEqual({ '24h': { ranking: 2, tags: 2 }, hour: { ranking: 2, tags: 2 } })
  })

  it('ng: applies manual and derived NG first and counts only what auto NG removed', async () => {
    stubKv({ [CONFIG_KEY]: json(config), [VERDICTS_KEY]: json(verdicts) })
    const auto = await load()
    // sm1 は手動 NG にもある。3001 の動画は手動の投稿者 NG
    const manual: NGList = { ...createEmptyNGList(), videoIds: ['sm1'], authorIds: ['3001'] }
    const filter = createPipelineNgFilter(manual, auto.sets)
    const result = await filter.filterItems(upstreamPage(), { genre: 'nature', period: 'hour', kind: 'main' })

    expect(result.filteredItems.map((i) => i.id)).toEqual(['sm2', 'sm4', 'sm5', 'sm9002'])
    expect(result.filteredItems.map((i) => i.rank)).toEqual([1, 2, 3, 4])
    // 手動 NG は従来どおり派生 NG に積み、自動NG は積まない
    expect(result.newDerivedIds).toEqual(['sm20'])
    expect(filter.autoNgExcluded.hour).toEqual({ ranking: 1, tags: 0 })
  })

  it('hold: publishes videos that are only on hold, since a publication outlives the hold', async () => {
    stubKv({ [CONFIG_KEY]: json(config), [VERDICTS_KEY]: json(verdicts) })
    const auto = await load()

    expect(auto.sets.videoIds).not.toContain('sm2')
    const { ids } = await collect(auto)
    expect(ids('hour')).toContain('sm2')
  })

  it('allowlist: publishes allowlisted videos and authors even with NG verdicts', async () => {
    stubKv({ [CONFIG_KEY]: json(config), [VERDICTS_KEY]: json(verdicts) })
    const auto = await load()

    expect(auto.sets.authorIds).toEqual(['1001'])
    expect(auto.sets.videoIds).toEqual(['sm1'])
    const { ids } = await collect(auto)
    expect(ids('24h')).toEqual(expect.arrayContaining(['sm5', 'sm9002']))
  })

  it('missing key: publishes without auto NG', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    stubKv({ [CONFIG_KEY]: json(config) })
    const auto = await load()

    expect(auto).toEqual({ status: 'missing', sets: { authorIds: [], videoIds: [] } })
    const { ids, excluded } = await collect(auto)
    expect(ids('24h')).toEqual(ALL_IDS)
    expect(excluded).toEqual(NONE_EXCLUDED)
    expect(warn.mock.calls.flat().join('\n')).not.toMatch(/lqng/)
  })

  it('missing or disabled settings: no auto NG', async () => {
    stubKv({ [VERDICTS_KEY]: json(verdicts) })
    expect((await load()).status).toBe('disabled')
    stubKv({ [CONFIG_KEY]: json({ ...config, enabled: false }), [VERDICTS_KEY]: json(verdicts) })
    expect(await load()).toEqual({ status: 'disabled', sets: { authorIds: [], videoIds: [] } })
  })

  it('read failure: retries, then publishes without auto NG and logs no key names or ids', async () => {
    vi.useFakeTimers()
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const fetch = stubKv({ [CONFIG_KEY]: json(config), [VERDICTS_KEY]: status(503) })
    const pending = load()
    await vi.advanceTimersByTimeAsync(180_000)
    const auto = await pending
    vi.useRealTimers()

    expect(auto).toEqual({ status: 'unavailable', sets: { authorIds: [], videoIds: [] } })
    expect(fetch.mock.calls.filter(([url]) => String(url).endsWith('lqng%3Averdicts')).length).toBeGreaterThan(1)
    const { ids, excluded } = await collect(auto)
    expect(ids('hour')).toEqual(ALL_IDS)
    expect(excluded).toEqual(NONE_EXCLUDED)
    const logs = warn.mock.calls.flat().join('\n')
    expect(logs).toContain('http_503')
    expect(logs).not.toMatch(/lqng|1001|9001|sm\d/)
  })

  it('read failure of the settings: no auto NG, because the allowlist is unknown', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    stubKv({ [CONFIG_KEY]: status(403), [VERDICTS_KEY]: json(verdicts) })
    expect(await load()).toEqual({ status: 'unavailable', sets: { authorIds: [], videoIds: [] } })
  })

  it.each([
    ['maps are not objects', json({ version: 1, authors: [], videos: 'broken' })],
    ['not JSON', text('{"authors":')],
    ['an entry is not an object', json({ ...verdicts, authors: { '1001': null } })],
  ])('broken verdict table (%s): normalizes to empty, publishes without auto NG and logs it', async (_label, respond) => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    stubKv({ [CONFIG_KEY]: json(config), [VERDICTS_KEY]: respond })
    const auto = await load()

    expect(auto).toEqual({ status: 'invalid', sets: { authorIds: [], videoIds: [] } })
    const { ids } = await collect(auto)
    expect(ids('24h')).toEqual(ALL_IDS)
    const logs = warn.mock.calls.flat().join('\n')
    expect(logs).toContain('empty')
    expect(logs).not.toMatch(/lqng|1001|sm\d/)
  })
})
