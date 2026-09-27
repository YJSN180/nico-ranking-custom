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

  it('passes a redirect to another host to the client instead of fetching it with client credentials', async () => {
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
    expect(response.status).toBe(302)
    expect(response.headers.get('Location')).toBe('https://elsewhere.example/collect?x=1')
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

  it('returns a redirect back to the public host unchanged', async () => {
    const upstream = stubUpstream(new Response(null, { status: 308, headers: { Location: '/api/popular-tags' } }))

    const response = await fetchWorker(new Request('https://nico-rank.com/api/popular-tags/'), greenEnv(), ctx)

    expect(upstream).toHaveBeenCalledTimes(1)
    expect(response.status).toBe(308)
    expect(response.headers.get('Location')).toBe('/api/popular-tags')
  })
})
