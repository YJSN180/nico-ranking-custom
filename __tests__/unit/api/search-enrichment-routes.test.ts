// @vitest-environment node
// 検索結果の後付け API（/api/search/owners, /api/search/realtime-tags）のテスト。上流は合成した fetch で置き換える。
// ユーザー ID・動画 ID・名前はすべて合成値。
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { NextRequest } from 'next/server'

// KV はキー→値の表（未設定は null）
const kvStore = vi.hoisted(() => new Map<string, unknown>())
vi.mock('@/lib/simple-kv', () => ({
  kv: { get: vi.fn(async () => null), getStrict: vi.fn(async (key: string) => kvStore.get(key) ?? null), set: vi.fn() },
}))

import { GET as getOwners } from '@/app/api/search/owners/route'
import { GET as getRealtimeTags } from '@/app/api/search/realtime-tags/route'
import { clearOwnerInfoCache } from '@/lib/search/owner-info'

const json = (body: unknown, status = 200): Response =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })

/** hangIds に入れた ID の問い合わせは、中断されるまで応答しない */
let hangIds = new Set<string>()
/** 動画ごとのタグ（未指定はロックなしのタグ 1 個） */
let tagItemsById: Record<string, Array<{ name: string; isLocked: boolean }>> = {}

const hang = (signal?: AbortSignal | null): Promise<Response> =>
  new Promise((_resolve, reject) => {
    if (signal?.aborted) return reject(signal.reason)
    signal?.addEventListener('abort', () => reject(signal.reason), { once: true })
  })

const fakeFetch = vi.fn(async (input: string | URL | Request, init?: RequestInit): Promise<Response> => {
  const url = new URL(typeof input === 'string' ? input : input instanceof URL ? input.href : input.url)
  if (init?.signal?.aborted) throw init.signal.reason
  const userId = url.pathname.match(/^\/v1\/users\/(\d+)$/)?.[1]
  if (url.hostname === 'nvapi.nicovideo.jp' && userId) {
    if (hangIds.has(userId)) return hang(init?.signal)
    return json({ data: { user: { nickname: `user-${userId}`, icons: { small: `https://icon.example/${userId}.jpg` } } } })
  }
  const videoId = url.pathname.match(/\/v3_guest\/(\w+)$/)?.[1]
  if (videoId) {
    if (hangIds.has(videoId)) return hang(init?.signal)
    // so で始まる動画はチャンネル ch5000+番号、それ以外はユーザー 1001 の投稿
    const owner = videoId.startsWith('so')
      ? { owner: null, channel: { id: `ch${5000 + Number(videoId.slice(2))}`, name: `channel-${videoId}` } }
      : { owner: { id: 1001 }, channel: null }
    const tags = tagItemsById[videoId] ?? [{ name: `tag-${videoId}`, isLocked: false }]
    return json({ meta: { status: 200 }, data: { ...owner, tag: { items: tags } } })
  }
  throw new Error(`unexpected fetch: ${url.href}`)
})

describe('/api/search/owners と /api/search/realtime-tags: 全体の期限（S-e）', () => {
  let deadline: AbortController | null = null

  beforeEach(() => {
    hangIds = new Set()
    tagItemsById = {}
    kvStore.clear()
    deadline = null
    fakeFetch.mockClear()
    clearOwnerInfoCache()
    vi.stubGlobal('fetch', fakeFetch)
    // 1 件ごとのタイムアウトは発火させず、8 秒の全体の期限だけをテストから切る
    vi.spyOn(AbortSignal, 'timeout').mockImplementation((ms: number) => {
      const controller = new AbortController()
      if (ms === 8000) deadline = controller
      return controller.signal
    })
  })

  afterEach(() => {
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
  })

  const expire = (): void => {
    deadline?.abort(new DOMException('The operation was aborted due to timeout', 'TimeoutError'))
  }

  it('owners: 応答しない問い合わせは期限で打ち切り、取れた分を返す（部分失敗は CDN に長く置かない）', async () => {
    hangIds = new Set(['1002'])
    const pending = getOwners(new NextRequest('http://localhost/api/search/owners?users=1001,1002'))
    await vi.waitFor(() => expect(fakeFetch).toHaveBeenCalledTimes(2))
    expire()
    const res = await pending
    expect(res.status).toBe(200)
    const body = (await res.json()) as { users: Record<string, { name: string }>; failed: string[] }
    expect(Object.keys(body.users)).toEqual(['1001'])
    expect(body.failed).toEqual(['1002'])
    expect(res.headers.get('cache-control')).not.toContain('s-maxage=86400')
  })

  it('realtime-tags: 応答しない問い合わせは期限で打ち切り、取れた分を返す', async () => {
    hangIds = new Set(['sm12'])
    const pending = getRealtimeTags(new NextRequest('http://localhost/api/search/realtime-tags?ids=sm11,sm12'))
    await vi.waitFor(() => expect(fakeFetch).toHaveBeenCalledTimes(2))
    expire()
    const res = await pending
    expect(res.status).toBe(200)
    const body = (await res.json()) as { tagDetails: Record<string, unknown>; failed: string[] }
    expect(Object.keys(body.tagDetails)).toEqual(['sm11'])
    expect(body.failed).toEqual(['sm12'])
    expect(res.headers.get('cache-control')).not.toContain('s-maxage=300')
  })
})

