import { describe, it, expect, vi, afterEach } from 'vitest'
import type { RankingItem } from '@/types/ranking'

const originalFetch = global.fetch

async function loadModule() {
  vi.resetModules()
  vi.stubEnv('TAG_FETCH_NICOLOG_CONCURRENCY', '1')
  vi.stubEnv('TAG_FETCH_NICOLOG_MIN_INTERVAL_MS', '0')
  vi.stubEnv('TAG_FETCH_GETTHUMB_CONCURRENCY', '1')
  vi.stubEnv('TAG_FETCH_GETTHUMB_MIN_INTERVAL_MS', '0')
  vi.stubEnv('TAG_FETCH_NICOLOG_TIMEOUT_MS', '1000')
  vi.stubEnv('TAG_FETCH_GETTHUMB_TIMEOUT_MS', '1000')
  const mod = await import('@/lib/tag-fetcher-simple')
  const { kv } = await import('@/lib/simple-kv')
  return { mod, kv }
}

afterEach(() => {
  global.fetch = originalFetch
  vi.restoreAllMocks()
})

describe('tag-fetcher-simple (Nicolog -> getthumbinfo)', () => {
  it('parses Nicolog tags, prefers lock, and ignores genre', async () => {
    const html = `
      <html><body>
        <td class="tdtag">
          <li class="lock">TagA</li>
          <li class="tag">TagB</li>
          <li class="lock">TagB</li>
          <li class="genre">Game</li>
          <li class="tag">Rock &amp; Roll</li>
        </td>
      </body></html>
    `
    const fetchMock = vi.fn(async (url: string) => {
      if (url.startsWith('https://www.nicolog.jp/watch/')) {
        return new Response(html, { status: 200 })
      }
      throw new Error(`Unexpected URL: ${url}`)
    })
    global.fetch = fetchMock as any

    const { mod, kv } = await loadModule()
    const { enrichRankingItemsWithTagDetails } = mod

    vi.spyOn(kv, 'get').mockResolvedValue({})
    vi.spyOn(kv, 'set').mockResolvedValue()

    const items: RankingItem[] = [
      { rank: 1, id: 'sm1', title: 't', thumbURL: '', views: 1 }
    ]

    const [result] = await enrichRankingItemsWithTagDetails(items, 1, 0, false)

    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(result.tagDetails).toEqual([
      { name: 'TagA', isLocked: true },
      { name: 'TagB', isLocked: true },
      { name: 'Rock & Roll', isLocked: false }
    ])
    expect(result.tags).toEqual(['TagA', 'TagB', 'Rock & Roll'])
  })

  it('falls back to getthumbinfo when Nicolog has no tags', async () => {
    const html = '<html><body><div>No tags</div></body></html>'
    const xml = `<?xml version="1.0"?><nicovideo_thumb_response status="ok">
      <thumb><tags>
        <tag lock="1">Locked</tag>
        <tag>User</tag>
      </tags></thumb>
    </nicovideo_thumb_response>`

    const fetchMock = vi.fn(async (url: string) => {
      if (url.startsWith('https://www.nicolog.jp/watch/')) {
        return new Response(html, { status: 200 })
      }
      if (url.startsWith('https://ext.nicovideo.jp/api/getthumbinfo/')) {
        return new Response(xml, { status: 200 })
      }
      throw new Error(`Unexpected URL: ${url}`)
    })
    global.fetch = fetchMock as any

    const { mod, kv } = await loadModule()
    const { enrichRankingItemsWithTagDetails } = mod

    vi.spyOn(kv, 'get').mockResolvedValue({})
    vi.spyOn(kv, 'set').mockResolvedValue()

    const items: RankingItem[] = [
      { rank: 1, id: 'sm2', title: 't', thumbURL: '', views: 1 }
    ]

    const [result] = await enrichRankingItemsWithTagDetails(items, 1, 0, false)

    expect(fetchMock).toHaveBeenCalledTimes(2)
    expect(result.tagDetails).toEqual([
      { name: 'Locked', isLocked: true },
      { name: 'User', isLocked: false }
    ])
    expect(result.tags).toEqual(['Locked', 'User'])
  })

  it('keeps existing tags when both sources fail', async () => {
    const fetchMock = vi.fn(async (url: string) => {
      if (url.startsWith('https://www.nicolog.jp/watch/')) {
        return new Response('err', { status: 500 })
      }
      if (url.startsWith('https://ext.nicovideo.jp/api/getthumbinfo/')) {
        return new Response('err', { status: 500 })
      }
      throw new Error(`Unexpected URL: ${url}`)
    })
    global.fetch = fetchMock as any

    const { mod, kv } = await loadModule()
    const { enrichRankingItemsWithTagDetails } = mod

    vi.spyOn(kv, 'get').mockResolvedValue({})
    vi.spyOn(kv, 'set').mockResolvedValue()

    const items: RankingItem[] = [
      { rank: 1, id: 'sm3', title: 't', thumbURL: '', views: 1, tags: ['existing'] }
    ]

    const [result] = await enrichRankingItemsWithTagDetails(items, 1, 0, false)

    expect(result.tagDetails).toBeUndefined()
    expect(result.tags).toEqual(['existing'])
  })

  it('uses fresh cache and skips network', async () => {
    const fetchMock = vi.fn(async () => {
      throw new Error('network should not be called')
    })
    global.fetch = fetchMock as any

    const { mod, kv } = await loadModule()
    const { enrichRankingItemsWithTagDetails } = mod

    const cached = {
      sm4: {
        tags: [
          { name: 'Cached', isLocked: true }
        ],
        fetchedAt: new Date().toISOString(),
        source: 'nicolog'
      }
    }

    vi.spyOn(kv, 'get').mockResolvedValue(cached)
    const setSpy = vi.spyOn(kv, 'set').mockResolvedValue()

    const items: RankingItem[] = [
      { rank: 1, id: 'sm4', title: 't', thumbURL: '', views: 1 }
    ]

    const [result] = await enrichRankingItemsWithTagDetails(items, 1, 0, true)

    expect(fetchMock).not.toHaveBeenCalled()
    expect(setSpy).not.toHaveBeenCalled()
    expect(result.tags).toEqual(['Cached'])
  })

  it('falls back to stale cache (LKG) when both sources fail', async () => {
    const fetchMock = vi.fn(async (url: string) => {
      if (url.startsWith('https://www.nicolog.jp/watch/')) {
        return new Response('err', { status: 429 })
      }
      if (url.startsWith('https://ext.nicovideo.jp/api/getthumbinfo/')) {
        return new Response('err', { status: 500 })
      }
      throw new Error(`Unexpected URL: ${url}`)
    })
    global.fetch = fetchMock as any

    const { mod, kv } = await loadModule()
    const { enrichRankingItemsWithTagDetails } = mod

    const staleDate = new Date(Date.now() - 8 * 24 * 60 * 60 * 1000).toISOString()
    const cached = {
      sm5: {
        tags: [
          { name: 'LKG', isLocked: false }
        ],
        fetchedAt: staleDate,
        source: 'getthumbinfo'
      }
    }

    vi.spyOn(kv, 'get').mockResolvedValue(cached)
    vi.spyOn(kv, 'set').mockResolvedValue()

    const items: RankingItem[] = [
      { rank: 1, id: 'sm5', title: 't', thumbURL: '', views: 1 }
    ]

    const [result] = await enrichRankingItemsWithTagDetails(items, 1, 0, true)

    expect(result.tags).toEqual(['LKG'])
  })
})
