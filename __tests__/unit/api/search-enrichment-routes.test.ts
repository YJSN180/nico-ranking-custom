// @vitest-environment node
// 検索結果の後付け API（/api/search/owners, /api/search/realtime-tags）のテスト。上流は合成した fetch で置き換える。
// ユーザー ID・動画 ID・名前はすべて合成値。
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { NextRequest } from 'next/server'

vi.mock('@/lib/simple-kv', () => ({
  kv: { get: vi.fn(async () => null), getStrict: vi.fn(async () => null), set: vi.fn() },
}))

import { GET as getOwners } from '@/app/api/search/owners/route'
import { GET as getRealtimeTags } from '@/app/api/search/realtime-tags/route'
import { clearOwnerInfoCache } from '@/lib/search/owner-info'

const json = (body: unknown, status = 200): Response =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })

/** hangIds に入れた ID の問い合わせは、中断されるまで応答しない */
let hangIds = new Set<string>()

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
    return json({ meta: { status: 200 }, data: { owner: { id: 1001 }, channel: null, tag: { items: [{ name: `tag-${videoId}`, isLocked: false }] } } })
  }
  throw new Error(`unexpected fetch: ${url.href}`)
})

describe('/api/search/owners と /api/search/realtime-tags: 全体の期限（S-e）', () => {
  let deadline: AbortController | null = null

  beforeEach(() => {
    hangIds = new Set()
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
