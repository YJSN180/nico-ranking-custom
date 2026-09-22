import { describe, it, expect, vi, beforeEach } from 'vitest'
import { clearFreshCache, fetchFreshItems, freshQueryFor, mergeFreshIntoRealtime, FRESH_MAX_PAGES } from '@/lib/search/fresh-segment'
import type { SearchConditions } from '@/lib/search/snapshot-search'
import type { RankingItem } from '@/types/ranking'

const base = (over: Partial<SearchConditions> = {}): SearchConditions => ({ q: '初音ミク', targets: 'keyword', contentType: 'all', sort: '-startTime', genres: [], tagConditions: [], page: 1, ...over })

const pageHtml = (items: Array<Record<string, unknown>>, hasNext = false) => {
  const payload = { data: { response: { $getSearchVideoV2: { data: { totalCount: items.length, hasNext, items } } } } }
  return `<html><head><meta name="server-response" content="${JSON.stringify(payload).replace(/&/g, '&amp;').replace(/"/g, '&quot;')}"></head></html>`
}
const item = (id: string, registeredAt: string, view = 10) => ({ id, title: `t-${id}`, registeredAt, duration: 30, count: { view, comment: 0, mylist: 0, like: 0 }, owner: { ownerType: 'user', id: '1001', name: 'n', iconUrl: 'https://i/1.jpg' } })
const ri = (id: string, registeredAt: string): RankingItem => ({ rank: 0, id, title: id, thumbURL: '', views: 0, registeredAt })

describe('freshQueryFor', () => {
  it('キーワードは /search/、タグ検索と AND タグは /tag/（空白区切り）', () => {
    expect(freshQueryFor(base())).toEqual({ kind: 'keyword', query: '初音ミク' })
    expect(freshQueryFor(base({ targets: 'tag', tagConditions: [{ tag: 'b', operator: 'AND' }] }))).toEqual({ kind: 'tag', query: '初音ミク b' })
    expect(freshQueryFor(base({ q: '', tagConditions: [{ tag: 'b', operator: 'AND' }] }))).toEqual({ kind: 'tag', query: 'b' })
  })
  it('ジャンル指定・OR/NOT・キーワードとタグの併用は対象外', () => {
    expect(freshQueryFor(base({ genres: ['ゲーム'] }))).toBeNull()
    expect(freshQueryFor(base({ tagConditions: [{ tag: 'b', operator: 'OR' }] }))).toBeNull()
    expect(freshQueryFor(base({ tagConditions: [{ tag: 'b', operator: 'AND' }] }))).toBeNull()
  })
})

