// @vitest-environment node
import { afterEach, describe, expect, it, vi } from 'vitest'

vi.mock('../../workers/sentry.js', () => ({
  Sentry: { withSentry: (_options: unknown, handler: unknown) => handler },
  createWorkerSentryOptions: vi.fn(),
  captureWorkerException: vi.fn(),
  sanitizeUrlForSentry: vi.fn(),
}))

import router from '../../workers/smart-router-20250706'

function fixture(activeWorker: string | null = 'green') {
  const kv = vi.fn().mockResolvedValue(activeWorker)
  const green = vi.fn(async () => new Response('green'))
  const blue = vi.fn(async () => new Response('blue'))
  const env = {
    MAINTENANCE_FLAGS: { get: kv },
    WORKER_GREEN: { fetch: green },
    WORKER_BLUE: { fetch: blue },
    VERCEL_DEPLOYMENT_URL: 'https://upstream.example',
    WORKER_AUTH_KEY: 'synthetic-key',
  }
  type Fetch = NonNullable<typeof router.fetch>
  // Only the binding methods used here are mocked; synthetic requests have no CF metadata.
  const run = (path: string, init?: RequestInit) =>
    router.fetch!(
      new Request(`https://nico-rank.com${path}`, init) as Parameters<Fetch>[0],
      env as unknown as Parameters<Fetch>[1],
      { waitUntil: vi.fn() } as unknown as Parameters<Fetch>[2],
    )
  return { kv, green, blue, run }
}

afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

describe('non-API routing without KV', () => {
  it.each([
    ['/', true],
    ['/ranking?genre=game', true],
    ['/_next/static/chunks/app.js', false],
    ['/_next/static/css/app.css', false],
    ['/fonts/font.woff2', false],
    ['/favicon.ico', false],
    ['/_next/image?url=test&w=128&q=75', false],
  ])(
    'proxies %s directly and preserves cache/security behavior',
    async (path, html) => {
      const upstream = vi.fn(
        async (_request: Request) =>
          new Response('origin-body', {
            headers: {
              'Cache-Control': 'public, max-age=31536000, immutable',
              ETag: '"asset-v1"',
              'Access-Control-Allow-Origin': '*',
            },
          }),
      )
      vi.stubGlobal('fetch', upstream)
      const { kv, green, blue, run } = fixture()
      // A KV outage must not affect a path that does not need the routing flag.
      kv.mockRejectedValue(new Error('KV unavailable'))

      const response = await run(path, {
        headers: {
          Origin: 'https://nico-rank.com',
          'X-Worker-Auth': 'untrusted',
        },
      })

      expect(kv).not.toHaveBeenCalled()
      expect(green).not.toHaveBeenCalled()
      expect(blue).not.toHaveBeenCalled()
      expect(upstream).toHaveBeenCalledTimes(1)
      const sent = upstream.mock.calls[0][0]
      expect(sent.url).toBe(`https://upstream.example${path}`)
      expect(sent.headers.get('X-Worker-Auth')).toBeNull()
      expect(sent.headers.get('X-Forwarded-Host')).toBe('nico-rank.com')
      expect(response.status).toBe(200)
      expect(await response.text()).toBe('origin-body')
      expect(response.headers.get('X-Active-Worker')).toBeNull()
      expect(response.headers.get('X-Router-Version')).toBeTruthy()
      expect(response.headers.get('Access-Control-Allow-Origin')).toBe(
        'https://nico-rank.com',
      )
      expect(response.headers.get('X-Content-Type-Options')).toBe('nosniff')
      expect(response.headers.get('Content-Security-Policy')).toContain(
        "frame-ancestors 'none'",
      )
      expect(response.headers.get('ETag')).toBe('"asset-v1"')
      expect(response.headers.get('Cache-Control')).toBe(
        html
          ? 'no-store, must-revalidate'
          : 'public, max-age=31536000, immutable',
      )
      expect(response.headers.get('CDN-Cache-Control')).toBe(
        html ? 'no-store' : null,
      )
      expect(response.headers.get('Vercel-CDN-Cache-Control')).toBe(
        html ? 'no-store' : null,
      )
    },
  )

  it.each([304, 401, 404, 503])(
    'preserves upstream status %s without invoking KV or API workers',
    async (status) => {
      vi.stubGlobal(
        'fetch',
        vi.fn(async () => new Response(null, { status })),
      )
      const { kv, green, blue, run } = fixture()
      const response = await run('/_next/static/chunks/app.js', {
        method: 'HEAD',
      })
      expect(response.status).toBe(status)
      expect(response.body).toBeNull()
      expect(kv).not.toHaveBeenCalled()
      expect(green).not.toHaveBeenCalled()
      expect(blue).not.toHaveBeenCalled()
    },
  )

  it('forwards non-API POST once with its body and credentials preserved', async () => {
    const upstream = vi.fn(async (_request: Request) => new Response('ok'))
    vi.stubGlobal('fetch', upstream)
    const { kv, green, blue, run } = fixture()
    await run('/_vercel/insights/view', {
      method: 'POST',
      body: 'synthetic-payload',
      headers: {
        Cookie: 'session=synthetic',
        Authorization: 'Basic synthetic',
      },
    })
    expect(upstream).toHaveBeenCalledTimes(1)
    const sent = upstream.mock.calls[0][0]
    expect(sent.method).toBe('POST')
    expect(await sent.text()).toBe('synthetic-payload')
    expect(sent.headers.get('Cookie')).toBe('session=synthetic')
    expect(sent.headers.get('Authorization')).toBe('Basic synthetic')
    expect(kv).not.toHaveBeenCalled()
    expect(green).not.toHaveBeenCalled()
    expect(blue).not.toHaveBeenCalled()
  })

  it.each(['GET', 'POST'])(
    'retains existing %s behavior when the origin throws',
    async (method) => {
      vi.spyOn(console, 'error').mockImplementation(() => {})
      vi.stubGlobal(
        'fetch',
        vi.fn().mockRejectedValue(new Error('origin unavailable')),
      )
      const { kv, green, blue, run } = fixture()
      const response = await run('/', { method })
      expect(kv).not.toHaveBeenCalled()
      expect(green).not.toHaveBeenCalled()
      if (method === 'GET') {
        expect(blue).toHaveBeenCalledTimes(1)
        expect(response.headers.get('X-Active-Worker')).toBe('blue-fallback')
        expect(await response.text()).toBe('blue')
      } else {
        expect(blue).not.toHaveBeenCalled()
        expect(response.status).toBe(502)
        expect(response.headers.get('Cache-Control')).toContain('no-store')
      }
    },
  )
})

