// @vitest-environment node
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

// 小キー(POPULAR_TAGS_LATEST)経由の高速パスと、未生成時の従来経路（ランキングゲートウェイ）へのフォールバックを検証する
// kv.get は失敗時に 3 回・各 20 秒まで待つため使わない（呼ばれたら検出する）。小キーは getStrict で読む
const kvGet = vi.fn()
const kvGetStrict = vi.fn()

vi.mock('@/lib/simple-kv', () => ({
  kv: {
    get: (...args: unknown[]) => kvGet(...args),
    getStrict: (...args: unknown[]) => kvGetStrict(...args),
  },
}))

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

  it('小キーがあればゲートウェイを呼ばずに返す', async () => {
    kvGetStrict.mockResolvedValue(latest)

    await expect(getPopularTags('game', '24h')).resolves.toEqual(['ゲーム実況', 'RTA'])
    await expect(getPopularTags('all', 'hour')).resolves.toEqual(['RTA'])

    expect(kvGetStrict).toHaveBeenCalledWith(POPULAR_TAGS_LATEST_KEY, expect.objectContaining({ attempts: 1 }))
    expect(gatewayFetch).not.toHaveBeenCalled()
  })

  it('小キーが未生成(null)なら従来経路(ランキングゲートウェイ)にフォールバックする', async () => {
    kvGetStrict.mockResolvedValue(null)
    gatewayFetch.mockImplementation(async () => Response.json({ popularTags: ['フォールバック'] }))

    await expect(getPopularTags('game', '24h')).resolves.toEqual(['フォールバック'])
    const [url] = gatewayCalls()
    expect(url?.pathname).toBe('/api/ranking')
    expect(url?.searchParams.get('genre')).toBe('game')
    expect(url?.searchParams.get('period')).toBe('24h')
  })

  it('小キーに該当ジャンルが無い/空なら従来経路にフォールバックする', async () => {
    kvGetStrict.mockResolvedValue(latest)
    gatewayFetch.mockImplementation(async () => Response.json({ popularTags: ['本体側'] }))

    // anime/hour は小キー上で空配列
    await expect(getPopularTags('anime', 'hour')).resolves.toEqual(['本体側'])
    expect(gatewayCalls()[0]?.searchParams.get('genre')).toBe('anime')
    expect(gatewayCalls()[0]?.searchParams.get('period')).toBe('hour')
  })

  it('小キーが不正な形なら無視して従来経路で応答する', async () => {
    kvGetStrict.mockResolvedValue({ popularTags: ['壊れた形'] })
    gatewayFetch.mockImplementation(async () => Response.json({ popularTags: ['本体側'] }))

    await expect(getPopularTags('game', '24h')).resolves.toEqual(['本体側'])
  })

  it('小キーの読み取りが失敗しても従来経路で応答する', async () => {
    kvGetStrict.mockRejectedValue(new Error('kv down'))
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
    kvGetStrict.mockResolvedValue({ ...latest, updatedAt: minutesBeforeNow(151) })
    gatewayFetch.mockImplementation(async () => Response.json({ popularTags: ['公開中の世代'] }))

    await expect(getPopularTags('game', '24h')).resolves.toEqual(['公開中の世代'])
    expect(gatewayCalls()[0]?.searchParams.get('genre')).toBe('game')
  })

  it('150 分以内の小キーはそのまま使う', async () => {
    kvGetStrict.mockResolvedValue({ ...latest, updatedAt: minutesBeforeNow(149) })

    await expect(getPopularTags('game', '24h')).resolves.toEqual(['ゲーム実況', 'RTA'])
    expect(gatewayFetch).not.toHaveBeenCalled()
  })

  it.each([
    ['欠けている', undefined],
    ['日時として読めない', 'not-a-date'],
    ['文字列でない', 1_000],
    ['時計のずれを超えて未来の', new Date(NOW + 10 * 60_000).toISOString()],
  ])('updatedAt が%s小キーは使わない', async (_label, updatedAt) => {
    kvGetStrict.mockResolvedValue({ ...latest, updatedAt })
    gatewayFetch.mockImplementation(async () => Response.json({ popularTags: ['公開中の世代'] }))

    await expect(getPopularTags('game', '24h')).resolves.toEqual(['公開中の世代'])
  })

  it('古い小キーしか無くゲートウェイも失敗したときは、古いタグを返さない', async () => {
    kvGetStrict.mockResolvedValue({ ...latest, updatedAt: minutesBeforeNow(24 * 60) })
    gatewayFetch.mockImplementation(async () => new Response('unavailable', { status: 503 }))

    await expect(getPopularTags('game', '24h')).resolves.toEqual([])
    await expect(getPopularTags('all', 'hour')).resolves.toEqual([])
  })

  it('「すべて」も古い小キーは使わず、各ジャンルの公開中の世代から集計する', async () => {
    kvGetStrict.mockResolvedValue({ ...latest, updatedAt: minutesBeforeNow(151) })
    gatewayFetch.mockImplementation(async (input: unknown) => {
      const genre = new URL(String(input)).searchParams.get('genre')
      return Response.json({ popularTags: genre === 'game' ? ['新しいタグ'] : [] })
    })

    await expect(getPopularTags('all', '24h')).resolves.toEqual(['新しいタグ'])
  })
})

