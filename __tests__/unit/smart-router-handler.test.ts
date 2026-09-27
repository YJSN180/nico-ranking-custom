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
