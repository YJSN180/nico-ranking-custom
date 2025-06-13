// RSSフォールバック関数
import type { RankingItem } from '@/types/ranking'

// HTMLエンティティをデコード
export function decodeHTMLEntities(text: string): string {
  return text
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, ' ')
    .replace(/&#(\d+);/g, (match, dec) => String.fromCharCode(parseInt(dec, 10)))
    .replace(/&#x([0-9A-F]+);/gi, (match, hex) => String.fromCharCode(parseInt(hex, 16)))
}

// RSSフォールバック関数
export async function fetchFromRSSFallback(
  genre: string,
  term: string
): Promise<{
  items: Partial<RankingItem>[]
  success: boolean
}> {
  try {
    const rssUrl = `https://www.nicovideo.jp/ranking/genre/${genre}?term=${term}&rss=2.0&lang=ja-jp`
    
    const response = await fetch(rssUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Accept': 'application/rss+xml, application/xml, text/xml'
      }
    })
    
    if (!response.ok) {
      return { items: [], success: false }
    }
    
    const rssText = await response.text()
    const items: Partial<RankingItem>[] = []
    
    // RSSからアイテムを抽出
    const itemMatches = rssText.matchAll(/<item>([\s\S]*?)<\/item>/g)
    let rank = 1
    
    for (const match of itemMatches) {
      const itemXml = match[1]
      if (!itemXml) continue
      
      // タイトルを抽出（第X位：を除去）
      const titleMatch = itemXml.match(/<title>(?:第\d+位：)?([^<]+)<\/title>/)
      const title = titleMatch?.[1] || ''
      
      // 動画IDを抽出
      const linkMatch = itemXml.match(/<link>https:\/\/(?:www\.)?nicovideo\.jp\/watch\/((?:sm|nm|so)\d+)<\/link>/)
      const videoId = linkMatch?.[1]
      
      if (videoId) {
        // サムネイルURLを抽出
        const thumbMatch = itemXml.match(/<img[^>]+src="([^"]+)"/)
        const thumbURL = thumbMatch?.[1]?.replace(/&amp;/g, '&')
        
        items.push({
          rank,
          id: videoId,
          title: decodeHTMLEntities(title),
          thumbURL,
          views: 0 // RSSには再生数が含まれない
        })
        
        rank++
      }
    }
    
    return { items, success: true }
  } catch (error) {
    // RSS fallback failed - returning empty result
    return { items: [], success: false }
  }
}