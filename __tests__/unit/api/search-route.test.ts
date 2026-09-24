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
import { kv } from '@/lib/simple-kv'

type Kind = 'long' | 'short'

interface FakeVideo {
  id: string
  at: string
  kind: Kind
  /** Snapshot の索引にある */
  indexed: boolean
  /** nvapi の索引にある（ショートは常に無い） */
  nvapi: boolean
}

interface SearchBody {
  items: Array<{ id: string; rank: number }>
  totalCount: number
  source: 'merged' | 'snapshot'
  boundary: string
  realtimeCount: number
  realtimeError?: string
  freshError?: string
}

const ms = (iso: string): number => new Date(iso).getTime()
const jst = (time: string, day = 22): string => `2026-09-${day}T${time}+09:00`
const isoAt = (msValue: number): string => new Date(msValue).toISOString()

let videos: FakeVideo[] = []
let nvapiStatus = 200
let pageStatus = 200
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
    lengthSeconds: v.kind === 'short' ? 30 : 300,
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
  const list = videos
    .filter((v) => v.nvapi && v.kind === 'long')
    .filter((v) => (!min || ms(v.at) >= ms(min)) && (!max || ms(v.at) <= ms(max)))
    .sort(byNewest)
  const pageSize = Number(p.get('pageSize') ?? 100)
  const page = Number(p.get('page') ?? 1)
  const items = list.slice((page - 1) * pageSize, page * pageSize).map((v) => ({
    id: v.id,
    title: `title ${v.id}`,
    registeredAt: v.at,
    duration: 300,
    count: { view: 10, comment: 0, mylist: 0, like: 0 },
    owner: { id: 1001, name: 'user-1001', ownerType: 'user' },
  }))
  return json({ meta: { status: 200 }, data: { totalCount: list.length, hasNext: list.length > page * pageSize, items } })
}

function pageResponse(url: URL): Response {
  if (pageStatus !== 200) return new Response('', { status: pageStatus })
  const kind: Kind = url.pathname.startsWith('/search_shorts') || url.pathname.startsWith('/tag_shorts') ? 'short' : 'long'
  const page = Number(url.searchParams.get('page') ?? 1)
  const list = videos.filter((v) => v.kind === kind).sort(byNewest)
  const items = list.slice((page - 1) * 32, page * 32).map((v) => ({
    id: v.id,
    title: `title ${v.id}`,
    registeredAt: v.at,
    duration: kind === 'short' ? 30 : 300,
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
    if (snapshotPageHang && url.searchParams.get('_limit') !== '1') return hang(init?.signal)
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
    calls = []
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
  })

  it('索引の最新がショートでも、その動画を欠かさない', async () => {
    videos.push({ id: 'ss2999', at: jst('04:30:00'), kind: 'short', indexed: true, nvapi: false })
    const { body } = await search('q=x&sort=-startTime')
    expect(body.source).toBe('merged')
    expect(ids(body).slice(0, 6)).toEqual(['sm9103', 'sm9102', 'ss9101', 'sm9101', 'ss2999', 'sm1060'])
  })

  it('ジャンルだけの条件は nvapi が応じないので、合成せず索引だけを返す（最新を含む）', async () => {
    const { body } = await search(`genre=${encodeGenre}&sort=-startTime`)
    expect(body.source).toBe('snapshot')
    expect(ids(body)[0]).toBe('sm1060')
    expect(callsTo('nvapi.nicovideo.jp')).toHaveLength(0)
    expect(callsTo('www.nicovideo.jp')).toHaveLength(0)
  })

  it('キーワード＋AND タグも nvapi が応じないので、索引だけを返す（最新を含む）', async () => {
    const { body } = await search('q=x&tagAnd=y&sort=-startTime')
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

  describe('ショートだけの検索', () => {
    it('本家ページ区間を先頭に、索引の最新のショートから続ける', async () => {
      const { body } = await search('q=x&sort=-startTime&contentType=short')
      expect(body.source).toBe('merged')
      expect(ids(body)).toEqual(['ss9101', ...Array.from({ length: 10 }, (_, i) => `ss${2001 + i}`)])
      expect(callsTo('nvapi.nicovideo.jp')).toHaveLength(0)
    })

    it('本家ページで表せない条件（ジャンル指定）は、索引だけを返す', async () => {
      const { body } = await search(`q=x&sort=-startTime&contentType=short&genre=${encodeGenre}`)
      expect(body.source).toBe('snapshot')
      expect(ids(body)[0]).toBe('ss2001')
      expect(callsTo('www.nicovideo.jp')).toHaveLength(0)
    })

    it('本家ページの取得に失敗したら、索引だけを返す（「リアルタイム込み」にしない）', async () => {
      pageStatus = 503
      const { body } = await search('q=x&sort=-startTime&contentType=short')
      expect(body.source).toBe('snapshot')
      expect(body.realtimeError).toContain('503')
      expect(ids(body)[0]).toBe('ss2001')
      expect(body.items).toHaveLength(10)
    })
  })
})

describe('/api/search: 投稿日時の範囲（S-c）', () => {
  beforeEach(() => {
    seedWorld()
    nvapiStatus = 200
    pageStatus = 200
    calls = []
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
    snapshotPageHang = false
    kvHang = false
    calls = []
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
    const pending = search('q=x&sort=-viewCounter')
    await vi.waitFor(() => expect(callsTo('snapshot.search.nicovideo.jp').length).toBeGreaterThan(0))
    expire()
    const { status, body } = await pending
    expect(status).toBe(504)
    expect(body).toMatchObject({ error: 'search_timeout' })
  })

  it('KV（管理者 NG・自動 NG）が応答しなくても、期限で打ち切って結果を返す', async () => {
    kvHang = true
    const pending = search('q=x&sort=-viewCounter')
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
