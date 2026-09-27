import { describe, it, expect, vi } from 'vitest'
import {
  buildSearchQuery,
  buildSnapshotSearchUrl,
  buildTagJsonFilter,
  mapSnapshotVideoToRankingItem,
  parseSearchApiQuery,
  parseSearchConditions,
  SEARCH_PAGE_SIZE,
  fetchSnapshotNewestStartTime,
} from '@/lib/search/snapshot-search'
import { applyExclusionRules } from '@/lib/search/exclusion-rules'
import type { RankingItem } from '@/types/ranking'

describe('parseSearchConditions', () => {
  it('デフォルト値を返す', () => {
    const conditions = parseSearchConditions(new URLSearchParams())
    expect(conditions.q).toBe('')
    expect(conditions.targets).toBe('keyword')
    expect(conditions.sort).toBe('-viewCounter')
    expect(conditions.genres).toEqual([])
    expect(conditions.page).toBe(1)
  })

  it('不正なソート値はデフォルトに戻す', () => {
    const conditions = parseSearchConditions(new URLSearchParams('sort=-evil'))
    expect(conditions.sort).toBe('-viewCounter')
  })

  it('不正なジャンルは無視する', () => {
    const params = new URLSearchParams()
    params.append('genre', 'ゲーム')
    params.append('genre', '存在しないジャンル')
    const conditions = parseSearchConditions(params)
    expect(conditions.genres).toEqual(['ゲーム'])
  })

  it('ページ番号をオフセット上限内にクランプする', () => {
    const conditions = parseSearchConditions(new URLSearchParams('page=99999'))
    expect(conditions.page * SEARCH_PAGE_SIZE).toBeLessThanOrEqual(100000)
  })

  it('負の数値フィルタは無視する', () => {
    const conditions = parseSearchConditions(new URLSearchParams('viewsMin=-100'))
    expect(conditions.viewsMin).toBeUndefined()
  })

  it('動画の種類は long / short だけを受け付け、未指定・不正値は all', () => {
    expect(parseSearchConditions(new URLSearchParams()).contentType).toBe('all')
    expect(parseSearchConditions(new URLSearchParams('contentType=short')).contentType).toBe('short')
    expect(parseSearchConditions(new URLSearchParams('contentType=long')).contentType).toBe('long')
    expect(parseSearchConditions(new URLSearchParams('contentType=nonsense')).contentType).toBe('all')
  })
})

describe('buildSnapshotSearchUrl', () => {
  it('キーワード検索のURLを構築する', () => {
    const conditions = parseSearchConditions(new URLSearchParams('q=初音ミク'))
    const url = new URL(buildSnapshotSearchUrl(conditions))
    expect(url.hostname).toBe('snapshot.search.nicovideo.jp')
    expect(url.searchParams.get('q')).toBe('初音ミク')
    expect(url.searchParams.get('targets')).toBe('title,description,tags')
    expect(url.searchParams.get('_sort')).toBe('-viewCounter')
    expect(url.searchParams.get('_offset')).toBe('0')
    expect(url.searchParams.get('_context')).toBeTruthy()
  })

  it('タグ検索は tagsExact を指定する', () => {
    const conditions = parseSearchConditions(new URLSearchParams('q=VOCALOID&targets=tag'))
    const url = new URL(buildSnapshotSearchUrl(conditions))
    expect(url.searchParams.get('targets')).toBe('tagsExact')
  })

  it('範囲フィルタとジャンルをAPIパラメータに変換する', () => {
    const params = new URLSearchParams('q=test&viewsMin=1000&viewsMax=50000&durationMin=300')
    params.append('genre', 'ゲーム')
    params.append('genre', 'アニメ')
    const url = new URL(buildSnapshotSearchUrl(parseSearchConditions(params)))
    expect(url.searchParams.get('filters[viewCounter][gte]')).toBe('1000')
    expect(url.searchParams.get('filters[viewCounter][lte]')).toBe('50000')
    expect(url.searchParams.get('filters[lengthSeconds][gte]')).toBe('300')
    // ジャンルは正規形（一覧の順）で並ぶ。Snapshot のジャンル条件は順によらない
    expect(url.searchParams.get('filters[genre][0]')).toBe('アニメ')
    expect(url.searchParams.get('filters[genre][1]')).toBe('ゲーム')
  })

  it('ページからオフセットを計算する', () => {
    const conditions = parseSearchConditions(new URLSearchParams('q=test&page=3'))
    const url = new URL(buildSnapshotSearchUrl(conditions))
    expect(url.searchParams.get('_offset')).toBe(String(2 * SEARCH_PAGE_SIZE))
  })

  it('動画の種類は索引側の filters[contentType] で絞る（all は指定なし）', () => {
    expect(new URL(buildSnapshotSearchUrl(parseSearchConditions(new URLSearchParams('q=test')))).searchParams.get('filters[contentType][0]')).toBeNull()
    expect(new URL(buildSnapshotSearchUrl(parseSearchConditions(new URLSearchParams('q=test&contentType=short')))).searchParams.get('filters[contentType][0]')).toBe('short')
    expect(new URL(buildSnapshotSearchUrl(parseSearchConditions(new URLSearchParams('q=test&contentType=long')))).searchParams.get('filters[contentType][0]')).toBe('long')
  })
})

