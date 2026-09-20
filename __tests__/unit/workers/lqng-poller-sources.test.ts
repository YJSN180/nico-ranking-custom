import { describe, it, expect, vi } from 'vitest'
import {
  AccessLimitedError,
  fetchNewVideosFromNvapi,
  fetchSweepVideosFromSnapshot,
  fetchThumbInfoFromExt,
  fetchUserInfoFromNvapi,
} from '@/workers/lqng-poller/src/sources'

// 応答の形は実測に基づくが、値はすべて合成
const response = (body: unknown, status = 200, text = false) =>
  ({ ok: status >= 200 && status < 300, status, json: async () => body, text: async () => (text ? String(body) : JSON.stringify(body)) }) as unknown as Response

describe('fetchNewVideosFromNvapi', () => {
  it('タグを OR で結合し、投稿者 ID・可視性・チャンネルを写像する', async () => {
    const fetchImpl = vi.fn(async (url: string) =>
      response({
        meta: { status: 200 },
        data: {
          hasNext: false,
          items: [
            { id: 'sm1', title: 'a', registeredAt: '2026-01-01T00:00:00+09:00', owner: { id: 12, ownerType: 'user', visibility: 'visible', name: 'n' } },
            { id: 'sm2', title: 'b', registeredAt: '2026-01-01T00:01:00+09:00', owner: { id: 34, ownerType: 'user', visibility: 'hidden', name: null } },
            { id: 'so3', title: 'c', registeredAt: '2026-01-01T00:02:00+09:00', isChannelVideo: true, owner: { id: 56, ownerType: 'channel', name: 'ch' } },
            { id: 'sm4', title: 'd', registeredAt: '2026-01-01T00:03:00+09:00', owner: null },
            { title: 'broken' },
          ],
        },
      })
    )
    const videos = await fetchNewVideosFromNvapi(['t1', 't2'], '2026-01-01T00:00:00.000Z', fetchImpl as unknown as typeof fetch)
    const url = new URL((fetchImpl.mock.calls[0] as unknown as [string])[0])
    expect(url.searchParams.get('tag')).toBe('t1 OR t2')
    expect(url.searchParams.get('minRegisteredAt')).toBe('2026-01-01T00:00:00.000Z')
    expect(videos.map((v) => [v.id, v.authorId, v.ownerVisibility])).toEqual([
      ['sm1', '12', 'visible'],
      ['sm2', '34', 'hidden'],
      ['so3', 'channel/ch56', 'visible'],
      ['sm4', null, null],
    ])
  })

  it('403 はアクセス制限として投げる', async () => {
    const fetchImpl = vi.fn(async () => response('', 403, true))
    await expect(fetchNewVideosFromNvapi(['t'], '2026-01-01T00:00:00.000Z', fetchImpl as unknown as typeof fetch)).rejects.toBeInstanceOf(AccessLimitedError)
  })
})

describe('fetchThumbInfoFromExt', () => {
  const xml = (inner: string) => `<?xml version="1.0"?><nicovideo_thumb_response status="ok"><thumb>${inner}</thumb></nicovideo_thumb_response>`

  it('lock 属性付きタグと投稿者を取り出す（<tags> 要素は誤検出しない）', async () => {
    const body = xml('<user_id>12</user_id><user_nickname>n &amp; m</user_nickname><tags domain="jp"><tag lock="1">A</tag><tag>B &lt;c&gt;</tag><tag lock="1">C</tag></tags>')
    const r = await fetchThumbInfoFromExt('sm1', vi.fn(async () => response(body, 200, true)) as unknown as typeof fetch)
    expect(r).toEqual({ ok: true, info: { tagDetails: [{ name: 'A', isLocked: true }, { name: 'B <c>', isLocked: false }, { name: 'C', isLocked: true }], ownerVisibility: 'visible', nickname: 'n & m' } })
  })

  it('投稿者が空なら hidden、削除済みは deleted、403 はアクセス制限', async () => {
    const hidden = xml('<tags><tag lock="1">A</tag></tags>')
    const r1 = await fetchThumbInfoFromExt('sm1', vi.fn(async () => response(hidden, 200, true)) as unknown as typeof fetch)
    expect(r1.ok && r1.info.ownerVisibility).toBe('hidden')
    const fail = '<nicovideo_thumb_response status="fail"><error><code>DELETED</code></error></nicovideo_thumb_response>'
    expect(await fetchThumbInfoFromExt('sm1', vi.fn(async () => response(fail, 200, true)) as unknown as typeof fetch)).toEqual({ ok: false, reason: 'deleted' })
    await expect(fetchThumbInfoFromExt('sm1', vi.fn(async () => response('', 403, true)) as unknown as typeof fetch)).rejects.toBeInstanceOf(AccessLimitedError)
  })
})

describe('fetchUserInfoFromNvapi', () => {
  it('200 は現存（フォロワー数付き）、404 は削除、チャンネルは照会しない', async () => {
    const ok = vi.fn(async () => response({ data: { user: { nickname: 'n', followerCount: 7 } } }))
    expect(await fetchUserInfoFromNvapi('12', ok as unknown as typeof fetch)).toEqual({ status: 'existing', followerCount: 7, nickname: 'n' })
    const gone = vi.fn(async () => response({ meta: { status: 404 } }, 404))
    expect(await fetchUserInfoFromNvapi('12', gone as unknown as typeof fetch)).toEqual({ status: 'deleted', followerCount: null, nickname: null })
    const never = vi.fn()
    expect(await fetchUserInfoFromNvapi('channel/ch1', never as unknown as typeof fetch)).toEqual({ status: 'existing', followerCount: null, nickname: null })
    expect(never).not.toHaveBeenCalled()
  })
})

describe('fetchSweepVideosFromSnapshot', () => {
  it('JST の 1 日分を範囲指定で取り、ページを進める', async () => {
    const fetchImpl = vi.fn(async (url: string) => {
      const offset = Number(new URL(url).searchParams.get('_offset'))
      const items = offset === 0 ? Array.from({ length: 100 }, (_, i) => ({ contentId: `sm${i}`, title: 't', userId: 1, channelId: null, startTime: '2026-01-31T10:00:00+09:00' })) : [{ contentId: 'sm100', title: 't', userId: null, channelId: 9, startTime: '2026-01-31T11:00:00+09:00' }]
      return response({ meta: { status: 200, totalCount: 101 }, data: items })
    })
    const videos = await fetchSweepVideosFromSnapshot('genreX', '2026-01-31', fetchImpl as unknown as typeof fetch)
    expect(videos).toHaveLength(101)
    expect(videos[100]?.authorId).toBe('channel/ch9')
    const url = new URL((fetchImpl.mock.calls[0] as unknown as [string])[0])
    expect(url.searchParams.get('filters[startTime][gte]')).toBe('2026-01-31T00:00:00+09:00')
    expect(url.searchParams.get('filters[startTime][lt]')).toBe('2026-02-01T00:00:00+09:00')
    expect(fetchImpl).toHaveBeenCalledTimes(2)
  })
})
