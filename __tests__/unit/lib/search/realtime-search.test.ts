import { describe, it, expect, vi } from 'vitest'
import {
  getRealtimeBoundary,
  isRealtimeMergeable,
  buildNvapiSearchUrl,
  mapNvapiVideoToRankingItem,
  applyRealtimeRangeFilters,
  fetchRealtimeSegment,
  REALTIME_MAX_PAGES,
  planMergedPage,
  assembleMergedPage,
} from '@/lib/search/realtime-search'
import type { SearchConditions } from '@/lib/search/snapshot-search'

const base = (over: Partial<SearchConditions> = {}): SearchConditions => ({
  q: '初音ミク',
  targets: 'keyword',
  sort: '-startTime',
  genres: [],
  tagConditions: [],
  page: 1,
  ...over,
})

describe('getRealtimeBoundary', () => {
  it('JST 5時以降なら当日5:00 JST', () => {
    // 2026-09-02 09:13 JST = 00:13 UTC
    expect(getRealtimeBoundary(new Date('2026-09-02T00:13:00Z'))).toBe('2026-09-02T05:00:00+09:00')
  })
  it('JST 5時前なら前日5:00 JST', () => {
    // 2026-09-02 03:30 JST = 2026-09-01 18:30 UTC
    expect(getRealtimeBoundary(new Date('2026-09-01T18:30:00Z'))).toBe('2026-09-01T05:00:00+09:00')
  })
  it('日付境界（JST 0時台）でも前日5:00になる', () => {
    // 2026-09-02 00:30 JST = 2026-09-01 15:30 UTC
    expect(getRealtimeBoundary(new Date('2026-09-01T15:30:00Z'))).toBe('2026-09-01T05:00:00+09:00')
  })
})

describe('isRealtimeMergeable', () => {
  const T = '2026-09-02T05:00:00+09:00'
  it('新しい順＋キーワードならマージ可', () => {
    expect(isRealtimeMergeable(base(), T)).toBe(true)
  })
  it('カウンター系ソートは不可', () => {
    expect(isRealtimeMergeable(base({ sort: '-viewCounter' }), T)).toBe(false)
  })
  it('タグOR/NOTを含むと不可、ANDのみなら可', () => {
    expect(isRealtimeMergeable(base({ tagConditions: [{ tag: 'a', operator: 'OR' }] }), T)).toBe(false)
    expect(isRealtimeMergeable(base({ tagConditions: [{ tag: 'a', operator: 'NOT' }] }), T)).toBe(false)
    expect(isRealtimeMergeable(base({ tagConditions: [{ tag: 'a', operator: 'AND' }] }), T)).toBe(true)
  })
  it('投稿日上限が境界より前なら不可', () => {
    expect(isRealtimeMergeable(base({ dateTo: '2026-09-01T00:00:00+09:00' }), T)).toBe(false)
  })
  it('条件が空なら不可', () => {
    expect(isRealtimeMergeable(base({ q: '' }), T)).toBe(false)
  })
})

describe('buildNvapiSearchUrl', () => {
  const T = '2026-09-02T05:00:00+09:00'
  it('キーワード・ANDタグ・ジャンル・境界を含む', () => {
    const url = new URL(
      buildNvapiSearchUrl(
        base({ tagConditions: [{ tag: 'VOCALOID', operator: 'AND' }], genres: ['音楽・サウンド'] }),
        T,
        2
      )
    )
    expect(url.searchParams.get('keyword')).toBe('初音ミク')
    expect(url.searchParams.get('tag')).toBe('VOCALOID')
    expect(url.searchParams.get('genres')).toBe('music_sound')
    expect(url.searchParams.get('sortKey')).toBe('registeredAt')
    expect(url.searchParams.get('minRegisteredAt')).toBe(T)
    expect(url.searchParams.get('page')).toBe('2')
    expect(url.searchParams.get('pageSize')).toBe('100')
  })
  it('タグ検索モードでは q もタグとして扱う', () => {
    const url = new URL(buildNvapiSearchUrl(base({ targets: 'tag' }), T, 1))
    expect(url.searchParams.get('keyword')).toBeNull()
    expect(url.searchParams.get('tag')).toBe('初音ミク')
  })
  it('dateFrom が境界より後ならそちらを下限に、dateTo は上限に', () => {
    const url = new URL(
      buildNvapiSearchUrl(base({ dateFrom: '2026-09-02T08:00:00+09:00', dateTo: '2026-09-02T12:00:00+09:00' }), T, 1)
    )
    expect(url.searchParams.get('minRegisteredAt')).toBe('2026-09-02T08:00:00+09:00')
    expect(url.searchParams.get('maxRegisteredAt')).toBe('2026-09-02T12:00:00+09:00')
  })
})

describe('mapNvapiVideoToRankingItem', () => {
  it('RankingItem に正規化する（チャンネル動画は channel/ch 形式）', () => {
    const item = mapNvapiVideoToRankingItem(
      {
        id: 'sm1',
        title: 't',
        registeredAt: '2026-09-02T09:00:00+09:00',
        duration: 120,
        thumbnail: { listingUrl: 'https://x/l.jpg' },
        count: { view: 10, comment: 2, mylist: 1, like: 3 },
        owner: { id: 5, name: 'ch', ownerType: 'channel' },
        isChannelVideo: true,
      },
      7
    )
    expect(item).toMatchObject({
      rank: 7, id: 'sm1', views: 10, comments: 2, mylists: 1, likes: 3, duration: 120,
      authorId: 'channel/ch5', authorName: 'ch', thumbURL: 'https://x/l.jpg',
    })
    expect(item.tags).toBeUndefined()
  })
})