describe('タグ論理条件（AND/OR/NOT）', () => {
  it('URLパラメータ tagAnd/tagOr/tagNot をパースする', () => {
    const params = new URLSearchParams()
    params.append('tagAnd', 'ゲーム')
    params.append('tagOr', 'VOICEROID実況プレイ')
    params.append('tagNot', 'スパム')
    const conditions = parseSearchConditions(params)
    expect(conditions.tagConditions).toEqual([
      { tag: 'ゲーム', operator: 'AND' },
      { tag: 'VOICEROID実況プレイ', operator: 'OR' },
      { tag: 'スパム', operator: 'NOT' },
    ])
  })

  it('条件なしなら jsonFilter を生成しない', () => {
    expect(buildTagJsonFilter([])).toBeNull()
    const url = new URL(buildSnapshotSearchUrl(parseSearchConditions(new URLSearchParams('q=test'))))
    expect(url.searchParams.get('jsonFilter')).toBeNull()
  })

  it('AND条件のみは and ノードになる', () => {
    expect(
      buildTagJsonFilter([
        { tag: 'A', operator: 'AND' },
        { tag: 'B', operator: 'AND' },
      ])
    ).toEqual({
      type: 'and',
      filters: [
        { type: 'equal', field: 'tagsExact', value: 'A' },
        { type: 'equal', field: 'tagsExact', value: 'B' },
      ],
    })
  })

  it('カスタムランキングと同じ意味論: (AND群) OR (OR群)、NOTは常に除外', () => {
    expect(
      buildTagJsonFilter([
        { tag: 'A', operator: 'AND' },
        { tag: 'B', operator: 'OR' },
        { tag: 'C', operator: 'NOT' },
      ])
    ).toEqual({
      type: 'and',
      filters: [
        {
          type: 'or',
          filters: [
            { type: 'equal', field: 'tagsExact', value: 'A' },
            { type: 'equal', field: 'tagsExact', value: 'B' },
          ],
        },
        { type: 'not', filter: { type: 'equal', field: 'tagsExact', value: 'C' } },
      ],
    })
  })

  it('キーワード検索とタグ条件を同時にURLへ載せる', () => {
    const params = new URLSearchParams('q=初音ミク')
    params.append('tagAnd', '千本桜')
    const url = new URL(buildSnapshotSearchUrl(parseSearchConditions(params)))
    expect(url.searchParams.get('q')).toBe('初音ミク')
    expect(url.searchParams.get('targets')).toBe('title,description,tags')
    expect(JSON.parse(url.searchParams.get('jsonFilter') ?? '{}')).toEqual({
      type: 'equal',
      field: 'tagsExact',
      value: '千本桜',
    })
  })
})

