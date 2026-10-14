// @vitest-environment node
import { gzipSync } from 'node:zlib'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// Green とルーターは Sentry で包まれている。Blue は Sentry を読み込まない
vi.mock('../../workers/sentry.js', () => ({
  Sentry: { withSentry: (_options: unknown, handler: unknown) => handler },
  createWorkerSentryOptions: vi.fn(),
  captureWorkerException: vi.fn(),
  captureWorkerMessage: vi.fn(),
  sanitizeUrlForSentry: vi.fn(),
}))

import blue from '../../workers/api-gateway-blue-20250706'
import green from '../../workers/api-gateway-green-20250726'
import router from '../../workers/smart-router-20250706'

type WorkerFetch = (
  request: Request,
  env: Record<string, unknown>,
  ctx: { waitUntil: (promise: Promise<unknown>) => void },
) => Promise<Response>

const fetchBlue = blue.fetch as unknown as WorkerFetch
const fetchGreen = green.fetch as unknown as WorkerFetch
const fetchRouter = router.fetch as unknown as WorkerFetch

const BLUE_VERSION = 'blue-20250706-unified-cors'
const SITE = 'https://nico-rank.com'
const GENERATION = '37147577233-1'
const PREFIX = `rankings/generations/${GENERATION}`
const TAG = 'ずんだもん'
const TAG_KEY = `${PREFIX}/game/24h/tags/${encodeURIComponent(TAG)}.json`
const NOW = new Date('2026-10-04T00:00:00.000Z')

const manifest = {
  version: 1,
  generation: GENERATION,
  collectedAt: '2026-10-03T19:20:00.000Z',
  publishedAt: '2026-10-03T19:22:48.604Z',
  counts: { 'all/24h': 2, 'game/24h': 1 },
}

const allRanking = {
  items: [
    { rank: 1, id: 'sm1', title: 'A &amp; B', authorName: 'X &lt;Y&gt;', tags: ['&quot;q&quot;'] },
    { rank: 2, id: 'so2', title: 'Plain' },
  ],
  // パイプラインが文字の配列のようなオブジェクトで保存した人気タグも文字列に戻す
  popularTags: ['tag&amp;1', { 0: '東', 1: '方' }],
  metadata: { version: 1, genre: 'all', period: '24h', updatedAt: manifest.publishedAt },
}

const tagRanking = {
  items: [{ rank: 1, id: 'sm3', title: 'ずんだもん &amp; 実況' }],
  popularTags: [],
  metadata: { version: 1, genre: 'game', period: '24h', tag: TAG, updatedAt: manifest.publishedAt },
}

const staleRanking = {
  items: [{ rank: 1, id: 'sm999', title: 'stale' }],
  popularTags: [],
  metadata: { version: 1, genre: 'all', period: '24h', updatedAt: '2025-07-06T00:00:00.000Z' },
}

interface StoredEntry {
  value: unknown
  gzip?: boolean
}

/** R2 の get だけを持つ合成のバケット。取り出すたびに新しい本文を作る（Green は body、Blue は arrayBuffer を読む） */
function r2Bucket(entries: Record<string, StoredEntry>) {
  const get = vi.fn(async (key: string) => {
    const entry = entries[key]
    if (!entry) return null
    const text = JSON.stringify(entry.value)
    const bytes = entry.gzip ? new Uint8Array(gzipSync(text)) : new TextEncoder().encode(text)
    return {
      key,
      etag: `etag-${bytes.byteLength}`,
      httpEtag: `"etag-${bytes.byteLength}"`,
      size: bytes.byteLength,
      httpMetadata: entry.gzip ? { contentEncoding: 'gzip' } : {},
      body: new Response(bytes).body,
      arrayBuffer: async () => bytes.slice().buffer,
      json: async () => JSON.parse(text) as unknown,
    }
  })
  return { get }
}

