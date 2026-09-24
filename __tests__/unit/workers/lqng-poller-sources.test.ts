import { describe, it, expect, vi } from 'vitest'
import {
  AccessLimitedError,
  fetchNewVideosFromNvapi,
  fetchSweepVideosFromSnapshot,
  fetchThumbInfoFromExt,
  fetchUserInfoFromNvapi,
  fetchNewVideosFromNicoPages,
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

  it('チャンネルの owner.id が ch 付き（"ch78"）で来ても channel/chch78 にしない', async () => {
    const fetchImpl = vi.fn(async () =>
      response({
        meta: { status: 200 },
        data: {
          hasNext: false,
          items: [
            { id: 'so7', title: 'c', registeredAt: '2026-01-01T00:02:00+09:00', isChannelVideo: true, owner: { id: 'ch78', ownerType: 'channel', name: 'ch' } },
            { id: 'so8', title: 'c', registeredAt: '2026-01-01T00:03:00+09:00', owner: { id: 'ch79', ownerType: 'channel', name: 'ch' } },
          ],
        },
      })
    )
    const videos = await fetchNewVideosFromNvapi(['t1'], '2026-01-01T00:00:00.000Z', fetchImpl as unknown as typeof fetch)
    expect(videos.map((v) => v.authorId)).toEqual(['channel/ch78', 'channel/ch79'])
  })

  it('403 はアクセス制限として投げる', async () => {
    const fetchImpl = vi.fn(async () => response('', 403, true))
    await expect(fetchNewVideosFromNvapi(['t'], '2026-01-01T00:00:00.000Z', fetchImpl as unknown as typeof fetch)).rejects.toBeInstanceOf(AccessLimitedError)
  })
})

