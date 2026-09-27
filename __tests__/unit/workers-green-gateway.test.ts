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
