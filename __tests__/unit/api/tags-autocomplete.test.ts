// @vitest-environment node
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { NextRequest } from 'next/server'

// サイトの /api/tags/autocomplete は公開ゲートウェイ（本番と同じ辞書・照合）を中継する
const GREEN_GATEWAY = 'https://nico-ranking-api-gateway-green.yjsn180180.workers.dev'

type FetchCall = [input: string | URL | Request, init?: RequestInit]

const fetchMock = vi.fn<(...args: FetchCall) => Promise<Response>>()

function upstreamAnswer(suggestions: unknown, metadata: unknown = {
  total: Array.isArray(suggestions) ? suggestions.length : 0,
  maxResults: 10,
  source: 'r2-tag-accumulation',
  lastUpdated: '2026-01-01T00:00:00.000Z',
  totalUniqueTags: 445_000,
}): Response {
  return Response.json({ query: 'ignored', suggestions, metadata })
}

function requestedUrl(call: FetchCall | undefined): URL {
  if (!call) throw new Error('fetch was not called')
  const [input] = call
  return new URL(input instanceof Request ? input.url : String(input))
}

async function loadRoute() {
  return import('@/app/api/tags/autocomplete/route')
}

async function get(query: string, headers: Record<string, string> = {}) {
  const { GET } = await loadRoute()
  const response = await GET(new NextRequest(`http://localhost/api/tags/autocomplete${query}`, { headers }))
  return { response, body: await response.json() }
}

