// @vitest-environment node
import { afterEach, describe, expect, it, vi } from 'vitest'

vi.mock('../../workers/sentry.js', () => ({
  Sentry: { withSentry: (_options: unknown, handler: unknown) => handler },
  createWorkerSentryOptions: vi.fn(),
  captureWorkerException: vi.fn(),
  sanitizeUrlForSentry: vi.fn(),
}))

import worker from '../../workers/api-gateway-green-20250726'
import { captureWorkerException } from '../../workers/sentry.js'

const fetchWorker = worker.fetch as unknown as (
  request: Request,
  env: Record<string, unknown>,
  ctx: { waitUntil: (promise: Promise<unknown>) => void },
) => Promise<Response>

const ctx = { waitUntil: vi.fn() }

function greenEnv(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    R2_BUCKET: { get: vi.fn(async () => null) },
    RATE_LIMITER: { limit: vi.fn(async () => ({ success: true })) },
    VERCEL_DEPLOYMENT_URL: 'https://upstream.example',
    WORKER_AUTH_KEY: 'test-only-worker-key',
    ...overrides,
  }
}

function stubUpstream(...responses: Response[]) {
  const upstream = vi.fn(async (input: Request | string, _init?: RequestInit) => {
    void input
    return responses.shift() ?? new Response('unexpected', { status: 599 })
  })
  vi.stubGlobal('fetch', upstream)
  return upstream
}

function requestedUrl(call: [Request | string, RequestInit?]): string {
  const [input] = call
  return typeof input === 'string' ? input : input.url
}

function requestedHeaders(call: [Request | string, RequestInit?]): Headers {
  const [input, init] = call
  return typeof input === 'string' ? new Headers(init?.headers) : input.headers
}

afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

const RANKING_KEY = 'rankings/all/24h/all.json'
const r2InternalError = () => new Error('get: We encountered an internal error. Please try again. (10001)')

function rankingObject() {
  const body = JSON.stringify({
    items: [{ id: 'sm1', title: 'Synthetic &amp; title' }],
    popularTags: [],
    metadata: { updatedAt: '2026-01-01T00:00:00.000Z' },
  })
  return { etag: 'synthetic', httpMetadata: {}, body: new Response(body).body }
}

/** R2 get that fails `failures` times for `failingKey`, then serves the legacy ranking object. */
function flakyBucket(failingKey: string, failures: number, error: () => Error = r2InternalError) {
  let remaining = failures
  return {
    get: vi.fn(async (key: string) => {
      if (key === failingKey && remaining > 0) {
        remaining--
        throw error()
      }
      return key === RANKING_KEY ? rankingObject() : null
    }),
  }
}

function getCalls(bucket: { get: ReturnType<typeof vi.fn> }, key: string): number {
  return bucket.get.mock.calls.filter(([requested]) => requested === key).length
}

describe('green R2 reads', () => {
  it.each([
    ['the ranking object', RANKING_KEY],
    ['the generation pointer', 'rankings/current.json'],
  ])('retries a transient R2 internal error while reading %s', async (_label, key) => {
    const bucket = flakyBucket(key, 1)

    const response = await fetchWorker(
      new Request('https://nico-rank.com/api/ranking?genre=all&period=24h'),
      greenEnv({ R2_BUCKET: bucket }),
      ctx,
    )

    expect(response.status).toBe(200)
    expect((await response.json()).items[0].title).toBe('Synthetic & title')
    expect(getCalls(bucket, key)).toBe(2)
  })

  it('retries a 503 (10043) as well', async () => {
    const bucket = flakyBucket(RANKING_KEY, 1, () => new Error('get: Service unavailable. (10043)'))

    const response = await fetchWorker(new Request('https://nico-rank.com/api/ranking'), greenEnv({ R2_BUCKET: bucket }), ctx)

    expect(response.status).toBe(200)
    expect(getCalls(bucket, RANKING_KEY)).toBe(2)
  })

  it('gives up after two retries', async () => {
    const bucket = flakyBucket(RANKING_KEY, 5)

    const response = await fetchWorker(new Request('https://nico-rank.com/api/ranking'), greenEnv({ R2_BUCKET: bucket }), ctx)

    expect(response.status).toBe(500)
    expect(getCalls(bucket, RANKING_KEY)).toBe(3)
  })

  it('does not retry errors that are not transient', async () => {
    const bucket = flakyBucket(RANKING_KEY, 5, () => new Error('get: Access denied. (10003)'))

    const response = await fetchWorker(new Request('https://nico-rank.com/api/ranking'), greenEnv({ R2_BUCKET: bucket }), ctx)

    expect(response.status).toBe(500)
    expect(getCalls(bucket, RANKING_KEY)).toBe(1)
  })
})