describe('/api/search/owners と /api/search/realtime-tags: 検索で効かない NG（S-f）', () => {
  beforeEach(() => {
    hangIds = new Set()
    tagItemsById = {}
    kvStore.clear()
    fakeFetch.mockClear()
    clearOwnerInfoCache()
    vi.stubGlobal('fetch', fakeFetch)
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  const locked = (...names: string[]) => names.map((name) => ({ name, isLocked: true }))

  it('owners: 管理者の投稿者名 NG（完全一致・部分一致）に当たる投稿者を hiddenAuthorIds で返す', async () => {
    kvStore.set('ng-list-manual', {
      videoIds: [],
      videoTitles: { exact: [], partial: [] },
      authorIds: [],
      authorNames: { exact: ['user-1002'], partial: ['-so5'] },
    })
    const res = await getOwners(new NextRequest('http://localhost/api/search/owners?users=1001,1002&videos=so5,so6'))
    expect(res.status).toBe(200)
    const body = (await res.json()) as { users: Record<string, unknown>; hiddenAuthorIds: string[] }
    expect(Object.keys(body.users).sort()).toEqual(['1001', '1002'])
    expect(body.hiddenAuthorIds).toEqual(['1002', 'channel/ch5005'])
    // 管理者 NG の変更を数分で反映させるため、成功時も 1 日は置かない
    expect(res.headers.get('cache-control')).not.toContain('s-maxage=86400')
  })

  it('owners: 投稿者名 NG が無ければ hiddenAuthorIds は空', async () => {
    const res = await getOwners(new NextRequest('http://localhost/api/search/owners?users=1001'))
    expect(((await res.json()) as { hiddenAuthorIds: string[] }).hiddenAuthorIds).toEqual([])
  })

  it('realtime-tags: ロックタグ規則 D に当たる動画を hiddenIds で返す（許可リストの投稿者・動画は除く）', async () => {
    kvStore.set('lqng:config', {
      enabled: true,
      tagGroups: [['g1'], ['g2']],
      lockGroupsMin: 2,
      allowlist: { authorIds: ['channel/ch5007'], videoIds: ['sm14'] },
    })
    tagItemsById = {
      sm11: locked('g1', 'g2'),
      sm12: locked('g1'),
      so7: locked('g1', 'g2'),
      sm14: locked('g1', 'g2'),
    }
    const res = await getRealtimeTags(new NextRequest('http://localhost/api/search/realtime-tags?ids=sm11,sm12,so7,sm14'))
    expect(res.status).toBe(200)
    const body = (await res.json()) as { tagDetails: Record<string, unknown>; hiddenIds: string[] }
    expect(Object.keys(body.tagDetails).sort()).toEqual(['sm11', 'sm12', 'sm14', 'so7'])
    expect(body.hiddenIds).toEqual(['sm11'])
  })

  it('realtime-tags: 自動 NG が無効なら何も隠さない', async () => {
    kvStore.set('lqng:config', { enabled: false, tagGroups: [['g1'], ['g2']], lockGroupsMin: 2 })
    tagItemsById = { sm11: locked('g1', 'g2') }
    const res = await getRealtimeTags(new NextRequest('http://localhost/api/search/realtime-tags?ids=sm11'))
    expect(((await res.json()) as { hiddenIds: string[] }).hiddenIds).toEqual([])
  })
})