describe('getPopularTags の待ち時間の上限', () => {
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
    vi.unstubAllEnvs()
  })

  it('小キーは 1 回だけ・数秒の期限で読む（KV の再試行で関数の上限まで待たない）', async () => {
    kvGetStrict.mockResolvedValue(latest)

    await expect(getPopularTags('game', '24h')).resolves.toEqual(['ゲーム実況', 'RTA'])

    expect(kvGet).not.toHaveBeenCalled()
    expect(kvGetStrict).toHaveBeenCalledTimes(1)
    const [key, options] = kvGetStrict.mock.calls[0] ?? []
    expect(key).toBe(POPULAR_TAGS_LATEST_KEY)
    expect(options).toMatchObject({ attempts: 1 })
    expect(options?.timeoutMs).toBeGreaterThan(0)
    expect(options?.timeoutMs).toBeLessThanOrEqual(5_000)
  })

  it('読み取りに失敗したら、しばらく KV を読み直さずに従来経路で応答する', async () => {
    // メモはテスト環境では無効なので、本番と同じ条件にする
    vi.stubEnv('NODE_ENV', 'production')
    kvGetStrict.mockRejectedValue(new Error('kv timeout'))
    gatewayFetch.mockImplementation(async () => Response.json({ popularTags: ['公開中の世代'] }))

    await expect(getPopularTags('game', '24h')).resolves.toEqual(['公開中の世代'])
    await expect(getPopularTags('anime', '24h')).resolves.toEqual(['公開中の世代'])

    expect(kvGetStrict).toHaveBeenCalledTimes(1)
  })

  it('「すべて」の集計元 6 ジャンルは並列に取り、集計の順序は変えない', async () => {
    kvGetStrict.mockResolvedValue(null)
    const releases: Array<() => void> = []
    gatewayFetch.mockImplementation(
      (input: unknown) =>
        new Promise<Response>((resolve) => {
          const genre = new URL(String(input)).searchParams.get('genre')
          releases.push(() => resolve(Response.json({ popularTags: [`${genre}-tag`] })))
          // 6 件そろってから一斉に応答する（直列に待つと 1 件目の応答待ちのまま止まる）
          if (releases.length === 6) releases.forEach((release) => release())
        })
    )

    await expect(getPopularTags('all', '24h')).resolves.toEqual([
      'game-tag',
      'anime-tag',
      'entertainment-tag',
      'technology-tag',
      'voicesynthesis-tag',
      'other-tag',
    ])
  }, 2_000)
})
