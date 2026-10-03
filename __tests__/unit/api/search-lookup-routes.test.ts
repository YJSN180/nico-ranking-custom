// @vitest-environment node
// 動画IDで開く（/api/search/videos）とユーザー検索（/api/search/users）のテスト。上流は合成した fetch で置き換える。
// 動画 ID・ユーザー ID・名前はすべて合成値。
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { NextRequest } from 'next/server'

const kvStore = vi.hoisted(() => new Map<string, unknown>())
vi.mock('@/lib/simple-kv', () => ({
  kv: {
    get: vi.fn(async () => null),
    getStrict: vi.fn(async (key: string) => kvStore.get(key) ?? null),
    set: vi.fn(),
  },
}))

import { GET as getVideos } from '@/app/api/search/videos/route'
import { GET as getUsers } from '@/app/api/search/users/route'
import { resetServerNGListState } from '@/lib/ng-list-server'
import { enrichmentRateLimit, searchRateLimit } from '@/lib/search/rate-limit'

const json = (body: unknown, status = 200): Response =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  })

let userSearchStatus = 200
const fakeFetch = vi.fn(
  async (input: string | URL | Request): Promise<Response> => {
    const url = new URL(
      typeof input === 'string'
        ? input
        : input instanceof URL
          ? input.href
          : input.url,
    )
    const videoId = url.pathname.match(/\/v3_guest\/(\w+)$/)?.[1]
    if (videoId) {
      if (videoId === 'sm404')
        return json({ meta: { status: 404, errorCode: 'NOT_FOUND' } }, 404)
      if (videoId === 'sm500') return json({}, 500)
      return json({
        meta: { status: 200 },
        data: {
          video: {
            title: `title-${videoId}`,
            count: { view: 1 },
            thumbnail: { url: `https://nicovideo.cdn.nimg.jp/t/${videoId}` },
          },
          owner: {
            id: videoId === 'sm3' ? 2002 : 1001,
            nickname: `user-${videoId}`,
          },
          channel: null,
          tag: { items: [] },
        },
      })
    }
    if (
      url.hostname === 'nvapi.nicovideo.jp' &&
      url.pathname === '/v1/search/user'
    ) {
      if (userSearchStatus !== 200) return json({}, userSearchStatus)
      return json({
        data: {
          totalCount: 3,
          items: [
            { id: 1001, nickname: 'name-a', followerCount: 5, videoCount: 1 },
            {
              id: 2002,
              nickname: 'blocked-by-id',
              followerCount: 4,
              videoCount: 1,
            },
            {
              id: 3003,
              nickname: 'spam-name',
              followerCount: 3,
              videoCount: 1,
            },
          ],
        },
      })
    }
    throw new Error(`unexpected fetch: ${url.href}`)
  },
)

describe('/api/search/videos と /api/search/users', () => {
  beforeEach(() => {
    kvStore.clear()
    userSearchStatus = 200
    fakeFetch.mockClear()
    resetServerNGListState()
    enrichmentRateLimit.reset()
    searchRateLimit.reset()
    vi.stubGlobal('fetch', fakeFetch)
  })
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('videos: 見つかった動画を入力順に返し、見つからない・失敗を分ける（部分失敗は CDN に長く置かない）', async () => {
    const res = await getVideos(
      new NextRequest(
        'http://localhost/api/search/videos?ids=sm2%2Csm404%2Csm1%2Csm500',
      ),
    )
    expect(res.status).toBe(200)
    const body = (await res.json()) as {
      items: Array<{ id: string }>
      missing: string[]
      failed: string[]
      hiddenIds: string[]
    }
    expect(body.items.map((item) => item.id)).toEqual(['sm2', 'sm1'])
    expect(body.missing).toEqual(['sm404'])
    expect(body.failed).toEqual(['sm500'])
    expect(body.hiddenIds).toEqual([])
    expect(res.headers.get('cache-control')).toContain('s-maxage=30')
  })

  it('videos: 管理者 NG に当たる動画は中身を返さず hiddenIds で知らせる', async () => {
    kvStore.set('ng-list-manual', {
      videoIds: ['sm1'],
      videoTitles: { exact: [], partial: [] },
      authorIds: ['2002'],
      authorNames: { exact: [], partial: [] },
    })
    const res = await getVideos(
      new NextRequest('http://localhost/api/search/videos?ids=sm1%2Csm2%2Csm3'),
    )
    const body = (await res.json()) as {
      items: Array<{ id: string }>
      hiddenIds: string[]
    }
    expect(body.items.map((item) => item.id)).toEqual(['sm2'])
    expect(body.hiddenIds).toEqual(['sm1', 'sm3'])
  })

  it('videos: 正規形でない問い合わせ（並べ替え・余分なキー）と ID 無しは上流に送らない', async () => {
    expect(
      (
        await getVideos(
          new NextRequest('http://localhost/api/search/videos?ids=sm1,sm2'),
        )
      ).status,
    ).toBe(400)
    expect(
      (
        await getVideos(
          new NextRequest('http://localhost/api/search/videos?ids=sm1&x=1'),
        )
      ).status,
    ).toBe(400)
    expect(
      (
        await getVideos(
          new NextRequest('http://localhost/api/search/videos?ids=bad'),
        )
      ).status,
    ).toBe(400)
    expect(fakeFetch).not.toHaveBeenCalled()
  })

  it('users: 管理者 NG（ID・名前）に当たるユーザーを除き、成功はキャッシュできる', async () => {
    kvStore.set('ng-list-manual', {
      videoIds: [],
      videoTitles: { exact: [], partial: [] },
      authorIds: ['2002'],
      authorNames: { exact: [], partial: ['spam'] },
    })
    const res = await getUsers(
      new NextRequest('http://localhost/api/search/users?q=name'),
    )
    expect(res.status).toBe(200)
    const body = (await res.json()) as {
      items: Array<{ id: string }>
      totalCount: number
      page: number
    }
    expect(body.items.map((item) => item.id)).toEqual(['1001'])
    expect(body).toMatchObject({ totalCount: 3, page: 1 })
    expect(res.headers.get('cache-control')).toContain('s-maxage=300')
  })

  it('users: 上流の失敗は 502（キャッシュしない）、空の語・正規形でない問い合わせは 400', async () => {
    userSearchStatus = 503
    const failed = await getUsers(
      new NextRequest('http://localhost/api/search/users?q=name'),
    )
    expect(failed.status).toBe(502)
    expect(failed.headers.get('cache-control')).toBe('no-store')
    expect(
      (await getUsers(new NextRequest('http://localhost/api/search/users?q=')))
        .status,
    ).toBe(400)
    expect(
      (
        await getUsers(
          new NextRequest(
            'http://localhost/api/search/users?sort=followers&q=name',
          ),
        )
      ).status,
    ).toBe(400)
  })
})
