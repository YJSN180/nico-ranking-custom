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

  it('still forwards an ordinary POST body unchanged', async () => {
    const env = routerEnv()
    const body = JSON.stringify({ videoIds: ['sm1'], authorIds: [], videoTitles: [], authorNames: [] })

    const response = await fetchRouter(
      new Request('https://nico-rank.com/api/admin/ng-list', { method: 'POST', body }),
      env,
      { waitUntil: vi.fn() },
    )

    expect(response.status).toBe(200)
    const forwarded = (env.WORKER_GREEN as { fetch: ReturnType<typeof vi.fn> }).fetch.mock.calls[0][0] as Request
    expect(await forwarded.text()).toBe(body)
  })
})