describe('applyRealtimeRangeFilters', () => {
  it('Snapshot と同じ意味論で範囲フィルタする', () => {
    const items = [
      mapNvapiVideoToRankingItem({ id: 'a', title: 'a', registeredAt: '', count: { view: 5 }, duration: 30 }, 1),
      mapNvapiVideoToRankingItem({ id: 'b', title: 'b', registeredAt: '', count: { view: 500 }, duration: 600 }, 2),
    ]
    expect(applyRealtimeRangeFilters(items, base({ viewsMin: 100 })).map((i) => i.id)).toEqual(['b'])
    expect(applyRealtimeRangeFilters(items, base({ durationMax: 60 })).map((i) => i.id)).toEqual(['a'])
  })
})

describe('fetchRealtimeSegment', () => {
  const T = '2026-09-02T05:00:00+09:00'
  const mkResponse = (items: unknown[], hasNext: boolean, totalCount: number) =>
    ({ ok: true, status: 200, json: async () => ({ meta: { status: 200 }, data: { items, hasNext, totalCount } }) }) as unknown as Response

  it('hasNext に従ってページングし、rank を振り直す', async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(mkResponse([{ id: 'a', title: 'a', registeredAt: '', count: { view: 1 } }], true, 2))
      .mockResolvedValueOnce(mkResponse([{ id: 'b', title: 'b', registeredAt: '', count: { view: 1 } }], false, 2))
    const seg = await fetchRealtimeSegment(base(), T, fetchImpl as unknown as typeof fetch)
    expect(fetchImpl).toHaveBeenCalledTimes(2)
    expect(seg.items.map((i) => [i.id, i.rank])).toEqual([['a', 1], ['b', 2]])
    expect(seg.upstreamTotal).toBe(2)
    expect(seg.truncated).toBe(false)
  })
  it('上限ページで打ち切り truncated=true', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(mkResponse([{ id: 'x', title: 'x', registeredAt: '', count: {} }], true, 999))
    const seg = await fetchRealtimeSegment(base(), T, fetchImpl as unknown as typeof fetch)
    expect(fetchImpl).toHaveBeenCalledTimes(REALTIME_MAX_PAGES)
    expect(seg.truncated).toBe(true)
  })
  it('上流エラーは throw する（呼び出し側で Snapshot 単独に縮退）', async () => {
    const fetchImpl = vi.fn().mockResolvedValue({ ok: false, status: 403 } as unknown as Response)
    await expect(fetchRealtimeSegment(base(), T, fetchImpl as unknown as typeof fetch)).rejects.toThrow('nvapi_http_403')
  })
})

describe('planMergedPage / assembleMergedPage', () => {
  const mk = (id: string) => mapNvapiVideoToRankingItem({ id, title: id, registeredAt: '', count: {} }, 0)

  it('ページ1: リアルタイム R 件が先頭、残りを Snapshot offset 0 から', () => {
    const plan = planMergedPage(1, 50, 12)
    expect(plan).toEqual({ realtimeFrom: 0, realtimeTo: 12, snapshotOffset: 0, snapshotLimit: 38, globalStart: 0 })
  })
  it('境界を跨ぐページ: リアルタイムの残りと Snapshot 先頭を詰める', () => {
    const plan = planMergedPage(2, 50, 70)
    expect(plan).toEqual({ realtimeFrom: 50, realtimeTo: 70, snapshotOffset: 0, snapshotLimit: 30, globalStart: 50 })
  })
  it('リアルタイムを過ぎたページ: Snapshot のみ、offset は R 分ずれる', () => {
    const plan = planMergedPage(3, 50, 12)
    expect(plan).toEqual({ realtimeFrom: 12, realtimeTo: 12, snapshotOffset: 88, snapshotLimit: 50, globalStart: 100 })
  })
  it('ページ全体がリアルタイムなら Snapshot は不要', () => {
    expect(planMergedPage(1, 50, 200).snapshotLimit).toBe(0)
  })
  it('組み立て: 重複は Snapshot 側を落とし、rank をグローバルに振る', () => {
    const rt = [mk('a'), mk('b')]
    const snap = [mk('b'), mk('c'), mk('d')]
    const page = assembleMergedPage(rt, snap, planMergedPage(1, 3, 2))
    expect(page.map((i) => [i.id, i.rank])).toEqual([['a', 1], ['b', 2], ['c', 3]])
  })
  it('組み立て: 2ページ目は globalStart から rank を振る', () => {
    const rt = [mk('a')]
    const snap = [mk('x'), mk('y')]
    const page = assembleMergedPage(rt, snap, planMergedPage(2, 2, 1))
    expect(page.map((i) => [i.id, i.rank])).toEqual([['x', 3], ['y', 4]])
  })
})

describe('applyRealtimeRangeFilters: duration 不明の扱い', () => {
  it('再生時間フィルタ指定時は duration 不明を除外し、未指定なら残す', () => {
    const unknown = mapNvapiVideoToRankingItem({ id: 'u', title: 'u', registeredAt: '', count: { view: 1 } }, 1)
    expect(applyRealtimeRangeFilters([unknown], base({ durationMax: 60 }))).toEqual([])
    expect(applyRealtimeRangeFilters([unknown], base()).map((i) => i.id)).toEqual(['u'])
  })
})
