import { parseRSSToRankingItems } from './rss-parser'
import type { RankingItem } from '@/types/ranking'
import type { RankingPeriod, RankingGenre } from '@/types/ranking-config'

// Googlebot User-Agentを使用して地域制限を回避
const GOOGLEBOT_USER_AGENT = 'Googlebot/2.1 (+http://www.google.com/bot.html)'

// ランキングRSSのURLを生成
function buildRankingURL(period: RankingPeriod = '24h', genre: RankingGenre = 'all'): string {
  return `https://www.nicovideo.jp/ranking/genre/${genre}?term=${period}&rss=2.0&lang=ja-jp`
}

export async function fetchNicoRanking(
  period: RankingPeriod = '24h',
  genre: RankingGenre = 'all'
): Promise<RankingItem[]> {
  const url = buildRankingURL(period, genre)
  const response = await fetch(url, {
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