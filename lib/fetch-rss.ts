import { parseRSSToRankingItems } from './rss-parser'
import type { RankingItem } from '@/types/ranking'

const RSS_URL = 'https://www.nicovideo.jp/ranking/fav/daily?rss=1&term=24h'
const USER_AGENT = 'Googlebot/2.1 (+https://www.google.com/bot.html)'

export async function fetchNicoRanking(): Promise<RankingItem[]> {
  const response = await fetch(RSS_URL, {
    headers: {
      'User-Agent': USER_AGENT,
    },
  })

  if (!response.ok) {
    throw new Error(`Failed to fetch RSS: ${response.status}`)
  }

  const xmlText = await response.text()
  return parseRSSToRankingItems(xmlText)
}