describe('fetchFreshItems', () => {
  beforeEach(() => clearFreshCache())

  it('境界より新しい動画だけを返し、60 秒はキャッシュから返す', async () => {
    const fetchImpl = vi.fn(async () => ({ ok: true, text: async () => pageHtml([item('new1', '2026-09-22T06:42:18+09:00'), item('old1', '2026-09-21T04:00:00+09:00')]) }) as unknown as Response)
    const boundary = '2026-09-21T04:28:31+09:00'
    const first = await fetchFreshItems(base(), boundary, { fetchImpl: fetchImpl as unknown as typeof fetch, now: 1_000 })
    expect(first.map((it) => it.id)).toEqual(['new1'])
    expect(first[0]?.authorName).toBe('n')
    // 動画とショートの 2 ページを取る（同じ内容でも ID で重複除外）
    expect(fetchImpl).toHaveBeenCalledTimes(2)
    expect(vi.mocked(fetchImpl).mock.calls.map((c) => new URL(String(c[0])).pathname.split('/')[1]).sort()).toEqual(['search', 'search_shorts'])
    const second = await fetchFreshItems(base(), boundary, { fetchImpl: fetchImpl as unknown as typeof fetch, now: 30_000 })
    expect(second).toHaveLength(1)
    expect(fetchImpl).toHaveBeenCalledTimes(2)
    await fetchFreshItems(base(), boundary, { fetchImpl: fetchImpl as unknown as typeof fetch, now: 70_000 })
    expect(fetchImpl).toHaveBeenCalledTimes(4)
  })

  it('範囲・日付フィルタを後付けし、対象外の条件では取得しない', async () => {
    const fetchImpl = vi.fn(async () => ({ ok: true, text: async () => pageHtml([item('a', '2026-09-22T06:00:00+09:00', 5), item('b', '2026-09-22T05:00:00+09:00', 500)]) }) as unknown as Response)
    const boundary = '2026-09-21T04:28:31+09:00'
    const filtered = await fetchFreshItems(base({ viewsMin: 100 }), boundary, { fetchImpl: fetchImpl as unknown as typeof fetch })
    expect(filtered.map((it) => it.id)).toEqual(['b'])
    const dated = await fetchFreshItems(base({ dateTo: '2026-09-22T05:30:00+09:00' }), boundary, { fetchImpl: fetchImpl as unknown as typeof fetch })
    expect(dated.map((it) => it.id)).toEqual(['b'])
    expect(await fetchFreshItems(base({ genres: ['ゲーム'] }), boundary, { fetchImpl: fetchImpl as unknown as typeof fetch })).toEqual([])
  })

  it('動画の種類で絞る検索では該当する種別のページだけを取り、種類ごとに別キャッシュにする', async () => {
    const fetchImpl = vi.fn(async () => ({ ok: true, text: async () => pageHtml([item('n1', '2026-09-22T06:42:18+09:00')]) }) as unknown as Response)
    const boundary = '2026-09-21T04:28:31+09:00'
    const paths = () => vi.mocked(fetchImpl).mock.calls.map((c) => new URL(String(c[0])).pathname.split('/')[1])
    await fetchFreshItems(base({ contentType: 'long' }), boundary, { fetchImpl: fetchImpl as unknown as typeof fetch, now: 1_000 })
    expect(paths()).toEqual(['search'])
    await fetchFreshItems(base({ contentType: 'short' }), boundary, { fetchImpl: fetchImpl as unknown as typeof fetch, now: 1_000 })
    expect(paths()).toEqual(['search', 'search_shorts'])
    // タグ検索のショートは /tag_shorts
    await fetchFreshItems(base({ targets: 'tag', contentType: 'short' }), boundary, { fetchImpl: fetchImpl as unknown as typeof fetch, now: 1_000 })
    expect(paths()).toEqual(['search', 'search_shorts', 'tag_shorts'])
    // すべて は long のキャッシュを流用せず、動画+ショートの 2 ページを取り直す
    await fetchFreshItems(base(), boundary, { fetchImpl: fetchImpl as unknown as typeof fetch, now: 1_000 })
    expect(paths().slice(3).sort()).toEqual(['search', 'search_shorts'])
  })

  it('1 ページ目が全件境界より新しく続きがあるときだけ、2 ページ目以降を読み足す（読み足しの失敗は無視）', async () => {
    const boundary = '2026-09-21T04:28:31+09:00'
    const newer = (id: string) => item(id, '2026-09-22T06:00:00+09:00')
    const fetchImpl = vi.fn(async (url: string | URL | Request) => {
      const page = new URL(String(url)).searchParams.get('page') ?? '1'
      if (page === '1') return { ok: true, text: async () => pageHtml([newer('p1a'), newer('p1b')], true) } as unknown as Response
      if (page === '2') return { ok: true, text: async () => pageHtml([newer('p2a'), item('old', '2026-09-20T00:00:00+09:00')], true) } as unknown as Response
      return { ok: false, status: 503 } as unknown as Response
    })
    const items = await fetchFreshItems(base({ contentType: 'short' }), boundary, { fetchImpl: fetchImpl as unknown as typeof fetch, now: 1_000 })
    expect(items.map((it) => it.id)).toEqual(['p1a', 'p1b', 'p2a'])
    expect(fetchImpl).toHaveBeenCalledTimes(FRESH_MAX_PAGES)
    // 1 ページ目に境界より古い動画が混じれば読み足さない
    const single = vi.fn(async () => ({ ok: true, text: async () => pageHtml([newer('a'), item('old', '2026-09-20T00:00:00+09:00')], true) }) as unknown as Response)
    await fetchFreshItems(base({ contentType: 'short', q: 'other' }), boundary, { fetchImpl: single as unknown as typeof fetch, now: 1_000 })
    expect(single).toHaveBeenCalledTimes(1)
  })

  it('HTTP エラー・構造変化は投げる', async () => {
    const down = vi.fn(async () => ({ ok: false, status: 503 }) as unknown as Response)
    await expect(fetchFreshItems(base(), '2026-09-21T04:28:31+09:00', { fetchImpl: down as unknown as typeof fetch })).rejects.toThrow('nico_page_http_503')
    const broken = vi.fn(async () => ({ ok: true, text: async () => '<html></html>' }) as unknown as Response)
    await expect(fetchFreshItems(base(), '2026-09-21T04:28:31+09:00', { fetchImpl: broken as unknown as typeof fetch })).rejects.toThrow('server-response')
  })
})

describe('mergeFreshIntoRealtime', () => {
  it('ID で重複を除き、投稿時刻の降順に並べて rank を振り直す', () => {
    const realtime = [ri('r1', '2026-09-22T03:58:30+09:00'), ri('r2', '2026-09-22T02:31:07+09:00')]
    const fresh = [ri('f1', '2026-09-22T06:42:18+09:00'), ri('r1', '2026-09-22T03:58:30+09:00'), ri('f2', '2026-09-22T03:00:00+09:00')]
    const { items, added } = mergeFreshIntoRealtime(fresh, realtime)
    expect(added).toBe(2)
    expect(items.map((it) => it.id)).toEqual(['f1', 'r1', 'f2', 'r2'])
    expect(items.map((it) => it.rank)).toEqual([1, 2, 3, 4])
  })
})