/** 本番と同じく世代を公開したバケット。旧来のキーと旧 Blue のキーには古いデータを置く */
function publishedBucket() {
  return r2Bucket({
    'rankings/current.json': { value: manifest },
    [`${PREFIX}/all/24h/all.json`]: { value: allRanking, gzip: true },
    [TAG_KEY]: { value: tagRanking, gzip: true },
    [`${PREFIX}/metadata.json`]: { value: { version: 1, updatedAt: manifest.publishedAt }, gzip: true },
    'rankings/all/24h/all.json': { value: staleRanking, gzip: true },
    'ranking-all.json': { value: staleRanking },
  })
}

function workerEnv(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    R2_BUCKET: publishedBucket(),
    RATE_LIMITER: { limit: vi.fn(async () => ({ success: true })) },
    VERCEL_DEPLOYMENT_URL: 'https://upstream.example',
    WORKER_AUTH_KEY: 'test-only-worker-key',
    ...overrides,
  }
}

const ctx = { waitUntil: vi.fn() }

function get(path: string, headers: Record<string, string> = {}): Request {
  return new Request(`${SITE}${path}`, { headers: { Origin: SITE, ...headers } })
}

function requestedKeys(bucket: { get: ReturnType<typeof vi.fn> }): string[] {
  return bucket.get.mock.calls.map(([key]) => String(key))
}

beforeEach(() => {
  // タグが無いときの updatedAt を Green と比べられるよう、時刻だけを固定する（再試行の待ちは本物のタイマー）
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(NOW)
  // Green は要求ごとに console.log を出す
  vi.spyOn(console, 'log').mockImplementation(() => undefined)
})

