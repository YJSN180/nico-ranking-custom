import { parseRSSToRankingItems } from './rss-parser'
import type { RankingItem } from '@/types/ranking'
import type { RankingPeriod, RankingGenre } from '@/types/ranking-config'

// Googlebot User-Agentを使用して地域制限を回避
const GOOGLEBOT_USER_AGENT = 'Googlebot/2.1 (+http://www.google.com/bot.html)'

// ランキングRSSのURLを生成
function buildRankingURL(period: RankingPeriod = '24h', genre: RankingGenre = 'all', tag?: string): string {
  if (tag) {
    // タグ別ランキングのURL
    return `https://www.nicovideo.jp/ranking/tag/${encodeURIComponent(tag)}?term=${period}&rss=2.0&lang=ja-jp`
  }
  // ジャンル別ランキングのURL
  return `https://www.nicovideo.jp/ranking/genre/${genre}?term=${period}&rss=2.0&lang=ja-jp`
}

export async function fetchNicoRanking(
  period: RankingPeriod = '24h',
  genre: RankingGenre = 'all',
  tag?: string
): Promise<RankingItem[]> {
  const targetUrl = buildRankingURL(period, genre, tag)
  
  // Cloudflare Proxyを使用するか、直接アクセスするかを判定
  const proxyUrl = process.env.CLOUDFLARE_PROXY_URL
  let fetchUrl = targetUrl
  let headers: HeadersInit = {
    'User-Agent': GOOGLEBOT_USER_AGENT,
    'Accept': 'application/rss+xml, application/xml, text/xml, */*',
    'Accept-Language': 'ja-JP,ja;q=0.9,en;q=0.8',
    'Cache-Control': 'no-cache',
    'Pragma': 'no-cache',
  }

  // プロキシが設定されている場合はプロキシ経由でアクセス
  if (proxyUrl) {
    fetchUrl = `${proxyUrl}?url=${encodeURIComponent(targetUrl)}`
    headers = {} // プロキシ経由の場合はヘッダーは不要（プロキシ側で設定）
  }

  const response = await fetch(fetchUrl, { headers })

  if (!response.ok) {
    throw new Error(`Failed to fetch RSS: ${response.status}`)
  }

  const xmlText = await response.text()
  return parseRSSToRankingItems(xmlText)
}