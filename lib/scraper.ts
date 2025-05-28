// ニコニコ動画のランキングページをスクレイピングするモジュール

import type { RankingItem } from '@/types/ranking'
import { parseHTML } from './html-parser'

// User-Agentの設定（Googlebotで地域ブロック回避）
const GOOGLEBOT_USER_AGENT = 'Googlebot/2.1 (+http://www.google.com/bot.html)'
// 通常のUser-Agent（API用）
const NORMAL_USER_AGENT = 'NicoRankingScraper/1.0 (+https://github.com/YJSN180/nico-ranking-custom)'

// レート制限の設定
const RATE_LIMIT = {
  maxRequests: 60,  // 最大リクエスト数/分
  windowMs: 60000   // 1分
}

// リクエスト履歴を管理
const requestHistory: number[] = []

// レート制限チェック
async function checkRateLimit(): Promise<void> {
  const now = Date.now()
  const windowStart = now - RATE_LIMIT.windowMs
  
  // 古い履歴を削除
  while (requestHistory.length > 0 && requestHistory[0]! < windowStart) {
    requestHistory.shift()
  }
  
  // 制限に達している場合は待機
  if (requestHistory.length >= RATE_LIMIT.maxRequests) {
    const oldestRequest = requestHistory[0]!
    const waitTime = oldestRequest + RATE_LIMIT.windowMs - now
    if (waitTime > 0) {
      await new Promise(resolve => setTimeout(resolve, waitTime))
    }
  }
  
  requestHistory.push(now)
}

// HTMLエンティティをデコード
function decodeHTMLEntities(text: string): string {
  const entities: Record<string, string> = {
    '&amp;': '&',
    '&lt;': '<',
    '&gt;': '>',
    '&quot;': '"',
    '&#39;': "'",
    '&#x27;': "'",
    '&#x2F;': '/',
    '&#x60;': '`',
    '&#x3D;': '='
  }
  
  return text.replace(/&[#\w]+;/g, (entity) => entities[entity] || entity)
}

// ランキングページからHTMLデータを取得
export async function scrapeRankingPage(
  genre: string,
  term: '24h' | 'hour',
  tag?: string
): Promise<{
  items: Partial<RankingItem>[]
  popularTags?: string[]
}> {
  await checkRateLimit()
  
  // URLの構築
  const params = new URLSearchParams({ term })
  if (tag) {
    params.append('tag', tag)
  }
  
  const url = `https://www.nicovideo.jp/ranking/genre/${genre}?${params}`
  
  try {
    const response = await fetch(url, {
      headers: {
        'User-Agent': GOOGLEBOT_USER_AGENT,  // Googlebotで地域ブロック回避
        'Accept': 'text/html,application/xhtml+xml',
        'Accept-Language': 'ja,en;q=0.9',
        'Accept-Encoding': 'gzip, deflate, br',
        'Cache-Control': 'no-cache'
      }
    })
    
    if (!response.ok) {
      throw new Error(`Failed to fetch ranking page: ${response.status}`)
    }
    
    const html = await response.text()
    const items = parseRankingHTML(html)
    const popularTags = genre !== 'all' ? parsePopularTags(html) : undefined
    
    return { items, popularTags }
    
  } catch (error) {
    throw new Error(`Scraping failed: ${error}`)
  }
}

// HTMLからランキングデータを抽出
function parseRankingHTML(html: string): Partial<RankingItem>[] {
  const items: Partial<RankingItem>[] = []
  
  // シンプルな正規表現でランキングアイテムを抽出
  const rankingItemRegex = /<li[^>]+class="[^"]*RankingVideo[^"]*"[^>]*>([\s\S]*?)<\/li>/g
  
  let match
  let rank = 1
  
  while ((match = rankingItemRegex.exec(html)) !== null) {
    const itemHTML = match[1]
    if (!itemHTML) continue
    
    const item: Partial<RankingItem> = { rank: rank++ }
    
    // 動画ID
    const idMatch = itemHTML.match(/href="\/watch\/([\w]+)"/)
    if (idMatch) item.id = idMatch[1]
    
    // タイトル（data-title属性から）
    const titleMatch = itemHTML.match(/data-title="([^"]+)"/)
    if (titleMatch && titleMatch[1]) item.title = decodeHTMLEntities(titleMatch[1])
    
    // サムネイル
    const thumbMatch = itemHTML.match(/<img[^>]+src="([^"]+)"[^>]*>/)
    if (thumbMatch) item.thumbURL = thumbMatch[1]
    
    // 再生数
    const viewMatch = itemHTML.match(/data-view-counter="(\d+)"/)
    if (viewMatch && viewMatch[1]) item.views = parseInt(viewMatch[1], 10)
    
    // コメント数
    const commentMatch = itemHTML.match(/data-comment-counter="(\d+)"/)
    if (commentMatch && commentMatch[1]) item.comments = parseInt(commentMatch[1], 10)
    
    // マイリスト数
    const mylistMatch = itemHTML.match(/data-mylist-counter="(\d+)"/)
    if (mylistMatch && mylistMatch[1]) item.mylists = parseInt(mylistMatch[1], 10)
    
    // 投稿者ID
    const authorIdMatch = itemHTML.match(/href="\/user\/(\d+)"/)
    if (authorIdMatch) {
      item.authorId = authorIdMatch[1]
    } else {
      // チャンネルやコミュニティの場合
      const channelMatch = itemHTML.match(/href="\/(channel|community)\/([\w]+)"/)
      if (channelMatch) {
        item.authorId = `${channelMatch[1]}/${channelMatch[2]}`
      }
    }
    
    // 投稿者名
    const authorNameMatch = itemHTML.match(/<span[^>]+class="[^"]*userName[^"]*"[^>]*>([^<]+)<\/span>/)
    if (authorNameMatch && authorNameMatch[1]) {
      item.authorName = decodeHTMLEntities(authorNameMatch[1])
    }
    
    // 投稿者アイコン
    const authorIconMatch = itemHTML.match(/<img[^>]+class="[^"]*usericon[^"]*"[^>]+src="([^"]+)"/)
    if (authorIconMatch) {
      item.authorIcon = authorIconMatch[1]
    }
    
    if (item.id) {
      items.push(item)
    }
  }
  
  return items
}

