import { describe, it, expect } from 'vitest'
import {
  buildSnapshotSearchUrl,
  buildTagJsonFilter,
  mapSnapshotVideoToRankingItem,
  parseSearchConditions,
  SEARCH_PAGE_SIZE,
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
    expect(url.searchParams.get('filters[genre][0]')).toBe('ゲーム')
    expect(url.searchParams.get('filters[genre][1]')).toBe('アニメ')
  })

  it('ページからオフセットを計算する', () => {
    const conditions = parseSearchConditions(new URLSearchParams('q=test&page=3'))
    const url = new URL(buildSnapshotSearchUrl(conditions))
    expect(url.searchParams.get('_offset')).toBe(String(2 * SEARCH_PAGE_SIZE))
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
    const item = mapSnapshotVideoToRankingItem({ ...baseVideo, userId: null, channelId: 2650171 }, 1, 50)
    expect(item.authorId).toBe('channel/ch2650171')
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