describe('mapSnapshotVideoToRankingItem', () => {
  const baseVideo = {
    contentId: 'sm12345',
    title: 'テスト動画',
    thumbnailUrl: 'https://example.com/thumb.jpg',
    viewCounter: 100,
    commentCounter: 10,
    likeCounter: 5,
    mylistCounter: 3,
    lengthSeconds: 245,
    startTime: '2026-01-01T00:00:00+09:00',
    userId: 42,
    channelId: null,
    tags: 'タグA タグB',
    genre: 'ゲーム',
  }

  it('ユーザー投稿動画を RankingItem に変換する', () => {
    const item = mapSnapshotVideoToRankingItem(baseVideo, 0, 0)
    expect(item).toMatchObject({
      rank: 1,
      id: 'sm12345',
      title: 'テスト動画',
      views: 100,
      comments: 10,
      likes: 5,
      mylists: 3,
      duration: 245,
      authorId: '42',
      tags: ['タグA', 'タグB'],
    })
  })

  it('チャンネル動画は channel/chXXXX 形式の authorId になる', () => {
    const item = mapSnapshotVideoToRankingItem({ ...baseVideo, userId: null, channelId: 7654321 }, 1, 50)
    expect(item.authorId).toBe('channel/ch7654321')
    expect(item.rank).toBe(52)
  })
})

describe('applyExclusionRules', () => {
  const items: RankingItem[] = [
    { rank: 1, id: 'sm1', title: '通常の動画', thumbURL: '', views: 1, tags: ['ゲーム'], authorId: '100' },
    { rank: 2, id: 'sm2', title: 'スパム動画です', thumbURL: '', views: 1, tags: ['spam-tag'], authorId: '200' },
    { rank: 3, id: 'sm3', title: '別の動画', thumbURL: '', views: 1, authorId: '300' },
  ]

  it('ルールが空なら何も除外しない', () => {
    const result = applyExclusionRules(items, { tags: [], titleKeywords: [], authorIds: [] })
    expect(result.items).toHaveLength(3)
    expect(result.excludedCount).toBe(0)
  })

  it('タグ・タイトルキーワード・投稿者IDで除外する', () => {
    const result = applyExclusionRules(items, {
      tags: ['SPAM-TAG'],
      titleKeywords: ['スパム'],
      authorIds: ['300'],
    })
    expect(result.items.map((i) => i.id)).toEqual(['sm1'])
    expect(result.excludedCount).toBe(2)
  })
})

describe('buildSnapshotSearchUrl: マージ用の窓', () => {
  it('startTimeBefore で境界より前（lt）に限定し、offset/limit を上書きする', () => {
    const conditions = parseSearchConditions(new URLSearchParams({ q: 'x', sort: '-startTime' }))
    const url = new URL(buildSnapshotSearchUrl(conditions, { offset: 38, limit: 12, startTimeBefore: '2026-09-02T05:00:00+09:00' }))
    expect(url.searchParams.get('filters[startTime][lt]')).toBe('2026-09-02T05:00:00+09:00')
    expect(url.searchParams.get('filters[startTime][lte]')).toBeNull()
    expect(url.searchParams.get('_offset')).toBe('38')
    expect(url.searchParams.get('_limit')).toBe('12')
  })
  it('dateTo が境界より前なら dateTo（lte）を優先する', () => {
    const conditions = parseSearchConditions(new URLSearchParams({ q: 'x', dateTo: '2026-09-01T00:00:00+09:00' }))
    const url = new URL(buildSnapshotSearchUrl(conditions, { startTimeBefore: '2026-09-02T05:00:00+09:00' }))
    expect(url.searchParams.get('filters[startTime][lt]')).toBeNull()
    expect(url.searchParams.get('filters[startTime][lte]')).toBeTruthy()
  })
})