describe('fetchThumbInfoFromExt', () => {
  const xml = (inner: string) => `<?xml version="1.0"?><nicovideo_thumb_response status="ok"><thumb>${inner}</thumb></nicovideo_thumb_response>`

  it('lock 属性付きタグと投稿者を取り出す（<tags> 要素は誤検出しない・&amp;lt; は二重復号しない）', async () => {
    const body = xml('<user_id>12</user_id><user_nickname>n &amp; m &amp;lt;x&amp;gt; &#39;q&#39;</user_nickname><tags domain="jp"><tag lock="1">A</tag><tag>B &lt;c&gt;</tag><tag lock="1">C</tag></tags>')
    const r = await fetchThumbInfoFromExt('sm1', vi.fn(async () => response(body, 200, true)) as unknown as typeof fetch)
    expect(r).toEqual({ ok: true, info: { tagDetails: [{ name: 'A', isLocked: true }, { name: 'B <c>', isLocked: false }, { name: 'C', isLocked: true }], ownerVisibility: 'visible', nickname: "n & m &lt;x&gt; 'q'" } })
  })

  it('5xx と 429 は上流の一時的な不調（unavailable）、それ以外の失敗は error', async () => {
    for (const status of [500, 502, 503, 429]) {
      expect(await fetchThumbInfoFromExt('sm1', vi.fn(async () => response('', status, true)) as unknown as typeof fetch)).toEqual({ ok: false, reason: 'unavailable' })
    }
    expect(await fetchThumbInfoFromExt('sm1', vi.fn(async () => response('', 404, true)) as unknown as typeof fetch)).toEqual({ ok: false, reason: 'error' })
    const notFound = '<nicovideo_thumb_response status="fail"><error><code>NOT_FOUND</code></error></nicovideo_thumb_response>'
    expect(await fetchThumbInfoFromExt('sm1', vi.fn(async () => response(notFound, 200, true)) as unknown as typeof fetch)).toEqual({ ok: false, reason: 'error' })
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
  it('200 は現存（フォロワー数付き）、NOT_FOUND 本文の 404 は削除、チャンネルは照会しない', async () => {
    const ok = vi.fn(async () => response({ data: { user: { nickname: 'n', followerCount: 7 } } }))
    expect(await fetchUserInfoFromNvapi('12', ok as unknown as typeof fetch)).toEqual({ status: 'existing', followerCount: 7, nickname: 'n' })
    const gone = vi.fn(async () => response({ meta: { status: 404, errorCode: 'NOT_FOUND' } }, 404))
    expect(await fetchUserInfoFromNvapi('12', gone as unknown as typeof fetch)).toEqual({ status: 'deleted', followerCount: null, nickname: null })
    const never = vi.fn()
    expect(await fetchUserInfoFromNvapi('channel/ch1', never as unknown as typeof fetch)).toEqual({ status: 'existing', followerCount: null, nickname: null })
    expect(never).not.toHaveBeenCalled()
  })

  it('本文が NOT_FOUND でない 404（HTML・別のエラー・壊れた JSON）は削除扱いにしない', async () => {
    const bodies = [
      response('<html>Not Found</html>', 404, true),
      response({ meta: { status: 404, errorCode: 'SOMETHING_ELSE' } }, 404),
      response({ meta: { status: 500, errorCode: 'NOT_FOUND' } }, 404),
      response('{"meta":', 404, true),
    ]
    for (const body of bodies) {
      const fetchImpl = vi.fn(async () => body)
      expect((await fetchUserInfoFromNvapi('12', fetchImpl as unknown as typeof fetch)).status).toBe('error')
    }
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

describe('fetchNewVideosFromNicoPages', () => {
  const T = (min: number): string => new Date(Date.UTC(2026, 8, 22, 0, 0) - min * 60_000).toISOString()
  const pageHtml = (items: Array<Record<string, unknown>>, hasNext: boolean) => {
    const payload = { data: { response: { $getSearchVideoV2: { data: { totalCount: 999, hasNext, items } } } } }
    const attr = JSON.stringify(payload).replace(/&/g, '&amp;').replace(/"/g, '&quot;')
    return `<html><head><meta name="server-response" content="${attr}"></head></html>`
  }
  const item = (id: string, minutesAgo: number, over: Record<string, unknown> = {}) => ({ id, title: `t-${id}`, registeredAt: T(minutesAgo), owner: { ownerType: 'user', id: '4001', name: 'n', visibility: 'visible' }, ...over })

  it('タグ×種別（動画/ショート）ごとに新しい順のページを読み、since より古い動画で止め、重複は 1 回にする', async () => {
    const calls: string[] = []
    const fetchImpl = vi.fn(async (url: string) => {
      calls.push(url)
      const u = new URL(url)
      const tag = decodeURIComponent(u.pathname.split('/').pop() ?? '')
      const shorts = u.pathname.startsWith('/tag_shorts/')
      const body = shorts
        ? pageHtml([item('ss5', 3), item('sm2', 20)], false) // ショート: 新規 1 件 + 重複 1 件
        : tag === 'tagA'
          ? pageHtml([item('sm1', 5), item('sm2', 20), item('sm3', 400)], true)
          : pageHtml([item('sm2', 20), item('sm9', 30, { owner: { ownerType: 'channel', id: '77' }, isChannelVideo: true })], false)
      return { ok: true, text: async () => body } as unknown as Response
    })
    const { videos, failures, requests } = await fetchNewVideosFromNicoPages(['tagA', 'tagB'], T(120), fetchImpl as unknown as typeof fetch)
    expect(calls).toHaveLength(4) // 2 タグ × 2 種別 × 1 ページ（tagA の動画は since より古い動画で打ち切り）
    expect(requests).toBe(4)
    expect(calls.some((u) => u.includes('/tag_shorts/') && u.includes('sort=registeredAt'))).toBe(true)
    expect(videos.map((v) => v.id)).toEqual(['ss5', 'sm1', 'sm2', 'sm9'])
    expect(videos.find((v) => v.id === 'sm9')?.authorId).toBe('channel/ch77')
    expect(failures).toEqual([])
  })

  it('ページ末尾まで since より新しい動画が続くときだけ 2 ページ目を読む', async () => {
    const full = Array.from({ length: 32 }, (_, i) => item(`p${i}`, i))
    const fetchImpl = vi.fn(async (url: string) => {
      const u = new URL(url)
      if (u.pathname.startsWith('/tag_shorts/')) return { ok: true, text: async () => pageHtml([], false) } as unknown as Response
      const page = u.searchParams.get('page') ?? '1'
      return { ok: true, text: async () => (page === '1' ? pageHtml(full, true) : pageHtml([item('q1', 40), item('q2', 500)], true)) } as unknown as Response
    })
    const { videos } = await fetchNewVideosFromNicoPages(['tagA'], T(120), fetchImpl as unknown as typeof fetch)
    expect(fetchImpl).toHaveBeenCalledTimes(3) // 動画 2 ページ + ショート 1 ページ（同じ内容が返るが重複除外）
    expect(videos).toHaveLength(33)
  })

  it('ページ送りは件数でなく hasNext で決める（32 件未満でも続きがあれば読む・空のページで止める）', async () => {
    // 形の崩れた項目が除かれて 30 件になったページ（続きあり）
    const short = Array.from({ length: 30 }, (_, i) => item(`p${i}`, i))
    const fetchImpl = vi.fn(async (url: string) => {
      const u = new URL(url)
      if (u.pathname.startsWith('/tag_shorts/')) return { ok: true, text: async () => pageHtml([], true) } as unknown as Response
      const page = u.searchParams.get('page') ?? '1'
      return { ok: true, text: async () => (page === '1' ? pageHtml(short, true) : pageHtml([item('q1', 40)], false)) } as unknown as Response
    })
    const { videos, requests } = await fetchNewVideosFromNicoPages(['tagA'], T(120), fetchImpl as unknown as typeof fetch)
    expect(videos).toHaveLength(31)
    expect(requests).toBe(3) // 動画 2 ページ + ショート 1 ページ（空なので hasNext でも止める）
  })

  it('ショートのページだけ失敗しても投げず、取れたページの動画を返して失敗したページを記録する', async () => {
    const fetchImpl = vi.fn(async (url: string) => {
      const u = new URL(url)
      if (u.pathname.startsWith('/tag_shorts/')) return { ok: false, status: 503, text: async () => '' } as unknown as Response
      return { ok: true, text: async () => pageHtml([item('sm1', 5)], false) } as unknown as Response
    })
    const r = await fetchNewVideosFromNicoPages(['tagA', 'tagB'], T(120), fetchImpl as unknown as typeof fetch)
    expect(r.videos.map((v) => v.id)).toEqual(['sm1'])
    // タグ名は出さず、設定の並び順の番号で記録する
    expect(r.failures).toEqual([
      { tagIndex: 0, kind: 'tag_shorts', page: 1, reason: 'nico_page_http_503' },
      { tagIndex: 1, kind: 'tag_shorts', page: 1, reason: 'nico_page_http_503' },
    ])
  })

  it('403 はその種別のページだけ打ち切り、別の種別（通常動画）は残りのタグも読む', async () => {
    const calls: string[] = []
    const fetchImpl = vi.fn(async (url: string) => {
      calls.push(url)
      if (new URL(url).pathname.startsWith('/tag_shorts/')) return { ok: false, status: 403, text: async () => '' } as unknown as Response
      return { ok: true, text: async () => pageHtml([item('sm1', 5)], false) } as unknown as Response
    })
    const r = await fetchNewVideosFromNicoPages(['tagA', 'tagB'], T(120), fetchImpl as unknown as typeof fetch)
    // tagA の動画・ショート（403）と tagB の動画。tagB のショートは 403 の後なので送らない
    expect(calls.map((u) => new URL(u).pathname.split('/')[1])).toEqual(['tag', 'tag_shorts', 'tag'])
    expect(r.requests).toBe(3)
    expect(r.videos.map((v) => v.id)).toEqual(['sm1'])
    expect(r.failures).toEqual([
      { tagIndex: 0, kind: 'tag_shorts', page: 1, reason: 'nico_page_http_403' },
      { tagIndex: 1, kind: 'tag_shorts', page: 1, reason: 'skipped_after_403' },
    ])
  })

  it('全部のページが取れなくても投げず、取れなかったページを返す（呼び出し側で nvapi に縮退する）', async () => {
    const fetchImpl = vi.fn(async () => ({ ok: true, text: async () => '<html></html>' }) as unknown as Response)
    const r = await fetchNewVideosFromNicoPages(['tagA'], T(120), fetchImpl as unknown as typeof fetch)
    expect(r.videos).toEqual([])
    expect(r.requests).toBe(2) // 動画・ショートとも 1 ページ目で失敗
    expect(r.failures.map((f) => `${f.kind}:${f.reason}`)).toEqual(['tag:server-response meta not found', 'tag_shorts:server-response meta not found'])
  })
})