afterEach(() => {
  vi.useRealTimers()
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

describe('blue /api/ranking', () => {
  it('reads the current generation, not the legacy or old Blue keys', async () => {
    const bucket = publishedBucket()

    const response = await fetchBlue(get('/api/ranking?genre=all&period=24h'), workerEnv({ R2_BUCKET: bucket }), ctx)

    expect(response.status).toBe(200)
    const body = await response.json()
    expect(body.items.map((item: { id: string }) => item.id)).toEqual(['sm1', 'so2'])
    expect(body.items[0]).toMatchObject({ title: 'A & B', authorName: 'X <Y>', tags: ['"q"'] })
    expect(body.popularTags).toEqual(['tag&1', '東方'])
    expect(body.metadata).toEqual(allRanking.metadata)
    expect(requestedKeys(bucket)).toEqual(['rankings/current.json', `${PREFIX}/all/24h/all.json`])
    expect(response.headers.get('X-Ranking-Generation')).toBe(GENERATION)
    expect(response.headers.get('X-Worker-Version')).toBe(BLUE_VERSION)
    expect(response.headers.get('X-Data-Source')).toBe('r2-direct')
    expect(response.headers.get('ETag')).toMatch(/^"etag-\d+"$/)
    expect(response.headers.get('Access-Control-Allow-Origin')).toBe(SITE)
    expect(response.headers.get('X-Content-Type-Options')).toBe('nosniff')
  })

  it.each([
    ['plain', false],
    ['gzip', true],
  ])('reads the %s legacy layout only when there is no generation pointer', async (_label, gzip) => {
    const bucket = r2Bucket({
      'rankings/all/hour/all.json': { value: { ...allRanking, metadata: { ...allRanking.metadata, period: 'hour' } }, gzip },
    })

    const response = await fetchBlue(get('/api/ranking?genre=all&period=hour'), workerEnv({ R2_BUCKET: bucket }), ctx)

    expect(response.status).toBe(200)
    expect((await response.json()).items[0].title).toBe('A & B')
    expect(response.headers.get('X-Ranking-Generation')).toBe('legacy')
    expect(requestedKeys(bucket)).toEqual(['rankings/current.json', 'rankings/all/hour/all.json'])
  })

  it('answers 500 for an invalid generation pointer and never serves the legacy data', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined)
    const bucket = r2Bucket({
      'rankings/current.json': { value: { version: 1, generation: '../evil' } },
      'rankings/all/24h/all.json': { value: staleRanking, gzip: true },
    })

    const response = await fetchBlue(get('/api/ranking'), workerEnv({ R2_BUCKET: bucket }), ctx)

    expect(response.status).toBe(500)
    expect(response.headers.get('Cache-Control')).toBe('no-store')
    expect(requestedKeys(bucket)).toEqual(['rankings/current.json'])
  })

  it('reads a tag ranking from the generation with the tag URL-encoded in the key', async () => {
    const bucket = publishedBucket()

    const response = await fetchBlue(
      get(`/api/ranking?genre=game&period=24h&tag=${encodeURIComponent(TAG)}`),
      workerEnv({ R2_BUCKET: bucket }),
      ctx,
    )

    expect(response.status).toBe(200)
    expect((await response.json()).items).toEqual([{ rank: 1, id: 'sm3', title: 'ずんだもん & 実況' }])
    expect(requestedKeys(bucket)).toEqual(['rankings/current.json', TAG_KEY])
  })

  it('answers an empty 200 for a tag without data, as Green does', async () => {
    const response = await fetchBlue(get('/api/ranking?genre=all&period=24h&tag=nothing'), workerEnv(), ctx)

    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({
      items: [],
      popularTags: [],
      metadata: { version: 1, updatedAt: NOW.toISOString(), genre: 'all', period: '24h', tag: 'nothing' },
    })
    expect(response.headers.get('X-Data-Source')).toBe('r2-tag-not-found')
  })

  it('answers 404 only when the ranking really does not exist in the generation', async () => {
    const response = await fetchBlue(get('/api/ranking?genre=music&period=hour'), workerEnv(), ctx)

    expect(response.status).toBe(404)
    expect(await response.json()).toEqual({ error: 'Ranking data not found', message: 'No data available for music/hour' })
    expect(response.headers.get('X-Data-Source')).toBe('r2-not-found')
  })

  it.each([
    ['the generation pointer', 'rankings/current.json'],
    ['the ranking object', `${PREFIX}/all/24h/all.json`],
  ])('retries a transient R2 error while reading %s instead of answering 404', async (_label, failingKey) => {
    const published = publishedBucket()
    let failures = 1
    const bucket = {
      get: vi.fn(async (key: string) => {
        if (key === failingKey && failures-- > 0) throw new Error('get: We encountered an internal error. Please try again. (10001)')
        return published.get(key)
      }),
    }

    const response = await fetchBlue(get('/api/ranking'), workerEnv({ R2_BUCKET: bucket }), ctx)

    expect(response.status).toBe(200)
    expect(requestedKeys(bucket).filter((key) => key === failingKey)).toHaveLength(2)
  })

  it('answers 500, not 404, for an R2 error that is not transient', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined)
    const bucket = { get: vi.fn(async () => { throw new Error('get: Access denied. (10003)') }) }

    const response = await fetchBlue(get('/api/ranking'), workerEnv({ R2_BUCKET: bucket }), ctx)

    expect(response.status).toBe(500)
    expect(bucket.get).toHaveBeenCalledTimes(1)
  })

  it('keeps the requested tag and the R2 key out of console output', async () => {
    const lines: string[] = []
    vi.spyOn(console, 'error').mockImplementation((...args: unknown[]) => {
      lines.push(args.map(String).join(' '))
    })
    const tag = 'synthetic private tag'
    const bucket = { get: vi.fn(async () => { throw new Error('get: Access denied. (10003)') }) }

    await fetchBlue(get(`/api/ranking?tag=${encodeURIComponent(tag)}`), workerEnv({ R2_BUCKET: bucket }), ctx)

    expect(lines).toHaveLength(1)
    expect(lines[0]).not.toContain(tag)
    expect(lines[0]).not.toContain(encodeURIComponent(tag))
  })

  it('answers 304 without a body for a matching If-None-Match', async () => {
    const first = await fetchBlue(get('/api/ranking'), workerEnv(), ctx)
    const etag = first.headers.get('ETag') ?? ''

    const response = await fetchBlue(get('/api/ranking', { 'If-None-Match': `W/${etag}` }), workerEnv(), ctx)

    expect(response.status).toBe(304)
    expect(response.body).toBeNull()
    expect(response.headers.get('ETag')).toBe(etag)
    expect(response.headers.get('Cache-Control')).toBe('no-store')
  })

  it('rate limits per client IP with a Blue-only key and answers 429 with CORS', async () => {
    const limit = vi.fn(async () => ({ success: false }))
    const bucket = publishedBucket()

    const response = await fetchBlue(
      get('/api/ranking', { 'CF-Connecting-IP': '203.0.113.7' }),
      workerEnv({ RATE_LIMITER: { limit }, R2_BUCKET: bucket }),
      ctx,
    )

    expect(response.status).toBe(429)
    // Green と同じ namespace_id を使うので、Green のキー（203.0.113.7:ranking）とは分ける
    expect(limit).toHaveBeenCalledExactlyOnceWith({ key: '203.0.113.7:ranking:blue' })
    expect(response.headers.get('Retry-After')).toBe('60')
    expect(response.headers.get('Access-Control-Allow-Origin')).toBe(SITE)
    expect(bucket.get).not.toHaveBeenCalled()
  })

  it('lets requests through when the rate limiter itself fails', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined)
    const limit = vi.fn(async () => { throw new Error('limiter unavailable') })

    const response = await fetchBlue(get('/api/ranking'), workerEnv({ RATE_LIMITER: { limit } }), ctx)

    expect(response.status).toBe(200)
  })
})

