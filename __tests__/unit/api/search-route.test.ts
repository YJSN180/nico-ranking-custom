// @vitest-environment node
// /api/search のルート本体のテスト。Snapshot・nvapi・本家ページを合成した上流（fakeFetch）で、
// 索引（Snapshot）と新着（nvapi・本家ページ）の区間の分け方と、代わりの経路を確かめる。
// 動画 ID と投稿時刻はすべて合成値。
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { NextRequest } from 'next/server'

// 管理者 NG・自動 NG は空（KV は未設定）。kvHang のときは期限（signal）で中断されるまで応答しない
let kvHang = false
vi.mock('@/lib/simple-kv', () => ({
  kv: {
    get: vi.fn(async () => null),
    getStrict: vi.fn(async (_key: string, options?: { signal?: AbortSignal }) => {
      if (!kvHang) return null
      return new Promise((_resolve, reject) => {
        options?.signal?.addEventListener('abort', () => reject(new Error('KV get aborted')), { once: true })
      })
    }),
    set: vi.fn(),
  },
}))

import { GET } from '@/app/api/search/route'
import { clearFreshCache } from '@/lib/search/fresh-segment'
import { formatJstIso } from '@/lib/search/realtime-search'
import { kv } from '@/lib/simple-kv'
import { searchRateLimit } from '@/lib/search/rate-limit'

type Kind = 'long' | 'short'

interface FakeVideo {
  id: string
  at: string
  kind: Kind
  /** Snapshot の索引にある */
  indexed: boolean
  /** nvapi の索引にある（ショートは常に無い） */
  nvapi: boolean
  /** 再生時間（秒）。省略時は長尺 300・ショート 30 */
  duration?: number
}

const durationOf = (v: FakeVideo): number => v.duration ?? (v.kind === 'short' ? 30 : 300)
/** nvapi が返せる深さ（page×pageSize が 5,000 件まで。2026-09-27 実測） */
const NVAPI_DEPTH = 5000

interface SearchBody {
  items: Array<{ id: string; rank: number }>
  totalCount: number
  source: 'merged' | 'snapshot'
  boundary: string
  realtimeCount: number
  realtimeError?: string
  freshError?: string
  realtimeGap?: { from: string; to: string }
}

const ms = (iso: string): number => new Date(iso).getTime()
const jst = (time: string, day = 22): string => `2026-09-${day}T${time}+09:00`
// 本家と同じ +09:00 表記にそろえる（新着区間は投稿時刻の文字列で並べ直すため）
const isoAt = (msValue: number): string => formatJstIso(new Date(msValue))

let videos: FakeVideo[] = []
let nvapiStatus = 200
let pageStatus = 200
/** 本家のショートのページ（/search_shorts, /tag_shorts）だけの HTTP ステータス */
let shortsPageStatus = 200
/** Snapshot の境界の問い合わせ（新しい順・1 件）の HTTP ステータス */
let boundaryStatus = 200
/** Snapshot のページ取得（境界の問い合わせ以外）の HTTP ステータス。400 は本物と同じ JSON 本文で返す */
let snapshotPageStatus = 200
/** Snapshot のページ取得（境界の問い合わせ以外）が、中断されるまで応答しない */
let snapshotPageHang = false
let calls: URL[] = []

const hang = (signal?: AbortSignal | null): Promise<Response> =>
  new Promise((_resolve, reject) => {
    if (signal?.aborted) return reject(signal.reason)
    signal?.addEventListener('abort', () => reject(signal.reason), { once: true })
  })

const json = (body: unknown, status = 200): Response =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })

const byNewest = (a: FakeVideo, b: FakeVideo): number => ms(b.at) - ms(a.at)