describe('API routing still reads the current flag', () => {
  it.each(['green', 'blue', null])(
    'uses %s with one read per request',
    async (active) => {
      const { kv, green, blue, run } = fixture(active)
      const response = await run('/api/ranking?genre=all&period=24h')
      expect(kv).toHaveBeenCalledExactlyOnceWith('active_worker')
      expect(active === 'green' ? green : blue).toHaveBeenCalledTimes(1)
      expect(active === 'green' ? blue : green).not.toHaveBeenCalled()
      expect(response.headers.get('X-Active-Worker')).toBe(active || 'blue')
      expect(response.headers.get('Cache-Control')).toBe('no-store')
      expect(response.headers.get('CDN-Cache-Control')).toBe('no-store')
      expect(response.headers.get('Vercel-CDN-Cache-Control')).toBe('no-store')
    },
  )

  it('observes a green-to-blue switch on the very next request', async () => {
    const { kv, green, blue, run } = fixture()
    kv.mockResolvedValueOnce('green').mockResolvedValueOnce('blue')
    expect((await run('/api/public')).headers.get('X-Active-Worker')).toBe(
      'green',
    )
    expect((await run('/api/public')).headers.get('X-Active-Worker')).toBe(
      'blue',
    )
    expect(kv).toHaveBeenCalledTimes(2)
    expect(green).toHaveBeenCalledTimes(1)
    expect(blue).toHaveBeenCalledTimes(1)
  })

  it('retains blue fallback on an API KV failure', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    const { kv, green, blue, run } = fixture()
    kv.mockRejectedValue(new Error('KV unavailable'))
    const response = await run('/api/ranking')
    expect(green).not.toHaveBeenCalled()
    expect(blue).toHaveBeenCalledTimes(1)
    expect(response.headers.get('X-Active-Worker')).toBe('blue-fallback')
  })

  it.each([
    ['/api/ranking', 'OPTIONS', 204],
    ['/api/debug', 'GET', 404],
  ])(
    'still short-circuits %s %s before reading KV',
    async (path, method, status) => {
      const { kv, green, blue, run } = fixture()
      const response = await run(path, { method })
      expect(response.status).toBe(status)
      expect(kv).not.toHaveBeenCalled()
      expect(green).not.toHaveBeenCalled()
      expect(blue).not.toHaveBeenCalled()
    },
  )
})