describe('blue /api/metadata', () => {
  it('returns the metadata of the current generation', async () => {
    const bucket = publishedBucket()

    const response = await fetchBlue(get('/api/metadata'), workerEnv({ R2_BUCKET: bucket }), ctx)

    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({ version: 1, updatedAt: manifest.publishedAt })
    expect(requestedKeys(bucket)).toEqual(['rankings/current.json', `${PREFIX}/metadata.json`])
    expect(response.headers.get('X-Ranking-Generation')).toBe(GENERATION)
    expect(response.headers.get('X-Worker-Version')).toBe(BLUE_VERSION)
  })

  it('answers {} when the metadata is missing, as Green does', async () => {
    const response = await fetchBlue(get('/api/metadata'), workerEnv({ R2_BUCKET: r2Bucket({}) }), ctx)

    expect(response.status).toBe(200)
    expect(await response.text()).toBe('{}')
  })
})

function failingBucket(): { get: ReturnType<typeof vi.fn> } {
  return { get: vi.fn(async () => { throw new Error('get: Access denied. (10003)') }) }
}

function noStoreHeaders(response: Response): Array<string | null> {
  return ['Cache-Control', 'CDN-Cache-Control', 'Vercel-CDN-Cache-Control'].map((name) => response.headers.get(name))
}

type UncacheableCase = [label: string, path: string, env: () => Record<string, unknown>, status: number]

// ルーターのフォールバックは Blue の応答をそのまま返すので、空の結果やエラーも Blue 自身が no-store にする
const UNCACHEABLE_CASES: UncacheableCase[] = [
  ['a ranking', '/api/ranking', () => workerEnv(), 200],
  ['a tag without data', '/api/ranking?genre=all&period=24h&tag=nothing', () => workerEnv(), 200],
  ['a missing ranking', '/api/ranking?genre=music&period=hour', () => workerEnv(), 404],
  ['a rate limited ranking', '/api/ranking', () => workerEnv({ RATE_LIMITER: { limit: vi.fn(async () => ({ success: false })) } }), 429],
  ['an R2 error on a ranking', '/api/ranking', () => workerEnv({ R2_BUCKET: failingBucket() }), 500],
  ['the metadata', '/api/metadata', () => workerEnv(), 200],
  ['missing metadata', '/api/metadata', () => workerEnv({ R2_BUCKET: r2Bucket({}) }), 200],
  ['an R2 error on the metadata', '/api/metadata', () => workerEnv({ R2_BUCKET: failingBucket() }), 200],
]

