import { describe, expect, it } from 'vitest'
import {
  USER_SEARCH_MAX_PAGE,
  buildUserPageQuery,
  buildUserSearchQuery,
  buildUserSearchUrl,
  parseUserPageConditions,
  parseUserSearchConditions,
  parseUserSearchResponse,
} from '@/lib/search/user-search'

describe('user-search', () => {
  it('問い合わせの正規形（既定値は省く）と読み直し', () => {
    expect(
      buildUserSearchQuery({ q: 'ミク', sort: 'followers', page: 1 }),
    ).toBe('q=%E3%83%9F%E3%82%AF')
    expect(buildUserSearchQuery({ q: 'a b', sort: 'videos', page: 3 })).toBe(
      'q=a+b&sort=videos&page=3',
    )
    const conditions = parseUserSearchConditions(
      new URLSearchParams('q=%20a%20%20b%20&sort=bad&page=9999'),
    )
    expect(conditions).toEqual({
      q: 'a b',
      sort: 'followers',
      page: USER_SEARCH_MAX_PAGE,
    })
  })

  it('検索ページの URL は動画の並び順と混ざらない usort を使う', () => {
    const query = buildUserPageQuery({ q: 'ミク', sort: 'relevance', page: 2 })
    expect(query).toBe('type=user&q=%E3%83%9F%E3%82%AF&usort=relevance&page=2')
    expect(parseUserPageConditions(new URLSearchParams(query))).toEqual({
      q: 'ミク',
      sort: 'relevance',
      page: 2,
    })
  })

  it('上流の URL（並び順のキー・ページの大きさ）', () => {
    const url = new URL(
      buildUserSearchUrl({ q: 'ミク', sort: 'videos', page: 2 }),
    )
    expect(url.origin + url.pathname).toBe(
      'https://nvapi.nicovideo.jp/v1/search/user',
    )
    expect(Object.fromEntries(url.searchParams)).toEqual({
      keyword: 'ミク',
      sortKey: 'videoCount',
      sortOrder: 'desc',
      page: '2',
      pageSize: '50',
    })
  })

  it('応答から行を取り出し、ID・名前の欠けた行と https 以外のアイコンを捨てる', () => {
    const result = parseUserSearchResponse({
      data: {
        totalCount: 3,
        items: [
          {
            id: 1001,
            nickname: 'user-a',
            icons: { small: 'https://img.nicoprofile.nimg.jp/a.jpg' },
            followerCount: 10,
            videoCount: 2,
            shortDescription: ' 説明\n文 ',
          },
          { id: 'x', nickname: 'bad-id' },
          {
            id: 1002,
            nickname: 'user-b',
            icons: { small: 'http://insecure/b.jpg' },
            followerCount: -1,
          },
        ],
      },
    })
    expect(result).toEqual({
      totalCount: 3,
      items: [
        {
          id: '1001',
          name: 'user-a',
          iconUrl: 'https://img.nicoprofile.nimg.jp/a.jpg',
          followerCount: 10,
          videoCount: 2,
          description: '説明 文',
        },
        {
          id: '1002',
          name: 'user-b',
          iconUrl: undefined,
          followerCount: 0,
          videoCount: 0,
          description: '',
        },
      ],
    })
    expect(parseUserSearchResponse({ data: {} })).toBeNull()
  })
})
