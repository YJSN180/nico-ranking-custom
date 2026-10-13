// @vitest-environment node
import { afterEach, describe, it, expect, vi } from 'vitest'
import { NextRequest } from 'next/server'
import { middleware } from '../../middleware'
import {
  admitSearch,
  type SearchAdmissionEnv,
} from '../../workers/search-admission'
import {
  signSearchGrant,
  verifySearchGrant,
  SEARCH_GRANT_HEADER,
} from '@/lib/search/gateway-grant'
import { fetchUpstream } from '../../workers/utils/upstream-proxy'
const secret = 'synthetic-test-key'
const request = (path = '/api/search?q=x', headers = {}) =>
  new NextRequest(`https://example.com${path}`, { headers })
function env() {
  return {
    WORKER_AUTH_KEY: secret,
    RANKING_DATA: {
      get: vi.fn(async () => ({
        enabled: true,
        perMinute: 180,
        perDay: 30000,
      })),
    },
    SEARCH_RATE_LIMITER: { limit: vi.fn(async () => ({ success: true })) },
    SEARCH_BUDGET: {
      getByName: vi.fn(() => ({
        take: vi.fn(async () => ({ allowed: true, retryAfter: 0 })),
      })),
    },
  }
}
afterEach(() => {
  vi.unstubAllEnvs()
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('gateway proof before search cache', () => {
  it('defaults off in deployments but keeps ranking accessible', async () => {
    vi.stubEnv('VERCEL_ENV', 'production')
    vi.stubEnv('SEARCH_ENABLED', undefined)
    expect((await middleware(request())).status).toBe(503)
    expect(
      (await middleware(request('/api/ranking'))).headers.get(
        'x-middleware-next',
      ),
    ).toBe('1')
  })
  it.each(['production', 'preview'])(
    'rejects direct access in %s, accepts only a valid grant',
    async (deployment) => {
      vi.stubEnv('VERCEL_ENV', deployment)
      vi.stubEnv('SEARCH_ENABLED', 'true')
      vi.stubEnv('WORKER_AUTH_KEY', secret)
      expect((await middleware(request())).status).toBe(403)
      const signed = request('/api/search?q=x', {
        [SEARCH_GRANT_HEADER]: await signSearchGrant(request(), secret),
      })
      expect((await middleware(signed)).headers.get('x-middleware-next')).toBe(
        '1',
      )
      expect(
        (
          await middleware(
            request('/api/search?q=y', Object.fromEntries(signed.headers)),
          )
        ).status,
      ).toBe(403)
    },
  )
  it.each(['/api/search?q=x', '/api/search/owners?users=1', '/api/search/realtime-tags?ids=sm1'])(
    'allows explicitly enabled protected-preview direct access to %s', async path => {
      vi.stubEnv('VERCEL_ENV', 'preview')
      vi.stubEnv('SEARCH_ENABLED', 'true')
      vi.stubEnv('SEARCH_PREVIEW_DIRECT', 'true')
      vi.stubEnv('WORKER_AUTH_KEY', undefined)
      expect((await middleware(request(path))).headers.get('x-middleware-next')).toBe('1')
    },
  )
  it('does not let the preview opt-in bypass the search kill switch', async () => {
    vi.stubEnv('VERCEL_ENV', 'preview')
    vi.stubEnv('SEARCH_ENABLED', 'false')
    vi.stubEnv('SEARCH_PREVIEW_DIRECT', 'true')
    expect((await middleware(request())).status).toBe(503)
  })
  it('does not let the preview opt-in or a forged environment header bypass production authentication', async () => {
    vi.stubEnv('VERCEL_ENV', 'production')
    vi.stubEnv('SEARCH_ENABLED', 'true')
    vi.stubEnv('SEARCH_PREVIEW_DIRECT', 'true')
    expect((await middleware(request('/api/search?q=x', { 'x-vercel-env': 'preview' }))).status).toBe(403)
  })
  it('rejects expired, future, altered and cross-path grants', async () => {
    const now = 1_800_000_000_000
    const grant = await signSearchGrant(request(), secret, now)
    const signed = request('/api/search?q=x', { [SEARCH_GRANT_HEADER]: grant })
    expect(await verifySearchGrant(signed, secret, now)).toBe(true)
    expect(await verifySearchGrant(signed, secret, now + 31_000)).toBe(false)
    expect(await verifySearchGrant(signed, secret, now - 6_000)).toBe(false)
    expect(await verifySearchGrant(signed, 'wrong', now)).toBe(false)
    expect(
      await verifySearchGrant(
        request('/api/search/owners?users=1', { [SEARCH_GRANT_HEADER]: grant }),
        secret,
        now,
      ),
    ).toBe(false)
  })
  it('strips forged proof and worker secret, never follows signed redirects', async () => {
    const upstream = vi.fn(
      async () =>
        new Response(null, {
          status: 307,
          headers: { Location: '/api/search?q=y' },
        }),
    )
    vi.stubGlobal('fetch', upstream)
    const original = request('/api/search?q=x', {
      [SEARCH_GRANT_HEADER]: 'forged',
      'x-worker-auth': secret,
    })
    expect(
      (await fetchUpstream(original, 'https://upstream.example', 'trusted'))
        .status,
    ).toBe(502)
    const sent = upstream.mock.calls[0] as unknown as [Request]
    expect(sent[0].headers.get(SEARCH_GRANT_HEADER)).toBe('trusted')
    expect(sent[0].headers.get('x-worker-auth')).toBeNull()
    expect(upstream).toHaveBeenCalledTimes(1)
  })
})

describe('search admission failure isolation', () => {
  it('issues a verifiable proof after local and global admission', async () => {
    const e = env()
    const result = await admitSearch(
      request(),
      e as unknown as SearchAdmissionEnv,
      'search',
    )
    expect(typeof result).toBe('string')
    expect(
      await verifySearchGrant(
        request('/api/search?q=x', { [SEARCH_GRANT_HEADER]: result as string }),
        secret,
      ),
    ).toBe(true)
  })
  it.each([
    'RANKING_DATA',
    'SEARCH_RATE_LIMITER',
    'SEARCH_BUDGET',
    'WORKER_AUTH_KEY',
  ])('fails closed for missing %s', async (missing) => {
    const e = { ...env(), [missing]: undefined }
    const result = (await admitSearch(
      request(),
      e as unknown as SearchAdmissionEnv,
      'search',
    )) as Response
    expect(result.status).toBe(503)
    expect(result.headers.get('cache-control')).toBe('no-store')
  })
  it.each([
    null,
    { enabled: false },
    { enabled: true, perMinute: -1, perDay: 30000 },
  ])('stops on absent, disabled or malformed control %j', async (control) => {
    const e = env()
    e.RANKING_DATA.get = vi.fn(async () => control) as typeof e.RANKING_DATA.get
    expect(
      (
        (await admitSearch(
          request(),
          e as unknown as SearchAdmissionEnv,
          'search',
        )) as Response
      ).status,
    ).toBe(503)
    expect(e.SEARCH_BUDGET.getByName).not.toHaveBeenCalled()
  })
  it('does not allow the worker secret to bypass limits', async () => {
    const e = env()
    e.SEARCH_RATE_LIMITER.limit.mockResolvedValue({ success: false })
    expect(
      (
        (await admitSearch(
          request('/api/search?q=x', { 'x-worker-auth': secret }),
          e as unknown as SearchAdmissionEnv,
          'search',
        )) as Response
      ).status,
    ).toBe(429)
    expect(e.RANKING_DATA.get).not.toHaveBeenCalled()
  })
  it('rejects an exhausted global budget and control outages', async () => {
    const e = env()
    e.SEARCH_BUDGET.getByName = vi.fn(() => ({
      take: vi.fn(async () => ({ allowed: false, retryAfter: 120 })),
    }))
    const denied = (await admitSearch(
      request(),
      e as unknown as SearchAdmissionEnv,
      'search',
    )) as Response
    expect(denied.status).toBe(429)
    expect(denied.headers.get('retry-after')).toBe('120')
    e.SEARCH_BUDGET.getByName.mockImplementation(() => {
      throw new Error('offline')
    })
    expect(
      (
        (await admitSearch(
          request(),
          e as unknown as SearchAdmissionEnv,
          'search',
        )) as Response
      ).status,
    ).toBe(503)
  })
})
