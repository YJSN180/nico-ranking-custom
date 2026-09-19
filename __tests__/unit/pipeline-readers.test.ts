// @vitest-environment node
import { afterEach, describe, expect, it, vi } from 'vitest'
import { gzipSync } from 'node:zlib'
vi.mock('../../workers/sentry.js', () => ({
  Sentry: { withSentry: (_options: unknown, handler: unknown) => handler },
  createWorkerSentryOptions: vi.fn(),
  captureWorkerException: vi.fn(),
  sanitizeUrlForSentry: vi.fn(),
}))
vi.mock('../../lib/scraper', () => ({ scrapeRankingPage: vi.fn() }))
import worker from '../../workers/api-gateway-green-20250726'
import { getPopularTags } from '../../lib/popular-tags'
import { scrapeRankingPage } from '../../lib/scraper'
const fetchWorker = worker.fetch as unknown as (
  request: Request,
  env: unknown,
  ctx: { waitUntil: unknown },
) => Promise<Response>

afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

describe('active generation readers', () => {
  it.each([true, false])(
    'serves gzip ranking and metadata with generations=%s',
    async (generations) => {
      const manifest = {
        version: 1,
        generation: '100-1',
        collectedAt: new Date().toISOString(),
        publishedAt: new Date().toISOString(),
        counts: { 'all/hour': 1 },
      }
      const prefix = generations ? 'rankings/generations/100-1' : 'rankings'
      const data = {
        items: [{ id: 'sm1', title: 'A &amp; B' }],
        popularTags: ['tag'],
        metadata: { updatedAt: manifest.collectedAt },
      }
      const get = vi.fn(async (key: string) => {
        if (key === 'rankings/current.json')
          return generations ? { json: async () => manifest } : null
        if (
          ![prefix + '/all/hour/all.json', prefix + '/metadata.json'].includes(
            key,
          )
        )
          return null
        const bytes = gzipSync(JSON.stringify(data))
        return {
          etag: 'test',
          httpMetadata: { contentEncoding: 'gzip' },
          body: new Response(bytes).body,
          arrayBuffer: async () => new Uint8Array(bytes).buffer,
        }
      })
      const env = {
        R2_BUCKET: { get },
        RATE_LIMITER: { limit: async () => ({ success: true }) },
      }
      const response = await fetchWorker(
        new Request('https://nico-rank.com/api/ranking?genre=all&period=hour'),
        env,
        { waitUntil: vi.fn() },
      )
      expect(response.status).toBe(200)
      expect(((await response.json()) as typeof data).items[0].title).toBe(
        'A & B',
      )
      expect(response.headers.get('X-Ranking-Generation')).toBe(
        generations ? '100-1' : 'legacy',
      )
      expect(response.headers.get('Cache-Control')).toBe('no-store')
      const metadata = await fetchWorker(
        new Request('https://nico-rank.com/api/metadata'),
        env,
        { waitUntil: vi.fn() },
      )
      expect(metadata.status).toBe(200)
      expect(get).toHaveBeenCalledWith(prefix + '/metadata.json')
    },
  )

  it('popular tags use the public ranking gateway without a KV dependency', async () => {
    const fetch = vi.fn(async (_url: unknown) =>
      Response.json({ popularTags: ['tag'] }),
    )
    vi.stubGlobal('fetch', fetch)
    expect(await getPopularTags('game', 'hour')).toEqual(['tag'])
    expect(new URL(String(fetch.mock.calls[0][0])).pathname).toBe(
      '/api/ranking',
    )
    expect(scrapeRankingPage).not.toHaveBeenCalled()
  })
})