describe('fetchSnapshotNewestStartTime', () => {
  const conditions = parseSearchConditions(new URLSearchParams({ q: '初音ミク', sort: '-viewCounter' }))

  it('同じ条件を新しい順・1 件で問い合わせ、最新の投稿時刻を返す', async () => {
    const fetchImpl = vi.fn(async () => ({ ok: true, json: async () => ({ meta: { status: 200 }, data: [{ startTime: '2026-09-21T04:28:31+09:00' }] }) }) as unknown as Response)
    await expect(fetchSnapshotNewestStartTime(conditions, fetchImpl as unknown as typeof fetch)).resolves.toBe('2026-09-21T04:28:31+09:00')
    const url = new URL(String(vi.mocked(fetchImpl).mock.calls[0]?.[0]))
    expect(url.searchParams.get('q')).toBe('初音ミク')
    expect(url.searchParams.get('_sort')).toBe('-startTime')
    expect(url.searchParams.get('_limit')).toBe('1')
    expect(url.searchParams.get('_offset')).toBe('0')
  })

  it('動画の種類の絞り込みも境界の問い合わせに引き継ぐ', async () => {
    const fetchImpl = vi.fn(async () => ({ ok: true, json: async () => ({ meta: { status: 200 }, data: [] }) }) as unknown as Response)
    await fetchSnapshotNewestStartTime(parseSearchConditions(new URLSearchParams({ q: 'x', contentType: 'short' })), fetchImpl as unknown as typeof fetch)
    expect(new URL(String(vi.mocked(fetchImpl).mock.calls[0]?.[0])).searchParams.get('filters[contentType][0]')).toBe('short')
  })

  it('投稿日時の範囲は外して問い合わせる（索引の最新は日付の条件によらない。過去の範囲を合成に回さない）', async () => {
    const fetchImpl = vi.fn(async (_url: string | URL | Request) => ({ ok: true, json: async () => ({ meta: { status: 200 }, data: [] }) }) as unknown as Response)
    const dated = parseSearchConditions(new URLSearchParams({ q: 'x', dateFrom: '2025-01-01T00:00:00+09:00', dateTo: '2025-01-31T23:59:59+09:00' }))
    await fetchSnapshotNewestStartTime(dated, fetchImpl as unknown as typeof fetch)
    const url = new URL(String(vi.mocked(fetchImpl).mock.calls[0]?.[0]))
    expect(url.searchParams.get('q')).toBe('x')
    expect(url.searchParams.get('filters[startTime][gte]')).toBeNull()
    expect(url.searchParams.get('filters[startTime][lte]')).toBeNull()
    expect(url.searchParams.get('filters[startTime][lt]')).toBeNull()
  })

  it('全体の期限（signal）を fetch に渡す', async () => {
    const deadline = new AbortController()
    deadline.abort()
    const fetchImpl = vi.fn(async (_url: string | URL | Request, init?: RequestInit) => {
      expect(init?.signal?.aborted).toBe(true)
      return { ok: true, json: async () => ({ meta: { status: 200 }, data: [] }) } as unknown as Response
    })
    await fetchSnapshotNewestStartTime(conditions, fetchImpl as unknown as typeof fetch, 3000, deadline.signal)
    expect(fetchImpl).toHaveBeenCalledTimes(1)
  })

  it('該当なしは null、上流エラーは throw', async () => {
    const empty = vi.fn(async () => ({ ok: true, json: async () => ({ meta: { status: 200 }, data: [] }) }) as unknown as Response)
    await expect(fetchSnapshotNewestStartTime(conditions, empty as unknown as typeof fetch)).resolves.toBeNull()
    const down = vi.fn(async () => ({ ok: false, status: 503 }) as unknown as Response)
    await expect(fetchSnapshotNewestStartTime(conditions, down as unknown as typeof fetch)).rejects.toThrow('snapshot_http_503')
  })
})

