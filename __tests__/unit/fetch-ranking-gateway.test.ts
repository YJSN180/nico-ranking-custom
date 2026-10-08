// @vitest-environment node
import { afterEach, describe, expect, it, vi } from 'vitest'
import { fetchRankingData } from '@/lib/fetch-ranking'
import { scrapeRankingPage } from '@/lib/scraper'

vi.mock('@/lib/scraper', () => ({
  scrapeRankingPage: vi.fn(async () => {
    throw new Error('Unexpected scraper fallback')
  }),
  fetchVideoDetailsBatch: vi.fn(),
}))

afterEach(() => {
  vi.clearAllMocks()
  vi.unstubAllEnvs()
  vi.unstubAllGlobals()
})

describe('ranking gateway on protected deployments', () => {
  it.each([
    ['preview', undefined],
    ['production', undefined],
    ['preview', 'https://ranking.example.test/'],
  ])(
    'reads public rankings on %s with override %s',
    async (environment, override) => {
      vi.stubEnv('VERCEL_ENV', environment)
      vi.stubEnv('VERCEL', '1')
      vi.stubEnv('VERCEL_URL', 'protected-deployment.vercel.app')
      vi.stubEnv('FORCE_SCRAPER_FETCH', undefined)
      vi.stubEnv('RANKING_SSR_GATEWAY_URL', override)
      vi.stubEnv('NEXT_PUBLIC_API_GATEWAY_URL', undefined)
      const origin = override?.replace(/\/$/, '') || 'https://nico-rank.com'
      const data = {
        items: [{ id: 'sm1', rank: 1, title: 'Fixture' }],
        popularTags: ['tag'],
      }
      const fetch = vi.fn(async (url: unknown) =>
        new URL(String(url)).origin === origin
          ? Response.json(data)
          : new Response('Authentication required', { status: 401 }),
      )
      vi.stubGlobal('fetch', fetch)

      expect(await fetchRankingData('hour', 'game', '実況')).toEqual(data)
      expect(scrapeRankingPage).not.toHaveBeenCalled()
      expect(fetch).toHaveBeenCalledTimes(1)
      const url = new URL(String(fetch.mock.calls[0][0]))
      expect(url.origin).toBe(origin)
      expect(Object.fromEntries(url.searchParams)).toEqual({
        genre: 'game',
        period: 'hour',
        tag: '実況',
      })
    },
  )
})
