import { parseRSSToRankingItems } from './rss-parser'
import { fetchVideoDetails, mergeRankingData } from './snapshot-api'
import type { EnhancedRankingItem, RankingType } from '@/types/enhanced-ranking'

const GOOGLEBOT_USER_AGENT = 'Googlebot/2.1 (+http://www.google.com/bot.html)'

export async function fetchEnhancedRanking(
  rankingType: RankingType = { id: 'daily-all', label: '24時間総合', term: '24h' }
): Promise<EnhancedRankingItem[]> {
  // Build RSS URL based on ranking type
  const baseUrl = 'https://www.nicovideo.jp/ranking'
  const genre = rankingType.genre || 'all'
  const rssUrl = `${baseUrl}/genre/${genre}?term=${rankingType.term}&rss=2.0&lang=ja-jp`
  
  // Fetch RSS data
  const response = await fetch(rssUrl, {
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
  const rssItems = parseRSSToRankingItems(xmlText)
  
  // Extract video IDs for Snapshot API
  const videoIds = rssItems.slice(0, 20).map(item => item.id) // Limit to top 20 for performance
  
  // Fetch detailed data from Snapshot API
  const detailsMap = await fetchVideoDetails(videoIds)
  
  // Merge RSS and Snapshot data
  const enhancedItems = mergeRankingData(rssItems, detailsMap)
  
  return enhancedItems
}