describe('blue ranking and metadata cache headers', () => {
  it.each(UNCACHEABLE_CASES)('answers %s with no-store for browsers and CDNs', async (_label, path, env, status) => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined)

    const response = await fetchBlue(get(path), env(), ctx)

    expect(response.status).toBe(status)
    expect(noStoreHeaders(response)).toEqual(['no-store', 'no-store', 'no-store'])
  })
})

describe('blue passthrough to the site', () => {
  function stubUpstream(response: Response) {
    const upstream = vi.fn(async (_request: Request) => response)
    vi.stubGlobal('fetch', upstream)
    return upstream
  }

  it.each([
    '/api/popular-tags?genre=game&period=24h',
    `/api/tags/autocomplete?q=${encodeURIComponent('ずん')}&limit=10`,
    '/api/hd-thumbnail/sm9',
  ])('relays %s to Vercel without the worker secret and without reading R2', async (path) => {
    const upstream = stubUpstream(Response.json({ ok: true }, { headers: { 'Cache-Control': 'public, max-age=300' } }))
    const bucket = publishedBucket()

    const response = await fetchBlue(get(path, { 'X-Worker-Auth': 'client-supplied-guess' }), workerEnv({ R2_BUCKET: bucket }), ctx)

    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({ ok: true })
    expect(upstream).toHaveBeenCalledTimes(1)
    const sent = upstream.mock.calls[0][0]
    expect(sent.url).toBe(`https://upstream.example${path}`)
    expect(sent.headers.get('X-Worker-Auth')).toBeNull()
    expect(sent.headers.get('X-Forwarded-Host')).toBe('nico-rank.com')
    expect(response.headers.get('Cache-Control')).toBe('public, max-age=300')
    expect(response.headers.get('Access-Control-Allow-Origin')).toBe(SITE)
    expect(response.headers.get('X-Frame-Options')).toBe('DENY')
    expect(bucket.get).not.toHaveBeenCalled()
  })

  it('answers 502 when the site cannot be reached', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined)
    vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('connect failed') }))

    const response = await fetchBlue(get('/api/popular-tags'), workerEnv(), ctx)

    expect(response.status).toBe(502)
  })

  it.each(['GET', 'HEAD'])('relays %s admin requests only to Vercel with no-store and no CORS', async (method) => {
    const upstream = stubUpstream(
      new Response(null, { status: 401, headers: { 'WWW-Authenticate': 'Basic realm="Admin Area"' } }),
    )
    const bucket = publishedBucket()
    const limit = vi.fn(async () => ({ success: true }))

    const response = await fetchBlue(
      new Request(`${SITE}/api/admin/ng-list`, { method, headers: { Origin: SITE } }),
      workerEnv({ R2_BUCKET: bucket, RATE_LIMITER: { limit } }),
      ctx,
    )

    expect(response.status).toBe(401)
    expect(response.headers.get('WWW-Authenticate')).toBe('Basic realm="Admin Area"')
    expect(response.headers.get('Cache-Control')).toContain('no-store')
    expect(response.headers.get('Access-Control-Allow-Origin')).toBeNull()
    expect(upstream.mock.calls[0][0].url).toBe('https://upstream.example/api/admin/ng-list')
    expect(bucket.get).not.toHaveBeenCalled()
    expect(limit).not.toHaveBeenCalled()
  })
})

