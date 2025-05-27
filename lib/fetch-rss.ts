import { parseRSSToRankingItems } from './rss-parser'
import type { RankingItem } from '@/types/ranking'

const RSS_URL = 'https://www.nicovideo.jp/ranking/fav/daily/all?rss=2.0&lang=ja-jp'
const USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'

export async function fetchNicoRanking(): Promise<RankingItem[]> {
  const response = await fetch(RSS_URL, {
    headers: {
      'User-Agent': USER_AGENT,
      'Accept': 'application/rss+xml, application/xml, text/xml, */*',
      'Accept-Language': 'ja-JP,ja;q=0.9,en;q=0.8',
      'Cache-Control': 'no-cache',
      'Pragma': 'no-cache',
    },
  })

  if (!response.ok) {
    throw new Error(`Failed to fetch RSS: ${response.status}`)
  }

  const xmlText = await response.text()
  return parseRSSToRankingItems(xmlText)
}