describe('検索条件の正規形（S-d）', () => {
  const canonical = (query: string): string => buildSearchQuery(parseSearchConditions(new URLSearchParams(query)))

  it('既定値は省き、決まった順に並べる（ジャンルは一覧の順、タグは AND・OR・NOT の順）', () => {
    const params = new URLSearchParams()
    params.append('page', '3')
    params.append('tagNot', 'n1')
    params.append('genre', 'ラジオ')
    params.append('tagAnd', 'a1')
    params.append('q', '  テスト  ')
    params.append('sort', '-startTime')
    params.append('genre', 'アニメ')
    params.append('viewsMin', '0010')
    params.append('targets', 'keyword')
    params.append('dateFrom', '2026-09-20T00:00:00+09:00')
    const query = buildSearchQuery(parseSearchConditions(params))
    expect(query).toBe(
      new URLSearchParams([
        ['q', 'テスト'],
        ['sort', '-startTime'],
        ['genre', 'アニメ'],
        ['genre', 'ラジオ'],
        ['viewsMin', '10'],
        ['dateFrom', '2026-09-20T00:00:00+09:00'],
        ['tagAnd', 'a1'],
        ['tagNot', 'n1'],
        ['page', '3'],
      ]).toString()
    )
  })

  it('投稿日時は +09:00 の秒単位にそろえ、同じタグ・ジャンルの重複は 1 つにする', () => {
    expect(canonical('dateTo=2026-09-20T14:59:59.000Z')).toBe('dateTo=2026-09-20T23%3A59%3A59%2B09%3A00')
    expect(canonical('tagAnd=a&tagAnd=a&genre=%E3%82%A2%E3%83%8B%E3%83%A1&genre=%E3%82%A2%E3%83%8B%E3%83%A1')).toBe(
      'genre=%E3%82%A2%E3%83%8B%E3%83%A1&tagAnd=a'
    )
  })

  it('正規形は読み直しても変わらない', () => {
    const inputs = [
      '',
      'q=x',
      'q=%E5%88%9D%E9%9F%B3+%E3%83%9F%E3%82%AF&targets=tag&contentType=short&sort=%2BstartTime&page=2000',
      'viewsMin=1&viewsMax=2&commentsMin=3&commentsMax=4&likesMin=5&likesMax=6&mylistsMin=7&mylistsMax=8&durationMin=90&durationMax=600',
      'dateFrom=2026-09-01T00%3A00%3A00%2B09%3A00&dateTo=2026-09-02T23%3A59%3A59%2B09%3A00&tagAnd=a&tagOr=b&tagOr=c&tagNot=d',
      `q=${'あ'.repeat(250)}`,
      'page=99999&viewsMin=1e3',
    ]
    for (const input of inputs) {
      const once = canonical(input)
      expect(canonical(once)).toBe(once)
    }
  })

  it('語とタグの長さは、これまでどおり UTF-16 の単位で数え（URL が長くなりすぎない）、サロゲートペアは割らない', () => {
    const emoji = '😀'
    const q = parseSearchConditions(new URLSearchParams({ q: emoji.repeat(150) })).q
    expect(q.length).toBeLessThanOrEqual(200)
    expect(q).toBe(emoji.repeat(100))
    const odd = parseSearchConditions(new URLSearchParams({ q: `a${emoji.repeat(150)}` })).q
    expect(odd.length).toBe(199)
    expect(/[\uD800-\uDBFF]$/.test(odd)).toBe(false)
    const tag = parseSearchConditions(new URLSearchParams({ tagAnd: emoji.repeat(80) })).tagConditions[0]?.tag ?? ''
    expect(tag).toBe(emoji.repeat(50))
  })

  it('/api/search の問い合わせは正規形だけを受け付ける（知らないキー・並べ替え・書き換えは拒む）', () => {
    const read = (query: string) => parseSearchApiQuery(new URLSearchParams(query), query)
    expect(read('q=x&sort=-startTime')).not.toBeNull()
    expect(read('')).not.toBeNull()
    expect(read('q=x&sort=-startTime&page=2&rtCount=7&boundary=2026-09-22T04%3A00%3A01%2B09%3A00')?.extras).toEqual({
      rtCount: 7,
      boundary: '2026-09-22T04:00:01+09:00',
    })
    // 知らないキー（キャッシュ外し）
    expect(read('q=x&_=123')).toBeNull()
    // 並べ替え・既定値の明示・数値や日付の別表記・前後の空白
    expect(read('sort=-startTime&q=x')).toBeNull()
    expect(read('q=x&sort=-viewCounter')).toBeNull()
    expect(read('q=x&page=1')).toBeNull()
    expect(read('q=x&viewsMin=010')).toBeNull()
    expect(read('q=%20x')).toBeNull()
    expect(read('q=x&page=2&boundary=2026-09-21T19%3A00%3A01.000Z')).toBeNull()
    expect(read('q=x&page=2&boundary=broken')).toBeNull()
    expect(read('q=x&page=2&rtCount=0')).toBeNull()
    // 同じキーの重複（単一の値のキー）
    expect(read('q=x&q=y')).toBeNull()
  })
})