function snapshotResponse(url: URL): Response {
  const p = url.searchParams
  let list = videos.filter((v) => v.indexed)
  const contentType = p.get('filters[contentType][0]')
  if (contentType) list = list.filter((v) => v.kind === contentType)
  const gte = p.get('filters[startTime][gte]')
  const lt = p.get('filters[startTime][lt]')
  const lte = p.get('filters[startTime][lte]')
  if (gte) list = list.filter((v) => ms(v.at) >= ms(gte))
  if (lt) list = list.filter((v) => ms(v.at) < ms(lt))
  if (lte) list = list.filter((v) => ms(v.at) <= ms(lte))
  const lengthGte = p.get('filters[lengthSeconds][gte]')
  const lengthLte = p.get('filters[lengthSeconds][lte]')
  if (lengthGte) list = list.filter((v) => durationOf(v) >= Number(lengthGte))
  if (lengthLte) list = list.filter((v) => durationOf(v) <= Number(lengthLte))
  list.sort(byNewest)
  const offset = Number(p.get('_offset') ?? 0)
  const limit = Number(p.get('_limit') ?? 50)
  const data = list.slice(offset, offset + limit).map((v) => ({
    contentId: v.id,
    title: `title ${v.id}`,
    thumbnailUrl: null,
    viewCounter: 10,
    commentCounter: 0,
    likeCounter: 0,
    mylistCounter: 0,
    lengthSeconds: durationOf(v),
    startTime: v.at,
    userId: 1001,
    channelId: null,
    tags: 'tag-a',
    genre: 'ゲーム',
  }))
  return json({ meta: { status: 200, totalCount: list.length }, data })
}

function nvapiResponse(url: URL): Response {
  if (nvapiStatus !== 200) return new Response('', { status: nvapiStatus })
  const p = url.searchParams
  const keyword = p.get('keyword')
  const tag = p.get('tag')
  // 実際の nvapi と同じく、keyword と tag はどちらか一方だけが必須（2026-09-25 実測）
  if (!keyword && !tag) return json({ meta: { status: 400, errorCode: 'INVALID_PARAMETER' } }, 400)
  if (keyword && tag) return json({ meta: { status: 400, errorCode: 'INVALID_PARAMETER' } }, 400)
  const min = p.get('minRegisteredAt')
  const max = p.get('maxRegisteredAt')
  // 再生時間は nvapi 側で絞れる（minDuration / maxDuration、どちらも端を含む。2026-09-27 実測）
  const minDuration = p.get('minDuration')
  const maxDuration = p.get('maxDuration')
  const list = videos
    .filter((v) => v.nvapi && v.kind === 'long')
    .filter((v) => (!min || ms(v.at) >= ms(min)) && (!max || ms(v.at) <= ms(max)))
    .filter((v) => (!minDuration || durationOf(v) >= Number(minDuration)) && (!maxDuration || durationOf(v) <= Number(maxDuration)))
    .sort(byNewest)
  const pageSize = Number(p.get('pageSize') ?? 100)
  const page = Number(p.get('page') ?? 1)
  // 5,000 件より深いページは 400。上限のページでは続きがあっても hasNext が false になる（実測）
  if (page * pageSize > NVAPI_DEPTH) return json({ meta: { status: 400, errorCode: 'INVALID_PARAMETER' } }, 400)
  const items = list.slice((page - 1) * pageSize, page * pageSize).map((v) => ({
    id: v.id,
    title: `title ${v.id}`,
    registeredAt: v.at,
    duration: durationOf(v),
    count: { view: 10, comment: 0, mylist: 0, like: 0 },
    owner: { id: 1001, name: 'user-1001', ownerType: 'user' },
  }))
  return json({ meta: { status: 200 }, data: { totalCount: list.length, hasNext: list.length > page * pageSize && page * pageSize < NVAPI_DEPTH, items } })
}