// 動画詳細情報を取得（タグ、いいね数、投稿日時）
export async function fetchVideoDetails(videoId: string): Promise<{
  tags?: string[]
  likes?: number
  registeredAt?: string
}> {
  await checkRateLimit()
  
  const url = `https://www.nicovideo.jp/api/watch/v3_guest/${videoId}?_frontendId=70&_frontendVersion=0&actionTrackId=${Date.now()}`
  
  try {
    const response = await fetch(url, {
      headers: {
        'User-Agent': NORMAL_USER_AGENT,  // APIには通常のUser-Agent
        'X-Frontend-Id': '70',
        'X-Frontend-Version': '0',
        'Accept': 'application/json',
        'Referer': `https://www.nicovideo.jp/watch/${videoId}`
      }
    })
    
    if (!response.ok) {
      throw new Error(`Failed to fetch video details: ${response.status}`)
    }
    
    const data = await response.json()
    
    return {
      tags: data.data?.tag?.items?.map((tag: any) => tag.name) || [],
      likes: data.data?.video?.count?.like || 0,
      registeredAt: data.data?.video?.registeredAt
    }
    
  } catch (error) {
    // エラー時は空のデータを返す
    return {}
  }
}

// バッチで複数の動画詳細を取得（並列実行数を制限）
export async function fetchVideoDetailsBatch(
  videoIds: string[],
  concurrency: number = 3
): Promise<Map<string, { tags?: string[], likes?: number, registeredAt?: string }>> {
  const results = new Map()
  
  // 並列実行数を制限しながら処理
  for (let i = 0; i < videoIds.length; i += concurrency) {
    const batch = videoIds.slice(i, i + concurrency)
    const batchResults = await Promise.all(
      batch.map(async (id) => {
        const details = await fetchVideoDetails(id)
        return { id, details }
      })
    )
    
    for (const { id, details } of batchResults) {
      results.set(id, details)
    }
    
    // バッチ間に少し待機
    if (i + concurrency < videoIds.length) {
      await new Promise(resolve => setTimeout(resolve, 500))
    }
  }
  
  return results
}

// ランキングページから人気タグを抽出
function parsePopularTags(html: string): string[] {
  const tags: string[] = []
  
  // 人気タグは通常、<a class="...TagLink..." href="/tag/...">タグ名</a> の形式
  // または <button class="...tag...">タグ名</button> の形式
  const tagRegex = /<a[^>]+(?:class="[^"]*(?:tag|Tag)[^"]*")[^>]*href="\/tag\/([^"]+)"[^>]*>([^<]+)<\/a>/gi
  const buttonTagRegex = /<button[^>]+(?:class="[^"]*(?:tag|Tag)[^"]*")[^>]*>([^<]+)<\/button>/gi
  
  let match
  
  // リンク形式のタグを抽出
  while ((match = tagRegex.exec(html)) !== null) {
    const tagName = decodeURIComponent(match[1] || '')
    const tagText = match[2]
    if (tagName && tagText && !tags.includes(tagText)) {
      tags.push(tagText)
    }
  }
  
  // ボタン形式のタグを抽出（重複を避ける）
  while ((match = buttonTagRegex.exec(html)) !== null) {
    const tagText = match[1]
    if (tagText && !tags.includes(tagText)) {
      tags.push(tagText)
    }
  }
  
  // 「すべて」というタグは除外
  return tags.filter(tag => tag !== 'すべて').slice(0, 20)
}