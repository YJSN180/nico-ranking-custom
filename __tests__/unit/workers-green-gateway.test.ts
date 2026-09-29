// @vitest-environment node
import { afterEach, describe, expect, it, vi } from 'vitest'

vi.mock('../../workers/sentry.js', () => ({
  Sentry: { withSentry: (_options: unknown, handler: unknown) => handler },
  createWorkerSentryOptions: vi.fn(),
  captureWorkerException: vi.fn(),
  sanitizeUrlForSentry: vi.fn(),
}))

import worker from '../../workers/api-gateway-green-20250726'

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

  it('rejects an admin redirect without forwarding client credentials', async () => {
    const upstream = stubUpstream(
      new Response(null, { status: 302, headers: { Location: 'https://elsewhere.example/collect?x=1' } }),
    )

    const response = await fetchWorker(
      new Request('https://nico-rank.com/api/admin/ng-list', {
        headers: { Authorization: 'Basic c3ludGhldGljOnRlc3Q=', Cookie: 'session=synthetic' },
      }),
      greenEnv(),
      ctx,
    )

    expect(upstream).toHaveBeenCalledTimes(1)
    expect(response.status).toBe(502)
    expect(response.headers.get('Location')).toBeNull()
  })

  it('still follows a redirect that stays on the upstream deployment', async () => {
    const upstream = stubUpstream(
      new Response(null, { status: 308, headers: { Location: 'https://upstream.example/api/popular-tags/' } }),
      Response.json({ popularTags: ['synthetic'] }),
    )

    const response = await fetchWorker(new Request('https://nico-rank.com/api/popular-tags'), greenEnv(), ctx)

    expect(upstream).toHaveBeenCalledTimes(2)
    expect(requestedUrl(upstream.mock.calls[1])).toBe('https://upstream.example/api/popular-tags/')
    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({ popularTags: ['synthetic'] })
  })

  it('rejects a redirect back to the public host to prevent a proxy loop', async () => {
    const upstream = stubUpstream(new Response(null, { status: 308, headers: { Location: 'https://nico-rank.com/api/popular-tags' } }))

    const response = await fetchWorker(new Request('https://nico-rank.com/api/popular-tags/'), greenEnv(), ctx)

    expect(upstream).toHaveBeenCalledTimes(1)
    expect(response.status).toBe(502)
    expect(response.headers.get('Location')).toBeNull()
  })
})

describe('green search rate limit', () => {
  const clientHeaders = { 'CF-Connecting-IP': '203.0.113.7' }

  it.each([
    ['/api/search?q=synthetic', 'search'],
    ['/api/search/owners?users=1', 'search-owners'],
    ['/api/search/realtime-tags?ids=sm1', 'search-realtime-tags'],
    ['/api/search/', 'search'],
    ['/api/%73earch/owners?users=1', 'search-owners'],
  ])('limits %s per client IP and endpoint', async (path, endpoint) => {
    const upstream = stubUpstream()
    const limiter = { limit: vi.fn(async () => ({ success: false })) }

    const response = await fetchWorker(
      new Request(`https://nico-rank.com${path}`, { headers: clientHeaders }),
      greenEnv({ SEARCH_RATE_LIMITER: limiter }),
      ctx,
    )

    expect(response.status).toBe(429)
    expect(response.headers.get('Retry-After')).toBe('60')
    expect(limiter.limit).toHaveBeenCalledWith({ key: `203.0.113.7:${endpoint}` })
    expect(upstream).not.toHaveBeenCalled()
  })

  it('forwards search requests within the limit', async () => {
    const upstream = stubUpstream(Response.json({ items: [] }))
    const limiter = { limit: vi.fn(async () => ({ success: true })) }

    const response = await fetchWorker(
      new Request('https://nico-rank.com/api/search?q=synthetic', { headers: clientHeaders }),
      greenEnv({ SEARCH_RATE_LIMITER: limiter }),
      ctx,
    )

    expect(response.status).toBe(200)
    expect(limiter.limit).toHaveBeenCalledTimes(1)
    expect(upstream).toHaveBeenCalledTimes(1)
    expect(requestedUrl(upstream.mock.calls[0])).toBe('https://upstream.example/api/search?q=synthetic')
  })

  it.each(['/api/popular-tags', '/api/searches'])('does not apply the search limit to %s', async (path) => {
    stubUpstream(Response.json({}))
    const limiter = { limit: vi.fn(async () => ({ success: false })) }

    const response = await fetchWorker(
      new Request(`https://nico-rank.com${path}`, { headers: clientHeaders }),
      greenEnv({ SEARCH_RATE_LIMITER: limiter }),
      ctx,
    )

    expect(response.status).toBe(200)
    expect(limiter.limit).not.toHaveBeenCalled()
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

describe('green per-IP limit and the site server', () => {
  const rankingRequest = (headers: Record<string, string>) =>
    new Request('https://nico-rank.com/api/ranking?genre=all&period=24h', {
      headers: { 'CF-Connecting-IP': '198.51.100.20', ...headers },
    })

  it('does not count requests that carry the worker key (site server calls share Vercel egress IPs)', async () => {
    const limiter = { limit: vi.fn(async () => ({ success: false })) }

    const response = await fetchWorker(
      rankingRequest({ 'X-Worker-Auth': 'test-only-worker-key' }),
      greenEnv({ R2_BUCKET: flakyBucket(RANKING_KEY, 0), RATE_LIMITER: limiter }),
      ctx,
    )

    expect(response.status).toBe(200)
    expect(limiter.limit).not.toHaveBeenCalled()
  })

  it.each([{ 'X-Worker-Auth': 'test-only-worker-kez' }, { 'X-Worker-Auth': '' }, {}])(
    'still limits other requests by IP (%o)',
    async (headers) => {
      const limiter = { limit: vi.fn(async () => ({ success: false })) }

      const response = await fetchWorker(
        rankingRequest(headers),
        greenEnv({ R2_BUCKET: flakyBucket(RANKING_KEY, 0), RATE_LIMITER: limiter }),
        ctx,
      )

      expect(response.status).toBe(429)
      expect(limiter.limit).toHaveBeenCalledWith({ key: '198.51.100.20:ranking' })
    },
  )

  it('limits by IP when no worker key is configured', async () => {
    const limiter = { limit: vi.fn(async () => ({ success: false })) }

    const response = await fetchWorker(
      rankingRequest({ 'X-Worker-Auth': 'undefined' }),
      greenEnv({ R2_BUCKET: flakyBucket(RANKING_KEY, 0), RATE_LIMITER: limiter, WORKER_AUTH_KEY: undefined }),
      ctx,
    )

    expect(response.status).toBe(429)
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
  const tagBucket = () => ({
    get: vi.fn(async (key: string) => {
      if (key !== 'tag-accumulation.json') return null
      const body = JSON.stringify({ tags, metadata: { lastUpdated: '2026-01-01T00:00:00.000Z', totalUniqueTags: tags.length } })
      return { httpMetadata: {}, arrayBuffer: async () => new TextEncoder().encode(body).buffer }
    }),
  })

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
})
