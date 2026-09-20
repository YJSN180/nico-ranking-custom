import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import worker from '../src/index.js'

describe('authenticated publication verification', () => {
  let env
  const timestamp = '2026-09-21T00:00:00.000Z'
  function request(options = {}) {
    return new Request('https://stats.example/verify-ranking', {
      headers: { Authorization: 'Bearer test-only-key' },
      ...options,
    })
  }
  function rankingResponse(
    body = { items: [{ id: 'sm1' }], metadata: { updatedAt: timestamp } },
    headers = {},
  ) {
    return Response.json(body, {
      headers: {
        'X-Active-Worker': 'green',
        'X-Ranking-Generation': 'legacy',
        ...headers,
      },
    })
  }
  beforeEach(() => {
    env = {
      WORKER_AUTH_KEY: 'test-only-key',
      PRODUCTION_GATEWAY: { fetch: vi.fn(async () => rankingResponse()) },
      STATS_KV: { put: vi.fn() },
      R2_BUCKET: { put: vi.fn() },
    }
    vi.stubGlobal(
      'fetch',
      vi.fn(() => {
        throw new Error('Public network must not be used')
      }),
    )
  })
  afterEach(() => vi.unstubAllGlobals())

  it.each([undefined, '', 'Bearer wrong', 'Bearer undefined'])(
    'denies invalid authorization: %s',
    async (value) => {
      const response = await worker.fetch(
        request({ headers: value ? { Authorization: value } : {} }),
        env,
        { waitUntil: vi.fn() },
      )
      expect(response.status).toBe(401)
      expect(env.PRODUCTION_GATEWAY.fetch).not.toHaveBeenCalled()
      expect(response.headers.get('Cache-Control')).toBe('no-store')
    },
  )
  it.each(['/verify-ranking', '/trigger'])(
    'fails closed without a configured secret: %s',
    async (path) => {
      delete env.WORKER_AUTH_KEY
      const response = await worker.fetch(
        new Request(`https://stats.example${path}`, {
          method: path === '/trigger' ? 'POST' : 'GET',
          headers: { Authorization: 'Bearer undefined' },
        }),
        env,
        { waitUntil: vi.fn() },
      )
      expect(response.status).toBe(401)
    },
  )
  it('rejects mutation methods and arbitrary targets', async () => {
    expect(
      (
        await worker.fetch(request({ method: 'POST' }), env, {
          waitUntil: vi.fn(),
        })
      ).status,
    ).toBe(405)
    expect(
      (
        await worker.fetch(
          new Request(
            'https://stats.example/verify-ranking?url=https://evil.example',
            {
              headers: { Authorization: 'Bearer test-only-key' },
            },
          ),
          env,
          { waitUntil: vi.fn() },
        )
      ).status,
    ).toBe(400)
    expect(env.PRODUCTION_GATEWAY.fetch).not.toHaveBeenCalled()
  })
  it('returns only a summary through the fixed production router request', async () => {
    const response = await worker.fetch(request(), env, { waitUntil: vi.fn() })
    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({
      verifiedVia: 'production-router-service-binding',
      activeWorker: 'green',
      generation: 'legacy',
      updatedAt: timestamp,
      count: 1,
    })
    const forwarded = env.PRODUCTION_GATEWAY.fetch.mock.calls[0][0]
    expect(forwarded.url).toBe(
      'https://nico-rank.com/api/ranking?genre=all&period=24h',
    )
    expect(forwarded.method).toBe('GET')
    expect(forwarded.redirect).toBe('manual')
    expect(forwarded.headers.get('Authorization')).toBeNull()
    expect(env.STATS_KV.put).not.toHaveBeenCalled()
    expect(env.R2_BUCKET.put).not.toHaveBeenCalled()
    expect(fetch).not.toHaveBeenCalled()
  })
  it('fails when the binding is missing', async () => {
    delete env.PRODUCTION_GATEWAY
    expect(
      (await worker.fetch(request(), env, { waitUntil: vi.fn() })).status,
    ).toBe(503)
  })
  it.each([403, 500, 302])(
    'does not accept an HTTP %s response',
    async (status) => {
      env.PRODUCTION_GATEWAY.fetch.mockResolvedValue(
        new Response('error', { status }),
      )
      expect(
        (await worker.fetch(request(), env, { waitUntil: vi.fn() })).status,
      ).toBe(502)
    },
  )
  it.each([
    { items: [], metadata: { updatedAt: timestamp } },
    { items: [{}], metadata: { updatedAt: 'invalid' } },
    { items: [{}] },
  ])('rejects invalid ranking data', async (body) => {
    env.PRODUCTION_GATEWAY.fetch.mockResolvedValue(rankingResponse(body))
    expect(
      (await worker.fetch(request(), env, { waitUntil: vi.fn() })).status,
    ).toBe(502)
  })
  it('does not hide a router fallback', async () => {
    env.PRODUCTION_GATEWAY.fetch.mockResolvedValue(
      rankingResponse(undefined, { 'X-Active-Worker': 'blue-fallback' }),
    )
    expect(
      (await worker.fetch(request(), env, { waitUntil: vi.fn() })).status,
    ).toBe(502)
  })
  it('fails closed on malformed JSON or network errors', async () => {
    env.PRODUCTION_GATEWAY.fetch.mockResolvedValue(
      new Response('{broken', {
        headers: {
          'X-Active-Worker': 'green',
          'X-Ranking-Generation': 'legacy',
        },
      }),
    )
    expect(
      (await worker.fetch(request(), env, { waitUntil: vi.fn() })).status,
    ).toBe(502)
    env.PRODUCTION_GATEWAY.fetch.mockRejectedValue(new Error('network failure'))
    expect(
      (await worker.fetch(request(), env, { waitUntil: vi.fn() })).status,
    ).toBe(502)
  })
})
