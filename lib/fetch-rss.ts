import { parseRSSToRankingItems } from './rss-parser'
import type { RankingItem } from '@/types/ranking'

// 総合デイリーランキング（24時間）
const RSS_URL = 'https://www.nicovideo.jp/ranking/genre/all?term=24h&rss=2.0&lang=ja-jp'
// Googlebot User-Agentを使用して地域制限を回避
const GOOGLEBOT_USER_AGENT = 'Googlebot/2.1 (+http://www.google.com/bot.html)'

export async function fetchNicoRanking(): Promise<RankingItem[]> {
  const response = await fetch(RSS_URL, {
    headers: {
      'User-Agent': GOOGLEBOT_USER_AGENT,
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