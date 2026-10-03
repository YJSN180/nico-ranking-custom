import { describe, expect, it, vi } from 'vitest'
import {
  VIDEO_LOOKUP_MAX_IDS,
  buildLookupPageQuery,
  buildVideoLookupQuery,
  fetchVideosByIds,
  parseV3GuestVideo,
  parseVideoIdsInput,
  sanitizeLookupIds,
} from '@/lib/search/video-lookup'

const json = (body: unknown, status = 200): Response =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  })

const v3 = (id: string, extra: Record<string, unknown> = {}) => ({
  meta: { status: 200 },
  data: {
    video: {
      title: `title-${id}`,
      duration: 320,
      registeredAt: '2007-03-06T00:33:00+09:00',
      count: { view: 100, comment: 20, mylist: 3, like: 4 },
      thumbnail: {
        url: `https://nicovideo.cdn.nimg.jp/thumbnails/${id}`,
        middleUrl: null,
        largeUrl: null,
      },
    },
    owner: {
      id: 1001,
      nickname: 'user-1001',
      iconUrl: 'https://img.nicoprofile.nimg.jp/usericon/1001.jpg',
    },
    channel: null,
    tag: {
      items: [
        { name: 'locked', isLocked: true },
        { name: 'free', isLocked: false },
      ],
    },
    ...extra,
  },
})

describe('video-lookup', () => {
  describe('入力から動画IDを読む', () => {
    it('ID・視聴ページの URL・短縮 URL を、入力順・重複なし・小文字で読む', () => {
      expect(
        parseVideoIdsInput(
          'SM9 https://www.nicovideo.jp/watch/so123?ref=x nico.ms/sm9 ss45, nm7',
        ),
      ).toEqual(['sm9', 'so123', 'ss45', 'nm7'])
      expect(
        parseVideoIdsInput('https://sp.nicovideo.jp/watch/sm10#comments'),
      ).toEqual(['sm10'])
    })

    it('語が混ざる・形式が違う・空なら null（キーワード検索のまま）', () => {
      expect(parseVideoIdsInput('sm9 初音ミク')).toBeNull()
      expect(parseVideoIdsInput('sm0')).toBeNull()
      expect(parseVideoIdsInput('lv123')).toBeNull()
      expect(parseVideoIdsInput('https://example.com/watch/sm9')).toBeNull()
      expect(parseVideoIdsInput('   ')).toBeNull()
    })

    it('問い合わせ・ページ URL の形', () => {
      expect(buildVideoLookupQuery(['sm9', 'so1'])).toBe('ids=sm9%2Cso1')
      expect(buildLookupPageQuery(['sm9', 'so1'])).toBe('type=id&q=sm9+so1')
    })

    it(`サーバーでは形式不正・重複を捨て、${VIDEO_LOOKUP_MAX_IDS} 件までにする`, () => {
      expect(sanitizeLookupIds('sm9,bad,sm9,so1')).toEqual(['sm9', 'so1'])
      const many = Array.from({ length: 30 }, (_, i) => `sm${i + 1}`).join(',')
      expect(sanitizeLookupIds(many)).toHaveLength(VIDEO_LOOKUP_MAX_IDS)
      expect(sanitizeLookupIds(null)).toEqual([])
    })
  })

  describe('v3_guest の応答', () => {
    it('ランキングと同じ行の形にする（投稿者・ロックタグ・統計）', () => {
      expect(parseV3GuestVideo(v3('sm9'), 'sm9')).toMatchObject({
        id: 'sm9',
        title: 'title-sm9',
        thumbURL: 'https://nicovideo.cdn.nimg.jp/thumbnails/sm9',
        views: 100,
        comments: 20,
        mylists: 3,
        likes: 4,
        duration: 320,
        authorId: '1001',
        authorName: 'user-1001',
        tags: ['locked', 'free'],
        tagDetails: [
          { name: 'locked', isLocked: true },
          { name: 'free', isLocked: false },
        ],
      })
    })

    it('チャンネル動画はチャンネルを投稿者にする', () => {
      const item = parseV3GuestVideo(
        v3('so1', {
          owner: null,
          channel: {
            id: 'ch5',
            name: 'channel-5',
            thumbnail: { url: 'https://secure-dcdn.cdn.nimg.jp/c.jpg' },
          },
        }),
        'so1',
      )
      expect(item).toMatchObject({
        authorId: 'channel/ch5',
        authorName: 'channel-5',
      })
    })

    it('題名の無い応答は null', () => {
      expect(parseV3GuestVideo({ data: { video: {} } }, 'sm9')).toBeNull()
    })
  })

  it('見つからない・見られない・失敗を分け、見つかった動画は入力順に返す', async () => {
    const fetchImpl = vi.fn(
      async (input: string | URL | Request): Promise<Response> => {
        const id = String(input).match(/v3_guest\/(\w+)/)?.[1] ?? ''
        if (id === 'sm404')
          return json({ meta: { status: 404, errorCode: 'NOT_FOUND' } }, 404)
        if (id === 'sm403') return json({ meta: { status: 403 } }, 403)
        if (id === 'sm500') return json({}, 500)
        return json(v3(id))
      },
    ) as unknown as typeof fetch
    const result = await fetchVideosByIds(
      ['sm2', 'sm404', 'sm1', 'sm403', 'sm500'],
      { fetchImpl },
    )
    expect(result.items.map((item) => item.id)).toEqual(['sm2', 'sm1'])
    expect(result.missing).toEqual(['sm404'])
    expect(result.unavailable).toEqual(['sm403'])
    expect(result.failed).toEqual(['sm500'])
  })
})
