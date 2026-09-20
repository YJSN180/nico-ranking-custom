// @vitest-environment node
import { afterEach, describe, expect, it, vi } from 'vitest'
import { fetchVerifiedRanking } from '../../scripts/lib/verify-ranking-response'

const summary = {
  verifiedVia: 'production-router-service-binding',
  activeWorker: 'green',
  generation: 'legacy',
  updatedAt: '2026-09-21T00:00:00.000Z',
  count: 996,
}
afterEach(() => vi.unstubAllGlobals())
describe('publication verification client', () => {
  it('authenticates to the fixed Worker endpoint and never follows redirects', async () => {
    const fetch = vi.fn(async () => Response.json(summary))
    vi.stubGlobal('fetch', fetch)
    expect(
      await fetchVerifiedRanking('https://stats.example', 'test-key'),
    ).toEqual(summary)
    expect(fetch).toHaveBeenCalledWith(
      'https://stats.example/verify-ranking',
      expect.objectContaining({
        headers: { Authorization: 'Bearer test-key' },
        redirect: 'error',
      }),
    )
  })
  it.each([
    { count: 0 },
    { count: 1.5 },
    { count: '996' },
    { updatedAt: 'bad' },
    { verifiedVia: undefined },
    { activeWorker: 'blue-fallback' },
    { generation: '' },
  ])('rejects invalid summaries %j', async (invalid) => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => Response.json({ ...summary, ...invalid })),
    )
    await expect(
      fetchVerifiedRanking('https://stats.example', 'test-key'),
    ).rejects.toThrow('Invalid production gateway')
  })
  it('does not turn authorization failures into success or retry them', async () => {
    const fetch = vi.fn(
      async () => new Response('Unauthorized', { status: 401 }),
    )
    vi.stubGlobal('fetch', fetch)
    await expect(
      fetchVerifiedRanking('https://stats.example', 'bad'),
    ).rejects.toThrow('HTTP 401')
    expect(fetch).toHaveBeenCalledTimes(1)
  })
  it('does not send credentials over plaintext HTTP', async () => {
    const fetch = vi.fn()
    vi.stubGlobal('fetch', fetch)
    await expect(
      fetchVerifiedRanking('http://stats.example', 'test-key'),
    ).rejects.toThrow('HTTPS')
    expect(fetch).not.toHaveBeenCalled()
  })
})
