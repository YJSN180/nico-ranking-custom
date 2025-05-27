import { XMLParser } from 'fast-xml-parser'
import type { RankingItem } from '@/types/ranking'

export function parseRSSToRankingItems(xml: string): RankingItem[] {
  const parser = new XMLParser({
    ignoreAttributes: false,
    removeNSPrefix: false,
  })

  const parsed = parser.parse(xml)
  const channel = parsed?.rss?.channel
  if (!channel) return []

  const items = Array.isArray(channel.item) ? channel.item : [channel.item].filter(Boolean)

  return items
    .slice(0, 100)
    .map((item, index) => {
      const title = item.title || ''
      const cleanTitle = title.replace(/^【第\d+位】/, '').trim()
      
      const link = item.link || ''
      const idMatch = link.match(/watch\/(sm\d+)/)
      const id = idMatch?.[1] || ''

      let thumbURL = ''
      if (item.description && typeof item.description === 'string') {
        const imgMatch = item.description.match(/src="([^"]+)"/)
        thumbURL = imgMatch?.[1] || ''
      }

      const views = parseInt(item['nico:views'] || '0', 10)

      return {
        rank: index + 1,
        id,
        title: cleanTitle,
        thumbURL,
        views,
      }
    })
}