describe('green upstream proxy', () => {
  it('does not send the worker secret to the upstream deployment', async () => {
    const upstream = stubUpstream(Response.json({ popularTags: [] }))

    const response = await fetchWorker(
      new Request('https://nico-rank.com/api/popular-tags?genre=all', {
        headers: { 'X-Worker-Auth': 'client-supplied-guess' },
      }),
      greenEnv(),
      ctx,
    )

    expect(response.status).toBe(200)
    expect(upstream).toHaveBeenCalledTimes(1)
    expect(requestedUrl(upstream.mock.calls[0])).toBe('https://upstream.example/api/popular-tags?genre=all')
    expect(requestedHeaders(upstream.mock.calls[0]).get('X-Worker-Auth')).toBeNull()
  })
})

describe('green HD thumbnail', () => {
  const page = (ogImage: string) =>
    new Response(`<html><head><meta property="og:image" content="${ogImage}"></head></html>`, {
      headers: { 'Content-Type': 'text/html' },
    })
  const JP_OG_IMAGE = 'https://img.cdn.nimg.jp/s/nicovideo/thumbnails/1/1.1.original/r1280x720l?key=synthetic'

  async function hdThumbnail(videoId: string) {
    const response = await fetchWorker(new Request(`https://nico-rank.com/api/hd-thumbnail/${videoId}`), greenEnv(), ctx)
    return { response, body: (await response.json()) as { thumbnail: string | null; source: string } }
  }

  it.each([
    'javascript:alert(document.domain)',
    'http://nicovideo.cdn.nimg.jp/thumbnails/1/1.1',
    'https://elsewhere.example/thumbnails/1/1.1',
    'https://nicovideo.cdn.nimg.jp.elsewhere.example/thumbnails/1/1.1',
  ])('does not return the mirror og:image %s and reads nicovideo.jp instead', async (ogImage) => {
    const upstream = stubUpstream(page(ogImage), page(JP_OG_IMAGE))

    const { response, body } = await hdThumbnail('sm1')

    expect(response.status).toBe(200)
    expect(body.thumbnail).toBe(JP_OG_IMAGE)
    expect(body.source).toBe('nicovideo.jp og:image')
    expect(requestedUrl(upstream.mock.calls[0])).toBe('https://www.nicovideo.gay/watch/sm1')
    expect(requestedUrl(upstream.mock.calls[1])).toBe('https://www.nicovideo.jp/watch/sm1')
  })

  it('uses a mirror og:image on the thumbnail CDN', async () => {
    const upstream = stubUpstream(page('https://nicovideo.cdn.nimg.jp/thumbnails/1/1.12345'))

    const { body } = await hdThumbnail('sm1')

    expect(upstream).toHaveBeenCalledTimes(1)
    expect(body.thumbnail).toBe('https://nicovideo.cdn.nimg.jp/thumbnails/1/1.12345.original')
    expect(body.source).toBe('nicovideo.gay og:image')
  })

  it('bounds each source with a timeout and falls back when the mirror fails', async () => {
    const upstream = vi.fn(async (input: string, init?: RequestInit) => {
      expect(init?.signal).toBeInstanceOf(AbortSignal)
      if (input.startsWith('https://www.nicovideo.gay/')) throw new DOMException('The operation timed out.', 'TimeoutError')
      return page(JP_OG_IMAGE)
    })
    vi.stubGlobal('fetch', upstream)

    const { body } = await hdThumbnail('sm1')

    expect(upstream).toHaveBeenCalledTimes(2)
    expect(body.thumbnail).toBe(JP_OG_IMAGE)
  })

  it('answers thumbnail null when no source has a thumbnail CDN URL', async () => {
    stubUpstream(page('javascript:alert(1)'), page('https://elsewhere.example/x.jpg'))

    const { response, body } = await hdThumbnail('sm1')

    expect(response.status).toBe(200)
    expect(body.thumbnail).toBeNull()
  })

  it('reads so videos from nicovideo.jp directly, as the site route does', async () => {
    const upstream = stubUpstream(page(JP_OG_IMAGE))

    const { body } = await hdThumbnail('so1')

    expect(upstream).toHaveBeenCalledTimes(1)
    expect(requestedUrl(upstream.mock.calls[0])).toBe('https://www.nicovideo.jp/watch/so1')
    expect(body.thumbnail).toBe(JP_OG_IMAGE)
  })
})


