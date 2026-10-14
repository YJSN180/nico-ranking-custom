import { decodeHtmlEntities } from '../../lib/html-entities'
import { decodeRankingData, hasDecodedNames } from './html-decode'

interface ServedItem {
  title?: unknown
  authorName?: unknown
  description?: unknown
  tags?: unknown[]
  tagDetails?: Array<{ name: string; isLocked: boolean }>
  views?: number
}

interface Served {
  items: ServedItem[]
  popularTags: unknown[]
  metadata?: Record<string, unknown>
  totalCount?: number
}

function serve(data: unknown): Served {
  return decodeRankingData(data) as Served
}

describe('decodeRankingData', () => {
  describe('印のない古い世代は 1 回だけ戻す', () => {
    it('タイトル・投稿者名・説明・タグ・人気タグを戻す', () => {
      const decoded = serve({
        items: [
          {
            id: 'sm1',
            title: 'Tom &amp; Jerry&#039;s Adventure',
            authorName: 'User &lt;Test&gt;',
            description: '&quot;Description&quot; with entities',
            tags: ['tag1 &amp; tag2', 'it&#039;s a tag'],
            views: 1000,
          },
        ],
        popularTags: ['Tag &amp; Name', 'It&#039;s Popular'],
        metadata: { version: 1, updatedAt: '2025-07-02T00:00:00Z' },
      })

      expect(decoded.items[0].title).toBe("Tom & Jerry's Adventure")
      expect(decoded.items[0].authorName).toBe('User <Test>')
      expect(decoded.items[0].description).toBe('"Description" with entities')
      expect(decoded.items[0].tags).toEqual(['tag1 & tag2', "it's a tag"])
      expect(decoded.items[0].views).toBe(1000)
      expect(decoded.popularTags).toEqual(['Tag & Name', "It's Popular"])
      expect(decoded.metadata).toEqual({ version: 1, updatedAt: '2025-07-02T00:00:00Z' })
    })

    it('二重にエスケープされた名前は 1 段だけ戻し、< までは戻さない', () => {
      const decoded = serve({
        items: [
          {
            id: 'sm1',
            title: '&amp;lt;注意&amp;gt;',
            authorName: 'A&amp;amp;B',
            tags: ['chage&amp;amp;aska', '&amp;quot;引用&amp;quot;'],
          },
        ],
        popularTags: ['chage&amp;amp;aska'],
      })

      expect(decoded.items[0].title).toBe('&lt;注意&gt;')
      expect(decoded.items[0].authorName).toBe('A&amp;B')
      expect(decoded.items[0].tags).toEqual(['chage&amp;aska', '&quot;引用&quot;'])
      expect(decoded.popularTags).toEqual(['chage&amp;aska'])
    })

    it('パイプラインと同じ戻し方をする（数値参照・&apos; も戻し、知らない名前や制御文字は残す）', () => {
      const names = [
        'Let&#039;s',
        'It&#39;s',
        '&#x27;&#x2F;&apos;',
        '&#12354;&#x1F600;',
        '&nbsp;&copy;',
        '&#0;&#x7F;&#xD800;',
        'AT&T; &amp',
        'ゲーム&amp;ウオッチ',
      ]
      const decoded = serve({
        items: names.map((name, index) => ({ id: `sm${index}`, title: name, authorName: name, tags: [name] })),
        popularTags: names,
      })

      decoded.items.forEach((item, index) => {
        const expected = decodeHtmlEntities(names[index])
        expect(item.title).toBe(expected)
        expect(item.authorName).toBe(expected)
        expect(item.tags).toEqual([expected])
      })
      expect(decoded.popularTags).toEqual(names.map((name) => decodeHtmlEntities(name)))
    })

    it('タグ詳細の名前は戻さない（修正前から戻していない）', () => {
      const tagDetails = [{ name: 'DAM&amp;JOY配信中', isLocked: true }]
      const decoded = serve({ items: [{ id: 'sm1', tags: ['DAM&amp;JOY配信中'], tagDetails }], popularTags: [] })

      expect(decoded.items[0].tags).toEqual(['DAM&JOY配信中'])
      expect(decoded.items[0].tagDetails).toEqual(tagDetails)
    })

    it('文字列でない値やない項目はそのまま残す', () => {
      const decoded = serve({
        items: [{ id: 'sm1', title: 'Test &amp; Title', tags: ['a&amp;b', null, 3] }, null],
        popularTags: [42, null],
      })

      expect(decoded.items[0].title).toBe('Test & Title')
      expect(decoded.items[0].authorName).toBeUndefined()
      expect(decoded.items[0].description).toBeUndefined()
      expect(decoded.items[0].tags).toEqual(['a&b', null, 3])
      expect(decoded.items[1]).toBeNull()
      expect(decoded.popularTags).toEqual([42, null])
    })
  })

  describe('パイプラインが戻し済みの世代（metadata.namesDecoded: true）は戻さない', () => {
    const marked = {
      items: [
        {
          id: 'sm1',
          title: 'タイトルに &amp;lt; と書く',
          authorName: 'A&amp;B',
          tags: ['chage&amp;aska', 'ゲーム&ウオッチ'],
          tagDetails: [
            { name: 'chage&amp;aska', isLocked: true },
            { name: 'ゲーム&ウオッチ', isLocked: false },
          ],
        },
      ],
      popularTags: ['chage&amp;aska', 'L&#039;Arc～en～Ciel'],
      tags: { 'chage&amp;aska': 1 },
      metadata: { version: 1, updatedAt: '2026-10-04T00:20:00.000Z', genre: 'all', period: '24h', namesDecoded: true },
    }

    it('実在の名前（chage&amp;aska など）をそのまま返す', () => {
      expect(serve(marked)).toEqual(marked)
    })

    it('件数の上限と人気タグの形の直しは同じように行う', () => {
      const items = Array.from({ length: 1200 }, (_, i) => ({ id: `sm${i + 1}`, title: `Video ${i + 1} &amp; Title` }))
      const decoded = serve({
        items,
        popularTags: [{ '1': '方', '0': '東', '2': '&amp;' }],
        metadata: { namesDecoded: true },
      })

      expect(decoded.items).toHaveLength(1000)
      expect(decoded.items[999].title).toBe('Video 1000 &amp; Title')
      expect(decoded.popularTags).toEqual(['東方&amp;'])
    })

    it.each([['true'], [1], [false], [undefined], [null]])('namesDecoded が %s なら印とみなさず戻す', (value) => {
      const data = { items: [{ id: 'sm1', title: 'A &amp; B' }], popularTags: [], metadata: { namesDecoded: value } }

      expect(hasDecodedNames(data)).toBe(false)
      expect(serve(data).items[0].title).toBe('A & B')
    })

    it('metadata の外に置いた印は見ない', () => {
      const data = { items: [{ id: 'sm1', title: 'A &amp; B' }], popularTags: [], namesDecoded: true }

      expect(hasDecodedNames(data)).toBe(false)
      expect(serve(data).items[0].title).toBe('A & B')
    })
  })

  describe('形の扱い', () => {
    it('items と popularTags がなければ空の配列にする', () => {
      expect(serve({ metadata: { version: 1 } })).toEqual({ items: [], popularTags: [], metadata: { version: 1 } })
    })

    it('最大1000件に制限し、ほかのフィールドは残す', () => {
      const items = Array.from({ length: 1200 }, (_, i) => ({ id: `sm${i + 1}`, title: `Video ${i + 1} &amp; Title` }))
      const decoded = serve({ items, popularTags: [], totalCount: 1200 })

      expect(decoded.items).toHaveLength(1000)
      expect(decoded.items[0].title).toBe('Video 1 & Title')
      expect(decoded.items[999].title).toBe('Video 1000 & Title')
      expect(decoded.totalCount).toBe(1200)
    })

    it('オブジェクト形式の人気タグを文字列にしてから戻す', () => {
      const decoded = serve({ items: [], popularTags: [{ '0': '東', '1': '方', '2': '&amp;' }, 'B&amp;B'] })

      expect(decoded.popularTags).toEqual(['東方&', 'B&B'])
    })

    it('オブジェクトでないデータはそのまま返す', () => {
      expect(decodeRankingData(null)).toBeNull()
      expect(decodeRankingData(undefined)).toBeUndefined()
      expect(decodeRankingData('text')).toBe('text')
    })
  })
})
