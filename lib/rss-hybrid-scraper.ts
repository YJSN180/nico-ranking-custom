// RSS + nvAPI + HTMLのハイブリッドスクレイピング実装
// RSSフィードからセンシティブ動画を含む完全なリストを取得

import type { RankingItem } from '@/types/ranking'
import { fetchRanking } from './complete-hybrid-scraper'

// RSSフィードからランキングデータを取得
async function fetchFromRSS(
  genre: string,
  term: string
): Promise<{
  items: Partial<RankingItem>[]
  videoIds: string[]
}> {
  const rssUrl = `https://www.nicovideo.jp/ranking/genre/${genre}?term=${term}&rss=2.0&lang=ja-jp`
  
  try {
    const response = await fetch(rssUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)',
        'Accept': 'application/rss+xml, application/xml, text/xml'
      }
    })
    
    if (!response.ok) {
      throw new Error(`RSS fetch failed: ${response.status}`)
    }
    
    const rssText = await response.text()
    const items: Partial<RankingItem>[] = []
    const videoIds: string[] = []
    
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
        videoIds.push(videoId)
        
        // descriptionからサムネイルURLを抽出
        const thumbMatch = itemXml.match(/<img[^>]+src="([^"]+)"/)
        const thumbURL = thumbMatch?.[1]?.replace(/&amp;/g, '&')
        
        // descriptionから再生数などを抽出
        const descMatch = itemXml.match(/<description><!\[CDATA\[([\s\S]*?)\]\]><\/description>/)
        const description = descMatch?.[1] || ''
        
        // 再生数を抽出
        const viewMatch = description.match(/再生：<strong[^>]*>([0-9,]+)<\/strong>/)
        const views = viewMatch?.[1] ? parseInt(viewMatch[1].replace(/,/g, ''), 10) : 0
        
        // コメント数を抽出
        const commentMatch = description.match(/コメント：<strong[^>]*>([0-9,]+)<\/strong>/)
        const comments = commentMatch?.[1] ? parseInt(commentMatch[1].replace(/,/g, ''), 10) : undefined
        
        // マイリスト数を抽出
        const mylistMatch = description.match(/マイリスト：<strong[^>]*>([0-9,]+)<\/strong>/)
        const mylists = mylistMatch?.[1] ? parseInt(mylistMatch[1].replace(/,/g, ''), 10) : undefined
        
        items.push({
          rank,
          id: videoId,
          title,
          thumbURL,
          views,
          comments,
          mylists
        })
        
        rank++
      }
    }
    
    return { items, videoIds }
  } catch (error) {
    throw new Error(`RSS scraping failed: ${error}`)
  }
}

// RSS + nvAPIのハイブリッド実装
export async function rssHybridScrape(
  genre: string,
  term: '24h' | 'hour',
  tag?: string
): Promise<{
  items: Partial<RankingItem>[]
  popularTags?: string[]
}> {
  // タグ指定がある場合は既存のハイブリッド実装を使用
  if (tag) {
    const data = await fetchRanking(genre, tag, term)
    return {
      items: data.items,
      popularTags: data.popularTags
    }
  }
  
  try {
    // 1. RSSから完全なリストを取得（センシティブ動画を含む）
    const rssData = await fetchFromRSS(genre, term)
    
    // 2. nvAPIからリッチなデータを取得
    const data = await fetchRanking(genre, null, term)
    const nvapiData = {
      items: data.items,
      popularTags: data.popularTags
    }
    
    // 3. データをマージ（RSSの順序を維持、nvAPIのリッチなデータを使用）
    const nvapiMap = new Map<string, Partial<RankingItem>>()
    nvapiData.items.forEach(item => {
      if (item.id) {
        nvapiMap.set(item.id, item)
      }
    })
    
    // RSSの順序でマージ
    const mergedItems = rssData.items.map(rssItem => {
      const nvapiItem = rssItem.id ? nvapiMap.get(rssItem.id) : undefined
      
      if (nvapiItem) {
        // nvAPIのリッチなデータを優先、ランク順はRSSから
        return {
          ...nvapiItem,
          rank: rssItem.rank
        }
      } else {
        // nvAPIにない動画（センシティブ）はRSSデータを使用
        return rssItem
      }
    })
    
    return {
      items: mergedItems,
      popularTags: nvapiData.popularTags
    }
    
  } catch (error) {
    // RSSが失敗した場合は既存のハイブリッド実装にフォールバック
    // RSS hybrid scraping failed - falling back to RSS-only
    const data = await fetchRanking(genre, tag, term)
    return {
      items: data.items,
      popularTags: data.popularTags
    }
  }
}