describe('blue /api/debug', () => {
  it('answers 404 without the worker key and does not echo request headers', async () => {
    const response = await fetchBlue(get('/api/debug', { Cookie: 'session=synthetic' }), workerEnv(), ctx)

    expect(response.status).toBe(404)
    expect(await response.text()).toBe('Not Found')
    // 監視は HEAD で版の名前を読む
    expect(response.headers.get('X-Worker-Version')).toBe(BLUE_VERSION)
  })

  it('answers the worker identity with the worker key', async () => {
    const response = await fetchBlue(
      get('/api/debug', { 'X-Worker-Auth': 'test-only-worker-key', Cookie: 'session=synthetic' }),
      workerEnv(),
      ctx,
    )

    expect(response.status).toBe(200)
    const body = await response.json()
    expect(body).toMatchObject({ worker: 'api-gateway-blue-20250706', version: BLUE_VERSION })
    expect(JSON.stringify(body)).not.toContain('synthetic')
    expect(response.headers.get('Cache-Control')).toBe('no-store')
  })
})

function routerEnv(
  flag: string | null,
  greenFetch: (request: Request) => Promise<Response>,
  blueEnv: Record<string, unknown> = workerEnv(),
) {
  return {
    MAINTENANCE_FLAGS: { get: vi.fn(async () => flag) },
    WORKER_GREEN: { fetch: vi.fn(greenFetch) },
    WORKER_BLUE: { fetch: vi.fn((request: Request) => fetchBlue(request, blueEnv, ctx)) },
    VERCEL_DEPLOYMENT_URL: 'https://upstream.example',
  }
}

async function greenThrows(): Promise<Response> {
  throw new Error('Worker threw exception')
}

describe('blue and green parity on the same R2 data', () => {
  const PARITY_HEADERS = [
    'content-type',
    'cache-control',
    'cdn-cache-control',
    'vercel-cdn-cache-control',
    'etag',
    'x-ranking-generation',
    'x-data-source',
    'access-control-allow-origin',
  ]

  /**
   * 利用者が受け取る応答で比べる: ルーターを通った Green と、Green が例外になりルーターがフォールバックした Blue。
   * ルーターは Green の応答だけ no-store に書き換えるので、キャッシュのヘッダーもこの形で揃っていなければならない
   */
  async function both(path: string, headers: Record<string, string> = {}) {
    vi.spyOn(console, 'error').mockImplementation(() => undefined)
    // 同じ内容の別々のバケットを渡す（呼び出しの記録や本文を共有しない）
    const greenEnv = routerEnv('green', (request) => fetchGreen(request, workerEnv(), ctx))
    const greenResponse = await fetchRouter(get(path, headers), greenEnv, ctx)
    const blueResponse = await fetchRouter(get(path, headers), routerEnv('green', greenThrows), ctx)
    expect(greenResponse.headers.get('X-Active-Worker')).toBe('green')
    expect(blueResponse.headers.get('X-Active-Worker')).toBe('blue-fallback')
    return { greenResponse, blueResponse }
  }

  it.each([
    ['a genre ranking', '/api/ranking?genre=all&period=24h'],
    ['the default ranking', '/api/ranking'],
    ['a tag ranking', `/api/ranking?genre=game&period=24h&tag=${encodeURIComponent(TAG)}`],
    ['a tag without data', '/api/ranking?genre=all&period=24h&tag=nothing'],
    ['a missing ranking', '/api/ranking?genre=music&period=hour'],
    ['the metadata', '/api/metadata'],
  ])('returns the same status, body and cache headers for %s through the router', async (_label, path) => {
    const { greenResponse, blueResponse } = await both(path)

    expect(blueResponse.status).toBe(greenResponse.status)
    expect(await blueResponse.json()).toEqual(await greenResponse.json())
    for (const name of PARITY_HEADERS) {
      expect([name, blueResponse.headers.get(name)]).toEqual([name, greenResponse.headers.get(name)])
    }
    // 版の名前でどちらが答えたかを見分けられる
    expect(greenResponse.headers.get('X-Worker-Version')).toMatch(/^green-/)
    expect(blueResponse.headers.get('X-Worker-Version')).toBe(BLUE_VERSION)
  })

  it('returns the same metadata body and generation', async () => {
    const { greenResponse, blueResponse } = await both('/api/metadata')

    expect(blueResponse.status).toBe(greenResponse.status)
    expect(await blueResponse.text()).toBe(await greenResponse.text())
    expect(blueResponse.headers.get('X-Ranking-Generation')).toBe(greenResponse.headers.get('X-Ranking-Generation'))
    expect(blueResponse.headers.get('ETag')).toBe(greenResponse.headers.get('ETag'))
  })

  it('answers 304 to the same If-None-Match', async () => {
    const etag = (await fetchGreen(get('/api/ranking'), workerEnv(), ctx)).headers.get('ETag') ?? ''

    const { greenResponse, blueResponse } = await both('/api/ranking', { 'If-None-Match': etag })

    expect(greenResponse.status).toBe(304)
    expect(blueResponse.status).toBe(304)
  })
})

