import { XMLParser } from 'fast-xml-parser'
import type { RankingItem } from '@/types/ranking'
import type { RSSDocument, RSSItem } from '@/types/rss'

export function parseRSSToRankingItems(xml: string): RankingItem[] {
  const parser = new XMLParser({
    ignoreAttributes: false,
    removeNSPrefix: false,
  })

  const parsed = parser.parse(xml) as RSSDocument
  const channel = parsed?.rss?.channel
  if (!channel) return []

  const items = Array.isArray(channel.item) ? channel.item : [channel.item].filter(Boolean) as RSSItem[]

  return items
    .slice(0, 100)
    .map((item: RSSItem, index) => {
      const title = String(item.title || '')
      // "第1位：" のような接頭辞を削除
      const cleanTitle = title.replace(/^第\d+位[：:]/, '').trim()
      
      const link = String(item.link || '')
      // URLから動画IDを抽出（パラメータを除外）
      const idMatch = link.match(/watch\/((?:sm|nm|so)\d+)/)
      const id = idMatch?.[1] || ''

      let thumbURL = ''
      let views = 0
      
      if (item.description && typeof item.description === 'string') {
        const imgMatch = item.description.match(/src="([^"]+)"/)
        thumbURL = imgMatch?.[1] || ''
        
        // descriptionから再生数を抽出
        const viewsMatch = item.description.match(/<strong class="nico-info-total-view">([\d,]+)<\/strong>/)
        if (viewsMatch?.[1]) {
          views = parseInt(viewsMatch[1].replace(/,/g, ''), 10) || 0
        }
      }

      return {
        rank: index + 1,
        id,
        title: cleanTitle,
        thumbURL,
        views,
      }
    })
}