// @vitest-environment node
import { afterEach, describe, expect, it, vi } from 'vitest'

vi.mock('../../workers/sentry.js', () => ({
  Sentry: { withSentry: (_options: unknown, handler: unknown) => handler },
  createWorkerSentryOptions: vi.fn(),
  captureWorkerException: vi.fn(),
  sanitizeUrlForSentry: vi.fn(),
}))

import router from '../../workers/smart-router-20250706'

const fetchRouter = router.fetch as unknown as (
  request: Request,
  env: Record<string, unknown>,
  ctx: { waitUntil: (promise: Promise<unknown>) => void },
) => Promise<Response>

function routerEnv(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    MAINTENANCE_FLAGS: { get: vi.fn(async () => 'green') },
    WORKER_GREEN: { fetch: vi.fn(async () => Response.json({ ok: true })) },
    WORKER_BLUE: { fetch: vi.fn(async () => Response.json({ ok: true })) },
    VERCEL_DEPLOYMENT_URL: 'https://upstream.example',
    ...overrides,
  }
}

afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

describe('smart router upstream', () => {
  it('falls back to the production alias, not a pinned deployment, when the variable is missing', async () => {
    const upstream = vi.fn(async (_request: Request) => new Response('<html></html>'))
    vi.stubGlobal('fetch', upstream)
    const env = routerEnv({ VERCEL_DEPLOYMENT_URL: undefined })

    const response = await fetchRouter(new Request('https://nico-rank.com/privacy'), env, { waitUntil: vi.fn() })

    expect(response.status).toBe(200)
    expect(upstream).toHaveBeenCalledTimes(1)
    expect(new URL(upstream.mock.calls[0][0].url).origin).toBe(
      'https://nico-ranking-custom-yjsns-projects.vercel.app',
    )
  })
})

describe('smart router request bodies', () => {
  const MB = 1024 * 1024

  function streamOf(chunks: number, chunkBytes: number): ReadableStream<Uint8Array> {
    let sent = 0
    return new ReadableStream({
      pull(controller) {
        if (sent++ < chunks) controller.enqueue(new Uint8Array(chunkBytes))
        else controller.close()
      },
    })
  }

  it('answers 413 for a declared body over the limit without forwarding it', async () => {
    const env = routerEnv()
    const request = new Request('https://nico-rank.com/api/admin/ng-list', {
      method: 'POST',
      body: 'synthetic',
      headers: { 'Content-Length': String(6 * MB) },
    })

    const response = await fetchRouter(request, env, { waitUntil: vi.fn() })

    expect(response.status).toBe(413)
    expect((env.WORKER_GREEN as { fetch: ReturnType<typeof vi.fn> }).fetch).not.toHaveBeenCalled()
  })

  it('stops reading a streamed body once it passes the limit', async () => {
    const upstream = vi.fn()
    vi.stubGlobal('fetch', upstream)
    const env = routerEnv()
    const request = new Request('https://nico-rank.com/_vercel/insights/view', {
      method: 'POST',
      body: streamOf(64, MB),
      duplex: 'half',
    } as RequestInit)

    const response = await fetchRouter(request, env, { waitUntil: vi.fn() })

    expect(response.status).toBe(413)
    expect(upstream).not.toHaveBeenCalled()
  })

  it('still forwards an ordinary POST body unchanged to the admin origin', async () => {
    const upstream = vi.fn(async (_request: Request) => new Response('ok'))
    vi.stubGlobal('fetch', upstream)
    const env = routerEnv()
    const body = JSON.stringify({ videoIds: ['sm1'], authorIds: [], videoTitles: [], authorNames: [] })

    const response = await fetchRouter(
      new Request('https://nico-rank.com/api/admin/ng-list', { method: 'POST', body }),
      env,
      { waitUntil: vi.fn() },
    )

    expect(response.status).toBe(200)
    expect((env.WORKER_GREEN as { fetch: ReturnType<typeof vi.fn> }).fetch).not.toHaveBeenCalled()
    expect(upstream).toHaveBeenCalledTimes(1)
    const forwarded = upstream.mock.calls[0][0] as Request
    expect(new URL(forwarded.url).pathname).toBe('/api/admin/ng-list')
    expect(await forwarded.text()).toBe(body)
  })
})

describe('smart router cache headers', () => {
  const cachedGreenAnswer = () =>
    Response.json(
      { suggestions: [] },
      { headers: { 'Cache-Control': 'public, max-age=300', Vary: 'Origin', 'Access-Control-Allow-Origin': '*' } },
    )

  it('passes the tag autocomplete Cache-Control from green through to the browser', async () => {
    const env = routerEnv({ WORKER_GREEN: { fetch: vi.fn(async () => cachedGreenAnswer()) } })

    const response = await fetchRouter(
      new Request('https://nico-rank.com/api/tags/autocomplete?q=syn&limit=10', {
        headers: { Origin: 'https://nico-rank.com' },
      }),
      env,
      { waitUntil: vi.fn() },
    )

    expect(response.status).toBe(200)
    expect(response.headers.get('Cache-Control')).toBe('public, max-age=300')
    expect(response.headers.get('Vary')).toBe('Origin')
    expect(response.headers.get('CDN-Cache-Control')).toBeNull()
    expect(response.headers.get('X-Active-Worker')).toBe('green')
    expect(response.headers.get('X-Content-Type-Options')).toBe('nosniff')
    expect(response.headers.get('Access-Control-Allow-Origin')).toBe('https://nico-rank.com')
  })

  it.each(['/api/ranking?genre=all&period=24h', '/api/metadata'])('still forces no-store on %s', async (path) => {
    const env = routerEnv({ WORKER_GREEN: { fetch: vi.fn(async () => cachedGreenAnswer()) } })

    const response = await fetchRouter(new Request(`https://nico-rank.com${path}`), env, { waitUntil: vi.fn() })

    expect(response.headers.get('Cache-Control')).toBe('no-store')
    expect(response.headers.get('CDN-Cache-Control')).toBe('no-store')
    expect(response.headers.get('Vercel-CDN-Cache-Control')).toBe('no-store')
    expect(response.headers.get('X-Active-Worker')).toBe('green')
  })
})