describe('router with the real Blue worker', () => {
  it.each([null, 'blue'])('serves ranking items when active_worker is %s', async (flag) => {
    const env = routerEnv(flag, async () => Response.json({ items: [] }))

    const response = await fetchRouter(get('/api/ranking?genre=all&period=24h'), env, ctx)

    expect(response.status).toBe(200)
    expect((await response.json()).items).toHaveLength(2)
    expect(response.headers.get('X-Active-Worker')).toBe(flag ?? 'blue')
    expect(env.WORKER_GREEN.fetch).not.toHaveBeenCalled()
  })

  it('serves ranking items without caching when Green throws and the router falls back', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined)
    const env = routerEnv('green', greenThrows)

    const response = await fetchRouter(get('/api/ranking?genre=all&period=24h'), env, ctx)

    expect(response.status).toBe(200)
    expect((await response.json()).items).toHaveLength(2)
    expect(response.headers.get('X-Active-Worker')).toBe('blue-fallback')
    // フォールバックではルーターが no-store を付け直さない
    expect(response.headers.get('Cache-Control')).toBe('no-store')
    expect(response.headers.get('X-Worker-Version')).toBe(BLUE_VERSION)
  })

  it.each(UNCACHEABLE_CASES)('keeps %s uncacheable when the router falls back to Blue', async (_label, path, blueEnv, status) => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined)
    const env = routerEnv('green', greenThrows, blueEnv())

    const response = await fetchRouter(get(path), env, ctx)

    expect(response.status).toBe(status)
    expect(response.headers.get('X-Active-Worker')).toBe('blue-fallback')
    expect(noStoreHeaders(response)).toEqual(['no-store', 'no-store', 'no-store'])
  })

  it('does not count a fallback replay twice against the rate limiter that Green and Blue share', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined)
    // 本番と同じく 1 つの namespace（1001）を両方の Worker が使う。ここでは上限を 1 回にして、二重に数えると 429 になるようにする
    const counts = new Map<string, number>()
    const limit = vi.fn(async ({ key }: { key: string }) => {
      const count = (counts.get(key) ?? 0) + 1
      counts.set(key, count)
      return { success: count <= 1 }
    })
    const greenEnv = workerEnv({ RATE_LIMITER: { limit } })
    // 本物の Green が数えて応答を作り終えたあとで、Worker の呼び出しが例外になる
    const env = routerEnv('green', async (request) => {
      await fetchGreen(request, greenEnv, ctx)
      throw new Error('Worker exceeded resource limits')
    }, workerEnv({ RATE_LIMITER: { limit } }))

    const response = await fetchRouter(get('/api/ranking', { 'CF-Connecting-IP': '203.0.113.7' }), env, ctx)

    expect(response.status).toBe(200)
    expect(response.headers.get('X-Active-Worker')).toBe('blue-fallback')
    expect(limit.mock.calls.map(([options]) => options.key)).toEqual(['203.0.113.7:ranking', '203.0.113.7:ranking:blue'])
  })
})
