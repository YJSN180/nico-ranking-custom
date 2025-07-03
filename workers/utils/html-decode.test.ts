import { decodeHtmlEntities, decodeRankingItem, decodeRankingData } from './html-decode'

describe('HTML Decode Utilities', () => {
  describe('decodeHtmlEntities', () => {
    it('should decode basic HTML entities', () => {
      expect(decodeHtmlEntities('&amp;')).toBe('&')
      expect(decodeHtmlEntities('&lt;')).toBe('<')
      expect(decodeHtmlEntities('&gt;')).toBe('>')
      expect(decodeHtmlEntities('&quot;')).toBe('"')
      expect(decodeHtmlEntities('&#039;')).toBe("'")
      expect(decodeHtmlEntities('&#x27;')).toBe("'")
      expect(decodeHtmlEntities('&#x2F;')).toBe('/')
    })

    it('should decode multiple entities in a string', () => {
      expect(decodeHtmlEntities('Tom &amp; Jerry')).toBe('Tom & Jerry')
      expect(decodeHtmlEntities('It&#039;s a test')).toBe("It's a test")
      expect(decodeHtmlEntities('&lt;div&gt;Hello&lt;/div&gt;')).toBe('<div>Hello</div>')
    })

    it('should handle empty or null values', () => {
      expect(decodeHtmlEntities('')).toBe('')
      expect(decodeHtmlEntities(null as any)).toBe(null)
      expect(decodeHtmlEntities(undefined as any)).toBe(undefined)
    })

    it('should decode actual ニコニコ動画 titles', () => {
      expect(decodeHtmlEntities('【実況】Let&#039;s Play ゲーム実況')).toBe("【実況】Let's Play ゲーム実況")
      expect(decodeHtmlEntities('&quot;引用タイトル&quot;')).toBe('"引用タイトル"')
    })
  })

  describe('decodeRankingItem', () => {
    it('should decode all text fields in a ranking item', () => {
      const item = {
        id: 'sm12345',
        title: 'Tom &amp; Jerry&#039;s Adventure',
        authorName: 'User &lt;Test&gt;',
        description: '&quot;Description&quot; with entities',
        tags: ['tag1 &amp; tag2', 'it&#039;s a tag'],
        views: 1000
      }

      const decoded = decodeRankingItem(item)
      
      expect(decoded.title).toBe("Tom & Jerry's Adventure")
      expect(decoded.authorName).toBe('User <Test>')
      expect(decoded.description).toBe('"Description" with entities')
      expect(decoded.tags).toEqual(['tag1 & tag2', "it's a tag"])
      expect(decoded.views).toBe(1000) // 数値はそのまま
    })

    it('should handle items with missing fields', () => {
      const item = {
        id: 'sm12345',
        title: 'Test &amp; Title'
      }

      const decoded = decodeRankingItem(item)
      
      expect(decoded.title).toBe('Test & Title')
      expect(decoded.authorName).toBeUndefined()
      expect(decoded.description).toBeUndefined()
    })
  })

  describe('decodeRankingData', () => {
    it('should decode entire ranking data structure', () => {
      const data = {
        items: [
          {
            id: 'sm1',
            title: 'Video &amp; Title',
            authorName: 'Author&#039;s Name'
          },
          {
            id: 'sm2',
            title: '&lt;Test&gt; Video',
            authorName: '&quot;Quoted&quot; Author'
          }
        ],
        popularTags: [
          'Tag &amp; Name',
          'It&#039;s Popular'
        ],
        metadata: {
          version: 1,
          updatedAt: '2025-07-02T00:00:00Z'
        }
      }

      const decoded = decodeRankingData(data)
      
      expect(decoded.items[0].title).toBe('Video & Title')
      expect(decoded.items[0].authorName).toBe("Author's Name")
      expect(decoded.items[1].title).toBe('<Test> Video')
      expect(decoded.items[1].authorName).toBe('"Quoted" Author')
      expect(decoded.popularTags[0]).toBe('Tag & Name')
      expect(decoded.popularTags[1]).toBe("It's Popular")
      expect(decoded.metadata).toEqual(data.metadata) // メタデータはそのまま
    })

    it('should handle empty data', () => {
      const data = {
        items: [],
        popularTags: []
      }

      const decoded = decodeRankingData(data)
      
      expect(decoded.items).toEqual([])
      expect(decoded.popularTags).toEqual([])
    })

    it('should limit items to maximum 500', () => {
      // 600件のテストデータを作成
      const items = Array.from({ length: 600 }, (_, i) => ({
        id: `sm${i + 1}`,
        title: `Video ${i + 1} &amp; Title`,
        authorName: `Author ${i + 1}`
      }))

      const data = {
        items,
        popularTags: [],
        totalCount: 600
      }

      const decoded = decodeRankingData(data)
      
      // 500件に制限されていることを確認
      expect(decoded.items).toHaveLength(500)
      expect(decoded.items[0].title).toBe('Video 1 & Title')
      expect(decoded.items[499].title).toBe('Video 500 & Title')
      // 元のtotalCountは保持される
      expect(decoded.totalCount).toBe(600)
    })
  })
})