function pageResponse(url: URL): Response {
  if (pageStatus !== 200) return new Response('', { status: pageStatus })
  const kind: Kind = url.pathname.startsWith('/search_shorts') || url.pathname.startsWith('/tag_shorts') ? 'short' : 'long'
  if (kind === 'short' && shortsPageStatus !== 200) return new Response('', { status: shortsPageStatus })
  const page = Number(url.searchParams.get('page') ?? 1)
  const list = videos.filter((v) => v.kind === kind).sort(byNewest)
  const items = list.slice((page - 1) * 32, page * 32).map((v) => ({
    id: v.id,
    title: `title ${v.id}`,
    registeredAt: v.at,
    duration: durationOf(v),
    count: { view: 10, comment: 0, mylist: 0, like: 0 },
    owner: { id: '1001', name: 'user-1001', ownerType: 'user' },
  }))
  const payload = { data: { response: { $getSearchVideoV2: { data: { totalCount: list.length, hasNext: list.length > page * 32, items } } } } }
  const content = JSON.stringify(payload).replace(/&/g, '&amp;').replace(/"/g, '&quot;')
  return new Response(`<html><head><meta name="server-response" content="${content}"></head></html>`, { status: 200 })
}

const fakeFetch = vi.fn(async (input: string | URL | Request, init?: RequestInit): Promise<Response> => {
  const url = new URL(typeof input === 'string' ? input : input instanceof URL ? input.href : input.url)
  calls.push(url)
  // 実際の fetch と同じく、中断済みのシグナルでは即座に失敗する
  if (init?.signal?.aborted) throw init.signal.reason
  if (url.hostname === 'snapshot.search.nicovideo.jp') {
    if (url.searchParams.get('_limit') === '1' && boundaryStatus !== 200) return new Response('', { status: boundaryStatus })
    if (snapshotPageHang && url.searchParams.get('_limit') !== '1') return hang(init?.signal)
    if (snapshotPageStatus === 400 && url.searchParams.get('_limit') !== '1') {
      return json({ meta: { status: 400, errorCode: 'QUERY_PARSE_ERROR', errorMessage: 'synthetic parse error' } }, 400)
    }
    if (snapshotPageStatus !== 200 && url.searchParams.get('_limit') !== '1') return new Response('', { status: snapshotPageStatus })
    return snapshotResponse(url)
  }
  if (url.hostname === 'nvapi.nicovideo.jp') return nvapiResponse(url)
  if (url.hostname === 'www.nicovideo.jp') return pageResponse(url)
  throw new Error(`unexpected fetch: ${url.href}`)
})

async function search(query: string): Promise<{ status: number; body: SearchBody }> {
  const res = await GET(new NextRequest(`http://localhost/api/search?${query}`))
  return { status: res.status, body: (await res.json()) as SearchBody }
}

const ids = (body: SearchBody): string[] => body.items.map((it) => it.id)
const callsTo = (host: string): URL[] => calls.filter((u) => u.hostname === host)
const encodeGenre = encodeURIComponent('ゲーム')

/**
 * 索引は 2026-09-22 05:00 JST 時点。長尺は 04:00 から 1 時間おきに 60 本、ショートは 03:45 から 2 時間おきに 10 本。
 * 索引の後の新着: 長尺 06:00 / 06:30（nvapi にもある）、07:00（nvapi に未反映）、ショート 06:10。
 */
function seedWorld(): void {
  const hour = 60 * 60 * 1000
  videos = []
  for (let i = 0; i < 60; i++) {
    videos.push({ id: `sm${1060 - i}`, at: isoAt(ms(jst('04:00:00')) - i * hour), kind: 'long', indexed: true, nvapi: true })
  }
  for (let i = 0; i < 10; i++) {
    videos.push({ id: `ss${2001 + i}`, at: isoAt(ms(jst('03:45:00')) - i * 2 * hour), kind: 'short', indexed: true, nvapi: false })
  }
  videos.push({ id: 'sm9101', at: jst('06:00:00'), kind: 'long', indexed: false, nvapi: true })
  videos.push({ id: 'sm9102', at: jst('06:30:00'), kind: 'long', indexed: false, nvapi: true })
  videos.push({ id: 'sm9103', at: jst('07:00:00'), kind: 'long', indexed: false, nvapi: false })
  videos.push({ id: 'ss9101', at: jst('06:10:00'), kind: 'short', indexed: false, nvapi: false })
}

describe('/api/search: 索引の最新動画を欠かさない（H5）', () => {
  beforeEach(() => {
    seedWorld()
    nvapiStatus = 200
    pageStatus = 200
    shortsPageStatus = 200
    boundaryStatus = 200
    snapshotPageStatus = 200
    calls = []
    searchRateLimit.reset()
    fakeFetch.mockClear()
    clearFreshCache()
    vi.stubGlobal('fetch', fakeFetch)
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('キーワードだけの新しい順は、新着（nvapi と本家ページ）を先頭に、索引を境界の前から続ける', async () => {
    const { status, body } = await search('q=x&sort=-startTime')
    expect(status).toBe(200)
    expect(body.source).toBe('merged')
    expect(ids(body).slice(0, 6)).toEqual(['sm9103', 'sm9102', 'ss9101', 'sm9101', 'sm1060', 'ss2001'])
    expect(new Set(ids(body)).size).toBe(body.items.length)
    expect(body.realtimeGap).toBeUndefined()
  })

  it('索引の最新がショートでも、その動画を欠かさない', async () => {
    videos.push({ id: 'ss2999', at: jst('04:30:00'), kind: 'short', indexed: true, nvapi: false })
    const { body } = await search('q=x&sort=-startTime')
    expect(body.source).toBe('merged')
    expect(ids(body).slice(0, 6)).toEqual(['sm9103', 'sm9102', 'ss9101', 'sm9101', 'ss2999', 'sm1060'])
  })

  it('ジャンルだけの条件は nvapi が応じないので、合成せず索引だけを返す（最新を含む）', async () => {
    const { body } = await search(`sort=-startTime&genre=${encodeGenre}`)
    expect(body.source).toBe('snapshot')
    expect(ids(body)[0]).toBe('sm1060')
    expect(callsTo('nvapi.nicovideo.jp')).toHaveLength(0)
    expect(callsTo('www.nicovideo.jp')).toHaveLength(0)
  })

  it('キーワード＋AND タグも nvapi が応じないので、索引だけを返す（最新を含む）', async () => {
    const { body } = await search('q=x&sort=-startTime&tagAnd=y')
    expect(body.source).toBe('snapshot')
    expect(ids(body)[0]).toBe('sm1060')
    expect(callsTo('nvapi.nicovideo.jp')).toHaveLength(0)
  })

  it('nvapi が失敗したら、境界なしで Snapshot を取り直して索引だけを返す', async () => {
    nvapiStatus = 503
    const { body } = await search('q=x&sort=-startTime')
    expect(body.source).toBe('snapshot')
    expect(body.realtimeError).toBe('nvapi_http_503')
    expect(ids(body)[0]).toBe('sm1060')
    expect(body.items).toHaveLength(50)
    const unbounded = callsTo('snapshot.search.nicovideo.jp').filter((u) => u.searchParams.get('_limit') === '50' && !u.searchParams.has('filters[startTime][lt]'))
    expect(unbounded).toHaveLength(1)
  })

  it('Snapshot が条件を 400 で拒んだら、502 にせず「条件が不正」（search_query_error, 400）を返す', async () => {
    snapshotPageStatus = 400
    const { status, body } = await search('q=x')
    expect(status).toBe(400)
    expect(body).toMatchObject({ error: 'search_query_error' })
    // 合成の経路でも同じ
    const merged = await search('q=x&sort=-startTime')
    expect(merged.status).toBe(400)
    expect(merged.body).toMatchObject({ error: 'search_query_error' })
  })

  it('Snapshot のそれ以外の失敗は、これまでどおり上流の失敗（502）や保守中（503）として返す', async () => {
    snapshotPageStatus = 500
    expect((await search('q=x')).status).toBe(502)
    snapshotPageStatus = 503
    expect((await search('q=x')).body).toMatchObject({ error: 'search_maintenance' })
  })

  it('境界の問い合わせに失敗したら、05:00 を境界にして合成せず、索引だけを返す（1 日分を欠かさない）', async () => {
    boundaryStatus = 503
    const { status, body } = await search('q=x&sort=-startTime')
    expect(status).toBe(200)
    expect(body.source).toBe('snapshot')
    expect(body.realtimeError).toBeTruthy()
    expect(body.boundary).toBeUndefined()
    expect(ids(body)[0]).toBe('sm1060')
    expect(body.items).toHaveLength(50)
    expect(callsTo('nvapi.nicovideo.jp')).toHaveLength(0)
    expect(callsTo('www.nicovideo.jp')).toHaveLength(0)
    const pages = callsTo('snapshot.search.nicovideo.jp').filter((u) => u.searchParams.get('_limit') === '50')
    expect(pages.every((u) => !u.searchParams.has('filters[startTime][lt]'))).toBe(true)
  })

  it('ショートのページだけ取れなかったら、動画の最新（本家ページ）は使い、取れなかったことを知らせる', async () => {
    shortsPageStatus = 503
    const { body } = await search('q=x&sort=-startTime')
    expect(body.source).toBe('merged')
    expect(ids(body).slice(0, 4)).toEqual(['sm9103', 'sm9102', 'sm9101', 'sm1060'])
    expect(body.freshError).toBe('nico_page_http_503')
  })

  describe('ショートだけの検索', () => {
    it('本家ページ区間を先頭に、索引の最新のショートから続ける', async () => {
      const { body } = await search('q=x&contentType=short&sort=-startTime')
      expect(body.source).toBe('merged')
      expect(ids(body)).toEqual(['ss9101', ...Array.from({ length: 10 }, (_, i) => `ss${2001 + i}`)])
      expect(callsTo('nvapi.nicovideo.jp')).toHaveLength(0)
    })

    it('本家ページで表せない条件（ジャンル指定）は、索引だけを返す', async () => {
      const { body } = await search(`q=x&contentType=short&sort=-startTime&genre=${encodeGenre}`)
      expect(body.source).toBe('snapshot')
      expect(ids(body)[0]).toBe('ss2001')
      expect(callsTo('www.nicovideo.jp')).toHaveLength(0)
    })

    it('本家ページの取得に失敗したら、索引だけを返す（「リアルタイム込み」にしない）', async () => {
      pageStatus = 503
      const { body } = await search('q=x&contentType=short&sort=-startTime')
      expect(body.source).toBe('snapshot')
      expect(body.realtimeError).toContain('503')
      expect(ids(body)[0]).toBe('ss2001')
      expect(body.items).toHaveLength(10)
    })
  })
})

describe('/api/search: 受け付けるパラメータ（S-d）', () => {
  beforeEach(() => {
    seedWorld()
    nvapiStatus = 200
    pageStatus = 200
    shortsPageStatus = 200
    boundaryStatus = 200
    snapshotPageStatus = 200
    calls = []
    searchRateLimit.reset()
    fakeFetch.mockClear()
    clearFreshCache()
    vi.stubGlobal('fetch', fakeFetch)
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it.each([
    ['知らないパラメータ（キャッシュ外し）', 'q=x&sort=-startTime&_=123'],
    ['並べ替え', 'sort=-startTime&q=x'],
    ['既定値の明示', 'q=x&sort=-viewCounter'],
    ['数値の別表記', 'q=x&viewsMin=010'],
    ['同じキーの重複', 'q=x&q=y'],
    ['読めない境界', 'q=x&sort=-startTime&page=2&boundary=broken'],
  ])('%s は 400（invalid_params）にし、上流へ問い合わせず、CDN にも置かない', async (_label, query) => {
    const res = await GET(new NextRequest(`http://localhost/api/search?${query}`))
    expect(res.status).toBe(400)
    expect(await res.json()).toMatchObject({ error: 'invalid_params' })
    expect(res.headers.get('cache-control')).toContain('no-store')
    expect(calls).toHaveLength(0)
  })

  it('正規形の問い合わせは受け付ける', async () => {
    const { status } = await search('q=x&sort=-startTime&genre=%E3%82%B2%E3%83%BC%E3%83%A0&viewsMin=0&tagAnd=a&tagNot=b&page=2')
    expect(status).toBe(200)
  })
})

describe('/api/search: インスタンスごとの流量制限（S-d）', () => {
  beforeEach(() => {
    seedWorld()
    nvapiStatus = 200
    pageStatus = 200
    shortsPageStatus = 200
    boundaryStatus = 200
    snapshotPageStatus = 200
    calls = []
    searchRateLimit.reset()
    fakeFetch.mockClear()
    clearFreshCache()
    vi.stubGlobal('fetch', fakeFetch)
  })

  afterEach(() => {
    searchRateLimit.reset()
    vi.unstubAllGlobals()
  })

  const drain = (): void => {
    for (let i = 0; i < 1000 && searchRateLimit.take() === 0; i++) {
      // 上限まで使い切る
    }
  }

  it('上限を超えたら、上流へ問い合わせずに 429 を返す（Retry-After 付き、CDN に置かない）', async () => {
    drain()
    const res = await GET(new NextRequest('http://localhost/api/search?q=x&sort=-startTime'))
    expect(res.status).toBe(429)
    expect(await res.json()).toMatchObject({ error: 'rate_limited' })
    expect(Number(res.headers.get('retry-after'))).toBeGreaterThan(0)
    expect(res.headers.get('cache-control')).toContain('no-store')
    expect(calls).toHaveLength(0)
  })

  it('形の不正な問い合わせ（400）は上限を減らさない', async () => {
    for (let i = 0; i < 100; i++) {
      await GET(new NextRequest('http://localhost/api/search?q=x&_=1'))
    }
    expect((await search('q=x')).status).toBe(200)
  })
})

describe('/api/search: 投稿日時の範囲（S-c）', () => {
  beforeEach(() => {
    seedWorld()
    nvapiStatus = 200
    pageStatus = 200
    shortsPageStatus = 200
    boundaryStatus = 200
    snapshotPageStatus = 200
    calls = []
    searchRateLimit.reset()
    fakeFetch.mockClear()
    clearFreshCache()
    vi.stubGlobal('fetch', fakeFetch)
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('上限が索引の最新より前（過去の範囲）なら合成せず、索引だけを 2 回の問い合わせで返す', async () => {
    const dateFrom = encodeURIComponent('2026-09-20T00:00:00+09:00')
    const dateTo = encodeURIComponent('2026-09-21T23:59:59+09:00')
    const { body } = await search(`q=x&sort=-startTime&dateFrom=${dateFrom}&dateTo=${dateTo}`)
    expect(body.source).toBe('snapshot')
    expect(callsTo('nvapi.nicovideo.jp')).toHaveLength(0)
    expect(callsTo('www.nicovideo.jp')).toHaveLength(0)
    expect(calls).toHaveLength(2)
    // 範囲内の最新（09-21 23:45 のショート、23:00 の長尺）から並ぶ
    expect(ids(body).slice(0, 2)).toEqual(['ss2003', 'sm1055'])
  })

  it('上限が索引の最新以降なら、これまでどおり新着と合成する', async () => {
    const dateFrom = encodeURIComponent('2026-09-22T00:00:00+09:00')
    const dateTo = encodeURIComponent('2026-09-22T23:59:59+09:00')
    const { body } = await search(`q=x&sort=-startTime&dateFrom=${dateFrom}&dateTo=${dateTo}`)
    expect(body.source).toBe('merged')
    expect(ids(body)).toEqual(['sm9103', 'sm9102', 'ss9101', 'sm9101', 'sm1060', 'ss2001', 'sm1059', 'sm1058', 'ss2002', 'sm1057', 'sm1056'])
  })
})

describe('/api/search: 全体の期限（S-e）', () => {
  // 個々のタイムアウトは発火させず、12 秒の全体の期限だけをテストから切る
  let deadline: AbortController | null = null

  beforeEach(() => {
    seedWorld()
    nvapiStatus = 200
    pageStatus = 200
    shortsPageStatus = 200
    boundaryStatus = 200
    snapshotPageStatus = 200
    snapshotPageHang = false
    kvHang = false
    calls = []
    searchRateLimit.reset()
    deadline = null
    fakeFetch.mockClear()
    vi.mocked(kv.getStrict).mockClear()
    clearFreshCache()
    vi.stubGlobal('fetch', fakeFetch)
    vi.spyOn(AbortSignal, 'timeout').mockImplementation((ms: number) => {
      const controller = new AbortController()
      if (ms === 12_000) deadline = controller
      return controller.signal
    })
  })

  afterEach(() => {
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
    snapshotPageHang = false
    kvHang = false
  })

  const expire = (): void => {
    deadline?.abort(new DOMException('The operation was aborted due to timeout', 'TimeoutError'))
  }

  it('Snapshot が応答しなくても、期限で打ち切って search_timeout（504）を返す', async () => {
    snapshotPageHang = true
    const pending = search('q=x')
    await vi.waitFor(() => expect(callsTo('snapshot.search.nicovideo.jp').length).toBeGreaterThan(0))
    expire()
    const { status, body } = await pending
    expect(status).toBe(504)
    expect(body).toMatchObject({ error: 'search_timeout' })
  })

  it('KV（管理者 NG・自動 NG）が応答しなくても、期限で打ち切って結果を返す', async () => {
    kvHang = true
    const pending = search('q=x')
    await vi.waitFor(() => expect(vi.mocked(kv.getStrict)).toHaveBeenCalled())
    await vi.waitFor(() => expect(callsTo('snapshot.search.nicovideo.jp').length).toBeGreaterThan(0))
    expire()
    const { status, body } = await pending
    expect(status).toBe(200)
    expect(body.items.length).toBeGreaterThan(0)
  })

  it('新着の取得にも全体の期限を渡す（期限切れなら索引へ縮退し、索引も取れなければ 504）', async () => {
    const pending = search('q=x&sort=-startTime')
    expire()
    const { status } = await pending
    expect(status).toBe(504)
    for (const call of fakeFetch.mock.calls) {
      expect(call[1]?.signal?.aborted).toBe(true)
    }
  })
})

describe('/api/search: 新着区間の打ち切り（S-b）', () => {
  beforeEach(() => {
    seedWorld()
    nvapiStatus = 200
    pageStatus = 200
    shortsPageStatus = 200
    boundaryStatus = 200
    snapshotPageStatus = 200
    calls = []
    searchRateLimit.reset()
    fakeFetch.mockClear()
    clearFreshCache()
    vi.stubGlobal('fetch', fakeFetch)
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  /** 07:10 から 1 分おきに count 本の新着を足す */
  const addNewUploads = (kind: Kind, count: number): void => {
    for (let i = 0; i < count; i++) {
      videos.push({ id: `${kind === 'long' ? 'sm' : 'ss'}${60000 + i}`, at: isoAt(ms(jst('07:10:00')) + i * 60_000), kind, indexed: false, nvapi: kind === 'long' })
    }
  }

  it('再生数などの範囲を後から当てる検索は、先頭から 300 件までを読み、そこから境界までを realtimeGap で返す', async () => {
    addNewUploads('long', 310)
    const { body } = await search('q=x&sort=-startTime&viewsMin=1')
    expect(body.source).toBe('merged')
    expect(body.realtimeGap?.from).toBe('2026-09-22T04:00:01+09:00')
    // 新しい順に 300 件目は 07:20 の投稿
    expect(ms(body.realtimeGap?.to ?? '')).toBe(ms(jst('07:20:00')))
  })

  it('ショートだけの検索で本家ページの読み足しが上限に達したら、realtimeGap で返す', async () => {
    addNewUploads('short', 100)
    const { body } = await search('q=x&contentType=short&sort=-startTime')
    expect(body.source).toBe('merged')
    expect(body.realtimeGap?.from).toBe('2026-09-22T03:45:01+09:00')
    // 本家ページ 3 ページ（96 件）で打ち切り。96 件目は 07:14 の投稿
    expect(ms(body.realtimeGap?.to ?? '')).toBe(ms(jst('07:14:00')))
  })

  it('動画だけの検索では、本家ページが nvapi の最新まで届いていれば打ち切りにしない（その先は nvapi が受け持つ）', async () => {
    addNewUploads('long', 100)
    const { body } = await search('q=x&contentType=long&sort=-startTime')
    expect(body.source).toBe('merged')
    expect(body.realtimeGap).toBeUndefined()
  })
})

describe('/api/search: 新着が多い語のページ送り（S-b）', () => {
  // 境界の持ち回り（3 日以内）を確かめるため、時計だけを索引の日に合わせる（タイマーは本物のまま）
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date(jst('13:00:00')))
    seedWorld()
    // 索引より後の動画は、テストごとに足す
    videos = videos.filter((v) => v.indexed)
    nvapiStatus = 200
    pageStatus = 200
    shortsPageStatus = 200
    boundaryStatus = 200
    snapshotPageStatus = 200
    calls = []
    searchRateLimit.reset()
    fakeFetch.mockClear()
    clearFreshCache()
    vi.stubGlobal('fetch', fakeFetch)
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.unstubAllGlobals()
  })

  const BOUNDARY = '2026-09-22T04:00:01+09:00'

  /**
   * 境界の後の 04:30 から 5 秒おきに count 本の長尺を足す（sm700000 から。新しいほど番号が大きい）。
   * 新しい方から notIndexed 本は、nvapi の索引にまだ無い（反映の遅れ）
   */
  const addLongUploads = (count: number, notIndexed = 0): string[] => {
    const added: FakeVideo[] = []
    for (let i = 0; i < count; i++) {
      added.push({ id: `sm${700000 + i}`, at: isoAt(ms(jst('04:30:00')) + i * 5000), kind: 'long', indexed: false, nvapi: i < count - notIndexed })
    }
    videos.push(...added)
    return added.map((v) => v.id).reverse()
  }

  const indexedNewestFirst = (): string[] => videos.filter((v) => v.indexed).sort(byNewest).map((v) => v.id)

  /** 画面と同じく、前の応答の境界と新着件数を次のページに渡しながら 1 ページ目から読む */
  async function readPages(query: string, pages: number): Promise<Array<SearchBody & { nvapiCalls: number }>> {
    const bodies: Array<SearchBody & { nvapiCalls: number }> = []
    let hint = ''
    for (let page = 1; page <= pages; page++) {
      calls = []
    searchRateLimit.reset()
      const { status, body } = await search(`${query}${page > 1 ? `&page=${page}${hint}` : ''}`)
      expect(status).toBe(200)
      bodies.push({ ...body, nvapiCalls: callsTo('nvapi.nicovideo.jp').length })
      hint = `${body.realtimeCount > 0 ? `&rtCount=${body.realtimeCount}` : ''}&boundary=${encodeURIComponent(body.boundary)}`
    }
    return bodies
  }

  it('新着が 300 件を超えても、ページ送りに合わせて nvapi の続きを取り、境界まで欠かさずに索引へつなぐ', async () => {
    const uploads = addLongUploads(400)
    const bodies = await readPages('q=x&sort=-startTime', 10)
    const listed = bodies.flatMap(ids)
    expect(listed).toEqual([...uploads, ...indexedNewestFirst()])
    expect(bodies[0]?.realtimeCount).toBe(400)
    expect(bodies[0]?.totalCount).toBe(400 + indexedNewestFirst().length)
    expect(bodies.every((body) => body.realtimeGap === undefined)).toBe(true)
    expect(bodies.every((body) => body.boundary === BOUNDARY)).toBe(true)
    // 1 回の検索で nvapi へは 3 回まで（先頭のページと、このページが要るページだけ）
    expect(Math.max(...bodies.map((body) => body.nvapiCalls))).toBeLessThanOrEqual(3)
    expect(bodies[0]?.nvapiCalls).toBe(1)
  })

  it('再生時間の範囲は nvapi 側で絞り、深いページも同じように取る', async () => {
    const uploads = addLongUploads(300)
    // 偶数番目の新着だけを長い動画にする
    const longOnes = new Set(uploads.filter((_, i) => i % 2 === 0))
    for (const v of videos) if (longOnes.has(v.id)) v.duration = 900
    const bodies = await readPages('q=x&sort=-startTime&durationMin=600', 3)
    expect(bodies.flatMap(ids)).toEqual(uploads.filter((id) => longOnes.has(id)))
    const nvapi = calls.filter((u) => u.hostname === 'nvapi.nicovideo.jp')
    expect(nvapi.every((u) => u.searchParams.get('minDuration') === '600')).toBe(true)
  })

  it('nvapi の索引が遅れて本家ページが nvapi の最新まで届かないときは、そのあいだを realtimeGap で知らせる', async () => {
    // 新しい方から 150 本が nvapi に未反映。本家ページは 96 本（3 ページ）まで
    const uploads = addLongUploads(200, 150)
    const { body } = await search('q=x&sort=-startTime')
    expect(body.source).toBe('merged')
    const at = (id: string | undefined): number => ms(videos.find((v) => v.id === id)?.at ?? '')
    expect(ms(body.realtimeGap?.from ?? '')).toBe(at(uploads[150]))
    expect(ms(body.realtimeGap?.to ?? '')).toBe(at(uploads[95]))
    expect(ids(body)).toEqual(uploads.slice(0, 50))
  })

  it('nvapi が返せる深さ（5,000 件）を超える新着は、そこまでを新着区間にし、区間の終わりのページから realtimeGap で知らせる', async () => {
    const uploads = addLongUploads(5100)
    const first = await search('q=x&sort=-startTime')
    expect(first.body.realtimeCount).toBe(5000)
    expect(first.body.realtimeGap).toBeUndefined()
    const hint = `&rtCount=5000&boundary=${encodeURIComponent(BOUNDARY)}`
    const last = await search(`q=x&sort=-startTime&page=100${hint}`)
    expect(ids(last.body)).toEqual(uploads.slice(4950, 5000))
    expect(last.body.realtimeGap?.from).toBe(BOUNDARY)
    expect(ms(last.body.realtimeGap?.to ?? '')).toBe(ms(videos.find((v) => v.id === uploads[4999])?.at ?? ''))
    const after = await search(`q=x&sort=-startTime&page=101${hint}`)
    expect(ids(after.body)).toEqual(indexedNewestFirst().slice(0, 50))
    expect(after.body.realtimeGap?.from).toBe(BOUNDARY)
  })
})
