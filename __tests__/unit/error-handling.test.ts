import { describe, it, expect, vi, beforeEach } from 'vitest'
import { parseRSSToRankingItems } from '@/lib/rss-parser'

describe('Error Handling', () => {
  describe('RSS Parser Error Cases', () => {
    it('should handle empty XML gracefully', () => {
      const result = parseRSSToRankingItems('')
      expect(result).toEqual([])
    })

    it('should handle invalid XML gracefully', () => {
      const result = parseRSSToRankingItems('not valid xml at all')
      expect(result).toEqual([])
    })

    it('should handle XML without rss element', () => {
      const result = parseRSSToRankingItems('<?xml version="1.0"?><root></root>')
      expect(result).toEqual([])
    })

    it('should handle XML without channel element', () => {
      const result = parseRSSToRankingItems('<?xml version="1.0"?><rss></rss>')
      expect(result).toEqual([])
    })

    it('should handle malformed item data', () => {
      const xml = `<?xml version="1.0"?>
<rss version="2.0" xmlns:nico="http://www.nicovideo.jp/rss/2.0">
  <channel>
    <item>
      <!-- Missing required fields -->
    </item>
    <item>
      <title>【第2位】Valid Item</title>
      <link>https://www.nicovideo.jp/watch/sm123</link>
      <nico:views>1000</nico:views>
    </item>
  </channel>
</rss>`

      const result = parseRSSToRankingItems(xml)
      expect(result).toHaveLength(2)
      expect(result[0]).toMatchObject({
        rank: 1,
        id: '',
        title: '',
        thumbURL: '',
        views: 0,
      })
      expect(result[1]).toMatchObject({
        rank: 2,
        id: 'sm123',
        title: 'Valid Item',
        views: 1000,
      })
    })

    it('should handle non-numeric views gracefully', () => {
      const xml = `<?xml version="1.0"?>
<rss version="2.0" xmlns:nico="http://www.nicovideo.jp/rss/2.0">
  <channel>
    <item>
      <title>Test</title>
      <link>https://www.nicovideo.jp/watch/sm123</link>
      <nico:views>not-a-number</nico:views>
    </item>
  </channel>
</rss>`

      const result = parseRSSToRankingItems(xml)
      expect(result[0]?.views).toBe(0)
    })

    it('should handle extremely large datasets efficiently', () => {
      const items = Array.from({ length: 10000 }, (_, i) => `
        <item>
          <title>Item ${i}</title>
          <link>https://www.nicovideo.jp/watch/sm${i}</link>
          <nico:views>${i}</nico:views>
        </item>
      `).join('')

      const xml = `<?xml version="1.0"?>
<rss version="2.0" xmlns:nico="http://www.nicovideo.jp/rss/2.0">
  <channel>${items}</channel>
</rss>`

      const start = Date.now()
      const result = parseRSSToRankingItems(xml)
      const duration = Date.now() - start

      expect(result).toHaveLength(100)
      expect(duration).toBeLessThan(1000) // Should process in less than 1 second
    })
  })
})