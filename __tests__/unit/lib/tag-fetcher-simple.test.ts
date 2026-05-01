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
  const store = await import('@/lib/tag-cache-store')
  store.resetTagCacheDelta()
  return { mod, kv, store }
}

afterEach(() => {
  global.fetch = originalFetch
  vi.restoreAllMocks()
  vi.unstubAllEnvs()
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

  it('records R2 aggregate delta without writing tag cache shards to KV', async () => {
    vi.stubEnv('TAG_CACHE_BACKEND', 'r2-aggregate')
    const html = `
      <html><body>
        <td class="tdtag">
          <li class="lock">R2Tag</li>
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

    const { mod, kv, store } = await loadModule()
    const { enrichRankingItemsWithTagDetails } = mod

    vi.spyOn(kv, 'get').mockResolvedValue({})
    const setSpy = vi.spyOn(kv, 'set').mockResolvedValue()

    const items: RankingItem[] = [
      { rank: 1, id: 'sm-r2-success', title: 't', thumbURL: '', views: 1 }
    ]

    const [result] = await enrichRankingItemsWithTagDetails(items, 1, 0, true)
    const delta = store.getTagCacheDelta()
    const deltaEntries = Object.values(delta).flatMap(shard => Object.values(shard))

    expect(result.tags).toEqual(['R2Tag'])
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(setSpy).not.toHaveBeenCalled()
    expect(deltaEntries).toEqual([
      expect.objectContaining({
        tags: [{ name: 'R2Tag', isLocked: true }],
        source: 'nicolog'
      })
    ])
  })

  it('falls back to KV reads when R2 aggregate shard is missing', async () => {
    vi.stubEnv('TAG_CACHE_BACKEND', 'r2-aggregate')
    const fetchMock = vi.fn(async () => {
      throw new Error('network should not be called')
    })
    global.fetch = fetchMock as any

    const { mod, kv, store } = await loadModule()
    const { enrichRankingItemsWithTagDetails } = mod

    const cached = {
      'sm-r2-kv-fallback': {
        tags: [
          { name: 'Fallback', isLocked: false }
        ],
        fetchedAt: new Date().toISOString(),
        source: 'getthumbinfo'
      }
    }

    const getSpy = vi.spyOn(kv, 'get').mockResolvedValue(cached)
    const setSpy = vi.spyOn(kv, 'set').mockResolvedValue()

    const items: RankingItem[] = [
      { rank: 1, id: 'sm-r2-kv-fallback', title: 't', thumbURL: '', views: 1 }
    ]

    const [result] = await enrichRankingItemsWithTagDetails(items, 1, 0, true)

    expect(result.tags).toEqual(['Fallback'])
    expect(fetchMock).not.toHaveBeenCalled()
    expect(getSpy).toHaveBeenCalled()
    expect(setSpy).not.toHaveBeenCalled()
    expect(store.hasTagCacheDelta()).toBe(false)
  })

  it('records failure entries in R2 aggregate delta', async () => {
    vi.stubEnv('TAG_CACHE_BACKEND', 'r2-aggregate')
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

    const { mod, kv, store } = await loadModule()
    const { enrichRankingItemsWithTagDetails } = mod

    vi.spyOn(kv, 'get').mockResolvedValue({})
    const setSpy = vi.spyOn(kv, 'set').mockResolvedValue()

    const items: RankingItem[] = [
      { rank: 1, id: 'sm-r2-failure', title: 't', thumbURL: '', views: 1 }
    ]

    await enrichRankingItemsWithTagDetails(items, 1, 0, true)
    const delta = store.getTagCacheDelta()
    const deltaEntries = Object.values(delta).flatMap(shard => Object.values(shard))

    expect(setSpy).not.toHaveBeenCalled()
    expect(deltaEntries).toHaveLength(1)
    expect(deltaEntries[0]).toEqual(
      expect.objectContaining({
        tags: [],
        source: 'getthumbinfo',
        fail: expect.objectContaining({ source: 'getthumbinfo' })
      })
    )
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