describe('GET /api/tags/autocomplete', () => {
  beforeEach(() => {
    // 応答のキャッシュはモジュールごとに持つため、テストごとに読み直す
    vi.resetModules()
    fetchMock.mockReset()
    vi.stubGlobal('fetch', fetchMock)
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    vi.unstubAllEnvs()
    vi.restoreAllMocks()
  })

  describe('queries answered without the gateway', () => {
    it.each([
      ['?q=V', 'V'],
      ['?q=', ''],
      ['', ''],
      ['?q=%20%20V%20%20', '  V  '],
    ])('answers query-too-short for %s', async (query, echoed) => {
      const { response, body } = await get(query)

      expect(response.status).toBe(200)
      expect(response.headers.get('Cache-Control')).toBe('public, max-age=300')
      expect(body).toEqual({ query: echoed, suggestions: [], metadata: { total: 0, source: 'query-too-short' } })
      expect(fetchMock).not.toHaveBeenCalled()
    })

    it('answers query-too-long for more than 100 characters', async () => {
      const { response, body } = await get(`?q=${'a'.repeat(101)}`)

      expect(response.status).toBe(200)
      expect(body.suggestions).toEqual([])
      expect(body.metadata).toEqual({ total: 0, source: 'query-too-long' })
      expect(fetchMock).not.toHaveBeenCalled()
    })

    it('forwards a query of exactly 100 characters after trimming', async () => {
      fetchMock.mockResolvedValueOnce(upstreamAnswer([]))

      await get(`?q=%20${'a'.repeat(100)}%20`)

      expect(requestedUrl(fetchMock.mock.calls[0]).searchParams.get('q')).toBe('a'.repeat(100))
    })

    it('does not relay a request that it relayed itself (loop guard)', async () => {
      const { response, body } = await get('?q=VOCALOID', { 'X-Tag-Suggest-Proxy': '1' })

      expect(response.status).toBe(502)
      expect(body.metadata.source).toBe('upstream-error')
      expect(fetchMock).not.toHaveBeenCalled()
    })
  })

  describe('gateway selection', () => {
    it.each([
      ['production', 'https://ranking-gateway.example', 'https://ranking-gateway.example'],
      ['production', undefined, 'https://nico-rank.com'],
      ['preview', 'https://ranking-gateway.example', GREEN_GATEWAY],
      ['development', undefined, GREEN_GATEWAY],
      [undefined, undefined, GREEN_GATEWAY],
    ])('VERCEL_ENV=%s with RANKING_SSR_GATEWAY_URL=%s uses %s', async (vercelEnv, gatewayUrl, expectedOrigin) => {
      vi.stubEnv('VERCEL_ENV', vercelEnv)
      vi.stubEnv('RANKING_SSR_GATEWAY_URL', gatewayUrl)
      fetchMock.mockResolvedValueOnce(upstreamAnswer(['VOCALOID']))

      await get('?q=VOCA')

      const url = requestedUrl(fetchMock.mock.calls[0])
      expect(url.origin).toBe(expectedOrigin)
      expect(url.pathname).toBe('/api/tags/autocomplete')
    })

    it('never takes the gateway from the request host', async () => {
      fetchMock.mockResolvedValueOnce(upstreamAnswer([]))
      const { GET } = await loadRoute()

      await GET(new NextRequest('https://attacker.example/api/tags/autocomplete?q=VOCA', {
        headers: { Host: 'attacker.example', 'X-Forwarded-Host': 'attacker.example' },
      }))

      expect(requestedUrl(fetchMock.mock.calls[0]).origin).toBe(GREEN_GATEWAY)
    })
  })

  describe('forwarding', () => {
    it('forwards only the trimmed q and the parsed limit with the server headers and a timeout', async () => {
      fetchMock.mockResolvedValueOnce(upstreamAnswer(['VOCALOID']))

      await get('?q=%20VOCA%20&limit=1000&genre=all&tag=x')

      const [, init] = fetchMock.mock.calls[0]
      const url = requestedUrl(fetchMock.mock.calls[0])
      expect([...url.searchParams.keys()].sort()).toEqual(['limit', 'q'])
      expect(url.searchParams.get('q')).toBe('VOCA')
      expect(url.searchParams.get('limit')).toBe('50')
      expect(init?.cache).toBe('no-store')
      expect(init?.signal).toBeInstanceOf(AbortSignal)
      const headers = new Headers(init?.headers)
      expect(headers.get('Accept')).toBe('application/json')
      expect(headers.get('User-Agent')).toBe('nico-ranking-web/1.0')
      expect(headers.get('X-Tag-Suggest-Proxy')).toBe('1')
    })

    it('returns the upstream suggestions with the raw query echo and the upstream metadata', async () => {
      fetchMock.mockResolvedValueOnce(upstreamAnswer(['VOCALOID', 'VOCALOID曲']))

      const { response, body } = await get('?q=VOCA')

      expect(response.status).toBe(200)
      expect(response.headers.get('Cache-Control')).toBe('public, max-age=300')
      expect(body).toEqual({
        query: 'VOCA',
        suggestions: ['VOCALOID', 'VOCALOID曲'],
        metadata: {
          total: 2,
          maxResults: 10,
          source: 'r2-tag-accumulation',
          lastUpdated: '2026-01-01T00:00:00.000Z',
          totalUniqueTags: 445_000,
        },
      })
    })

    it('sanitizes upstream suggestions: strings of 1..100 characters, unique, at most limit', async () => {
      fetchMock.mockResolvedValueOnce(upstreamAnswer([
        'syn-a', 1, null, '', 'x'.repeat(101), 'syn-a', { tag: 'syn-x' }, 'syn-b', 'y'.repeat(100), 'syn-c', 'syn-d',
      ]))

      const { body } = await get('?q=syn&limit=4')

      expect(body.suggestions).toEqual(['syn-a', 'syn-b', 'y'.repeat(100), 'syn-c'])
      expect(body.metadata.total).toBe(4)
      expect(body.metadata.maxResults).toBe(4)
    })

    it('falls back to neutral metadata when the upstream metadata is not usable', async () => {
      fetchMock.mockResolvedValueOnce(upstreamAnswer(['syn-a'], 'broken'))

      const { response, body } = await get('?q=syn')

      expect(response.status).toBe(200)
      expect(body.metadata).toEqual({
        total: 1,
        maxResults: 10,
        source: 'gateway',
        lastUpdated: null,
        totalUniqueTags: 0,
      })
    })
  })

  describe('in-process cache', () => {
    it('reuses a successful answer for the same normalized query and limit', async () => {
      fetchMock.mockResolvedValueOnce(upstreamAnswer(['VOCALOID']))

      const first = await get('?q=VOCA')
      const second = await get('?q=%EF%BC%B6%EF%BD%8F%EF%BD%83%EF%BD%81') // Ｖｏｃａ（全角）

      expect(fetchMock).toHaveBeenCalledTimes(1)
      expect(first.body.suggestions).toEqual(['VOCALOID'])
      expect(second.body.suggestions).toEqual(['VOCALOID'])
      expect(second.body.query).toBe('Ｖｏｃａ')
      expect(second.response.headers.get('Cache-Control')).toBe('public, max-age=300')
    })

    it('keeps answers for different limits apart', async () => {
      fetchMock.mockResolvedValueOnce(upstreamAnswer(['syn-a'])).mockResolvedValueOnce(upstreamAnswer(['syn-a', 'syn-b']))

      await get('?q=syn&limit=1')
      const { body } = await get('?q=syn&limit=2')

      expect(fetchMock).toHaveBeenCalledTimes(2)
      expect(body.suggestions).toEqual(['syn-a', 'syn-b'])
    })

    it('asks the gateway again after five minutes', async () => {
      const now = vi.spyOn(Date, 'now').mockReturnValue(1_000_000)
      fetchMock.mockResolvedValueOnce(upstreamAnswer(['syn-old'])).mockResolvedValueOnce(upstreamAnswer(['syn-new']))

      await get('?q=syn')
      now.mockReturnValue(1_000_000 + 5 * 60 * 1000)
      const { body } = await get('?q=syn')

      expect(fetchMock).toHaveBeenCalledTimes(2)
      expect(body.suggestions).toEqual(['syn-new'])
    })

    it('does not keep failures', async () => {
      vi.spyOn(console, 'warn').mockImplementation(() => undefined)
      fetchMock.mockResolvedValueOnce(new Response('busy', { status: 503 })).mockResolvedValueOnce(upstreamAnswer(['syn-a']))

      const failed = await get('?q=syn')
      const recovered = await get('?q=syn')

      expect(failed.response.status).toBe(502)
      expect(recovered.response.status).toBe(200)
      expect(recovered.body.suggestions).toEqual(['syn-a'])
      expect(fetchMock).toHaveBeenCalledTimes(2)
    })

    it('does not keep a tag-data-not-found answer and caches it only briefly downstream', async () => {
      const notFound = () => upstreamAnswer([], { total: 0, source: 'tag-data-not-found', error: 'Tag accumulation data not available' })
      fetchMock.mockResolvedValueOnce(notFound()).mockResolvedValueOnce(notFound())

      const { response, body } = await get('?q=syn')
      await get('?q=syn')

      expect(response.status).toBe(200)
      expect(response.headers.get('Cache-Control')).toBe('public, max-age=60')
      expect(body.metadata.source).toBe('tag-data-not-found')
      expect(fetchMock).toHaveBeenCalledTimes(2)
    })
  })

  describe('gateway failures', () => {
    it.each([
      ['a non-OK status', () => Promise.resolve(new Response('error', { status: 500 }))],
      ['a timeout', () => Promise.reject(new DOMException('The operation was aborted due to timeout', 'TimeoutError'))],
      ['a network error', () => Promise.reject(new TypeError('fetch failed'))],
      ['invalid JSON', () => Promise.resolve(new Response('<html>', { status: 200 }))],
      ['an answer without a suggestions array', () => Promise.resolve(Response.json({ suggestions: 'VOCALOID' }))],
      ['a JSON array', () => Promise.resolve(Response.json(['VOCALOID']))],
    ])('answers 502 upstream-error with no-store on %s', async (_label, upstream) => {
      const warnings: string[] = []
      vi.spyOn(console, 'warn').mockImplementation((...args: unknown[]) => {
        warnings.push(args.map(String).join(' '))
      })
      fetchMock.mockImplementationOnce(upstream)

      const { response, body } = await get('?q=private-query')

      expect(response.status).toBe(502)
      expect(response.headers.get('Cache-Control')).toBe('no-store')
      expect(body).toEqual({ query: 'private-query', suggestions: [], metadata: { total: 0, source: 'upstream-error' } })
      // 利用者のクエリはログに残さない
      expect(warnings.join('\n')).not.toContain('private-query')
    })
  })
})