describe('green logging', () => {
  it.each([
    ['a tag without data', null],
    ['a tag with data', rankingObject],
  ])('keeps the requested tag out of console output for %s (console lines become Sentry breadcrumbs)', async (_label, object) => {
    const lines: string[] = []
    for (const level of ['log', 'warn', 'error'] as const) {
      vi.spyOn(console, level).mockImplementation((...args: unknown[]) => {
        lines.push(args.map(String).join(' '))
      })
    }
    const tag = 'synthetic private tag'
    const bucket = { get: vi.fn(async (key: string) => (key.includes('/tags/') && object ? object() : null)) }

    const response = await fetchWorker(
      new Request(`https://nico-rank.com/api/ranking?genre=all&period=24h&tag=${encodeURIComponent(tag)}`),
      greenEnv({ R2_BUCKET: bucket }),
      ctx,
    )

    expect(response.status).toBe(200)
    expect(lines.length).toBeGreaterThan(0)
    expect(lines.join('\n')).not.toContain(tag)
    expect(lines.join('\n')).not.toContain(encodeURIComponent(tag))
  })
})

describe('green tag autocomplete', () => {
  const tags = Array.from({ length: 80 }, (_, i) => `syn${String(i).padStart(2, '0')}`)
  const TAG_KEY = 'tag-accumulation.json'
  const TTL_MS = 10 * 60 * 1000

  function tagObject(body: string) {
    return { httpMetadata: {}, arrayBuffer: async () => new TextEncoder().encode(body).buffer }
  }

  function accumulation(list: unknown[], lastUpdated = '2026-01-01T00:00:00.000Z'): string {
    return JSON.stringify({ tags: list, metadata: { lastUpdated, totalUniqueTags: list.length } })
  }

  /** 1 回目の get から順に、本文（文字列）・null（オブジェクトなし）・Error（読み取り失敗）を返す */
  function sequenceBucket(...answers: Array<string | null | Error>) {
    let last: string | null | Error = null
    return {
      get: vi.fn(async (key: string) => {
        if (key !== TAG_KEY) return null
        const next = answers.length > 0 ? answers.shift() ?? null : last
        last = next
        if (next instanceof Error) throw next
        return next === null ? null : tagObject(next)
      }),
    }
  }

  const tagBucket = () => sequenceBucket(accumulation(tags))

  function autocomplete(query: string, bucket: { get: ReturnType<typeof vi.fn> }, headers: Record<string, string> = {}) {
    return fetchWorker(
      new Request(`https://nico-rank.com/api/tags/autocomplete?${query}`, { headers }),
      greenEnv({ R2_BUCKET: bucket }),
      ctx,
    )
  }

  async function suggestions(query: string, bucket: { get: ReturnType<typeof vi.fn> }): Promise<string[]> {
    const response = await autocomplete(query, bucket)
    expect(response.status).toBe(200)
    return ((await response.json()) as { suggestions: string[] }).suggestions
  }

  const tagReads = (bucket: { get: ReturnType<typeof vi.fn> }) => getCalls(bucket, TAG_KEY)
  // 期限切れ後の読み直しで失敗する R2 エラー（再試行の対象外）
  const deniedError = () => new Error('get: Access denied. (10003)')

  it.each([
    ['10', 10, 10],
    ['-1', 10, 10],
    ['not-a-number', 10, 10],
    ['0', 10, 10],
    ['1000', 50, 50],
    [null, 10, 10],
  ])('keeps limit=%s within 1..50', async (limit, expectedCount, expectedMax) => {
    const query = limit === null ? '' : `&limit=${limit}`
    const response = await fetchWorker(
      new Request(`https://nico-rank.com/api/tags/autocomplete?q=syn${query}`),
      greenEnv({ R2_BUCKET: tagBucket() }),
      ctx,
    )
    const body = (await response.json()) as { suggestions: string[]; metadata: { maxResults: number } }

    expect(response.status).toBe(200)
    expect(body.suggestions).toHaveLength(expectedCount)
    expect(body.metadata.maxResults).toBe(expectedMax)
  })

  it('answers the existing response shape with a 5 minute Cache-Control', async () => {
    const response = await autocomplete('q=syn0&limit=3', tagBucket(), { Origin: 'https://nico-rank.com' })

    expect(response.status).toBe(200)
    expect(response.headers.get('Cache-Control')).toBe('public, max-age=300')
    expect(response.headers.get('Access-Control-Allow-Origin')).toBe('https://nico-rank.com')
    expect(response.headers.get('X-Content-Type-Options')).toBe('nosniff')
    expect(await response.json()).toEqual({
      query: 'syn0',
      suggestions: ['syn00', 'syn01', 'syn02'],
      metadata: {
        total: 3,
        maxResults: 3,
        source: 'r2-tag-accumulation',
        lastUpdated: '2026-01-01T00:00:00.000Z',
        totalUniqueTags: 80,
      },
    })
  })

  it('lists prefix matches before substring matches, each in dictionary order', async () => {
    const bucket = sequenceBucket(accumulation(['xsyn1', 'syn-b', 'asyn2', 'SYN-A', 'other']))

    expect(await suggestions('q=syn', bucket)).toEqual(['syn-b', 'SYN-A', 'xsyn1', 'asyn2'])
  })

  it('matches full-width input through NFKC', async () => {
    const bucket = sequenceBucket(accumulation(['ｹﾞｰﾑ実況', 'VOCALOID']))

    expect(await suggestions(`q=${encodeURIComponent('ＶＯＣＡ')}`, bucket)).toEqual(['VOCALOID'])
    expect(await suggestions(`q=${encodeURIComponent('ゲーム')}`, bucket)).toEqual(['ｹﾞｰﾑ実況'])
  })

  it('reads R2 once for repeated and concurrent requests within the TTL', async () => {
    const bucket = tagBucket()

    await Promise.all([suggestions('q=syn1', bucket), suggestions('q=syn2', bucket), suggestions('q=syn3', bucket)])
    expect(await suggestions('q=syn4&limit=2', bucket)).toEqual(['syn40', 'syn41'])

    expect(tagReads(bucket)).toBe(1)
  })

  it('keeps the shared load alive with waitUntil so a disconnected first request does not cancel it', async () => {
    const waitUntil = vi.fn()

    const response = await fetchWorker(
      new Request('https://nico-rank.com/api/tags/autocomplete?q=syn'),
      greenEnv({ R2_BUCKET: tagBucket() }),
      { waitUntil },
    )

    expect(response.status).toBe(200)
    expect(waitUntil).toHaveBeenCalledTimes(1)
    expect(waitUntil.mock.calls[0][0]).toBeInstanceOf(Promise)
  })

  it('starts a new load when the shared one has not finished within 30 seconds', async () => {
    const now = vi.spyOn(Date, 'now').mockReturnValue(4_000_000)
    let calls = 0
    const bucket = {
      get: vi.fn((key: string) => {
        if (key !== TAG_KEY) return Promise.resolve(null)
        calls++
        // 1 回目の読み込みは終わらない（始めた要求が打ち切られた場合を模す）
        return calls === 1 ? new Promise<never>(() => undefined) : Promise.resolve(tagObject(accumulation(['syn-retry'])))
      }),
    }

    // 終わらない読み込みを待つ要求は、ここでは待たない
    void autocomplete('q=syn', bucket)
    await vi.waitFor(() => expect(tagReads(bucket)).toBe(1))
    now.mockReturnValue(4_000_000 + 30_000)
    void autocomplete('q=syn', bucket)
    await new Promise((resolve) => setTimeout(resolve, 0))
    expect(tagReads(bucket)).toBe(1)

    now.mockReturnValue(4_000_000 + 30_001)
    expect(await suggestions('q=syn', bucket)).toEqual(['syn-retry'])
    expect(tagReads(bucket)).toBe(2)
  })

  it('does not share the index between R2 bindings', async () => {
    const first = sequenceBucket(accumulation(['syn-first']))
    const second = sequenceBucket(accumulation(['syn-second']))

    expect(await suggestions('q=syn', first)).toEqual(['syn-first'])
    expect(await suggestions('q=syn', second)).toEqual(['syn-second'])
  })

  it('reloads the dictionary after the TTL', async () => {
    const now = vi.spyOn(Date, 'now').mockReturnValue(1_000_000)
    const bucket = sequenceBucket(accumulation(['syn-old']), accumulation(['syn-new']))

    expect(await suggestions('q=syn', bucket)).toEqual(['syn-old'])
    now.mockReturnValue(1_000_000 + TTL_MS - 1)
    expect(await suggestions('q=syn', bucket)).toEqual(['syn-old'])
    expect(tagReads(bucket)).toBe(1)

    now.mockReturnValue(1_000_000 + TTL_MS)
    expect(await suggestions('q=syn', bucket)).toEqual(['syn-new'])
    expect(tagReads(bucket)).toBe(2)
  })

  it.each([
    ['an R2 error', deniedError(), 'r2-read'],
    ['unparsable JSON', '{"tags": [', 'r2-parse'],
    ['data without a tags array', JSON.stringify({ tags: 'syn-broken' }), 'r2-parse'],
    ['a missing object', null, null],
  ])('keeps serving the previous index when a refresh hits %s', async (_label, failure, upstreamKind) => {
    vi.mocked(captureWorkerException).mockClear()
    const lines: string[] = []
    vi.spyOn(console, 'error').mockImplementation((...args: unknown[]) => {
      lines.push(args.map(String).join(' '))
    })
    const now = vi.spyOn(Date, 'now').mockReturnValue(2_000_000)
    const bucket = sequenceBucket(accumulation(['syn-kept']), failure)

    expect(await suggestions('q=syn-private', bucket)).toEqual([])
    now.mockReturnValue(2_000_000 + TTL_MS)
    const response = await autocomplete('q=syn-private', bucket)

    expect(response.status).toBe(200)
    expect(response.headers.get('Cache-Control')).toBe('public, max-age=300')
    expect(((await response.json()) as { suggestions: string[] }).suggestions).toEqual([])
    expect(await suggestions('q=syn', bucket)).toEqual(['syn-kept'])
    expect(tagReads(bucket)).toBe(2)
    if (upstreamKind) {
      expect(captureWorkerException).toHaveBeenCalledTimes(1)
      expect(vi.mocked(captureWorkerException).mock.calls[0][1]).toMatchObject({ tags: { upstream_kind: upstreamKind } })
    } else {
      expect(captureWorkerException).not.toHaveBeenCalled()
    }
    // 利用者のクエリはログに残さない
    expect(lines.join('\n')).not.toContain('syn-private')
  })

  it('waits a minute before retrying after a failed refresh, then picks up new data', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined)
    const now = vi.spyOn(Date, 'now').mockReturnValue(3_000_000)
    const bucket = sequenceBucket(accumulation(['syn-kept']), deniedError(), accumulation(['syn-fresh']))

    await suggestions('q=syn', bucket)
    now.mockReturnValue(3_000_000 + TTL_MS)
    expect(await suggestions('q=syn', bucket)).toEqual(['syn-kept'])
    now.mockReturnValue(3_000_000 + TTL_MS + 59_999)
    expect(await suggestions('q=syn', bucket)).toEqual(['syn-kept'])
    expect(tagReads(bucket)).toBe(2)

    now.mockReturnValue(3_000_000 + TTL_MS + 60_000)
    expect(await suggestions('q=syn', bucket)).toEqual(['syn-fresh'])
    expect(tagReads(bucket)).toBe(3)
  })

  it('answers tag-data-not-found with a 1 minute Cache-Control when there is no index yet', async () => {
    const response = await autocomplete('q=syn', sequenceBucket(null))

    expect(response.status).toBe(200)
    expect(response.headers.get('Cache-Control')).toBe('public, max-age=60')
    expect(((await response.json()) as { metadata: { source: string } }).metadata.source).toBe('tag-data-not-found')
  })

  it('answers parse-error 500 without caching when there is no index yet', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined)
    vi.mocked(captureWorkerException).mockClear()

    const response = await autocomplete('q=syn', sequenceBucket('not json'))

    expect(response.status).toBe(500)
    expect(response.headers.get('Cache-Control')).toBe('no-cache')
    expect(((await response.json()) as { metadata: { source: string } }).metadata.source).toBe('parse-error')
    expect(captureWorkerException).toHaveBeenCalledTimes(1)
  })

  it('answers 500 for an R2 error when there is no index yet', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined)

    const response = await autocomplete('q=syn', sequenceBucket(deniedError()))

    expect(response.status).toBe(500)
    expect(response.headers.get('Cache-Control')).toBe('no-cache')
    expect(((await response.json()) as { metadata: { source: string } }).metadata.source).toBe('error')
  })

  it.each([
    ['q=s', 'query-too-short'],
    ['q=%20%20s%20%20', 'query-too-short'],
    ['', 'query-too-short'],
    [`q=${'a'.repeat(101)}`, 'query-too-long'],
    [`q=%20${'a'.repeat(101)}%20`, 'query-too-long'],
  ])('answers %s without reading R2 (%s)', async (query, source) => {
    const bucket = tagBucket()

    const response = await autocomplete(query, bucket)
    const body = (await response.json()) as { suggestions: string[]; metadata: { total: number; source: string } }

    expect(response.status).toBe(200)
    expect(response.headers.get('Cache-Control')).toBe('public, max-age=300')
    expect(body.suggestions).toEqual([])
    expect(body.metadata).toEqual({ total: 0, source })
    expect(bucket.get).not.toHaveBeenCalled()
  })

  it('still searches a query of exactly 100 characters', async () => {
    const bucket = tagBucket()

    expect(await suggestions(`q=%20${'a'.repeat(100)}%20`, bucket)).toEqual([])
    expect(tagReads(bucket)).toBe(1)
  })
})
