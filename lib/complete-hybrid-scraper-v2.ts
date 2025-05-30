// 完全なハイブリッドスクレイピング実装 v2
// センシティブ動画を確実に取得するための改良版

import type { RankingItem } from '@/types/ranking'

const fetchImpl = typeof fetch !== 'undefined' ? fetch : (() => { throw new Error('fetch is not available') })

const USER_AGENT = 'Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)'
const NORMAL_USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'

// レート制限管理
const RATE_LIMIT = { maxRequests: 60, windowMs: 60000 }
const requestHistory: number[] = []

async function checkRateLimit(): Promise<void> {
  const now = Date.now()
  const windowStart = now - RATE_LIMIT.windowMs
  
  while (requestHistory.length > 0 && requestHistory[0]! < windowStart) {
    requestHistory.shift()
  }
  
  if (requestHistory.length >= RATE_LIMIT.maxRequests) {
    const oldestRequest = requestHistory[0]!
    const waitTime = oldestRequest + RATE_LIMIT.windowMs - now
    if (waitTime > 0) {
      await new Promise(resolve => setTimeout(resolve, waitTime))
    }
  }
  
  requestHistory.push(now)
}

// メインエントリポイント
export async function completeHybridScrapeV2(
  genre: string,
  term: '24h' | 'hour',
  tag?: string
): Promise<{
  items: Partial<RankingItem>[]
  popularTags?: string[]
}> {
  try {
    // タグ付きランキングは現在サポートされていない
    if (tag) {
      throw new Error('タグ付きランキングは現在サポートされていません')
    }
    
    // r18ジャンルは特別処理（HTMLが総合ランキングを返すため）
    if (genre === 'r18') {
      return await fetchR18FromNvAPI(term)
    }
    
    // その他のジャンルはHTMLのmeta tagを信頼して使用
    const htmlData = await fetchFromHTMLMetaTag(genre, term)
    
    // nvAPIから追加情報を取得（センシティブ動画は除外されるが、それ以外の動画の詳細情報を取得）
    const nvapiData = await fetchFromNvAPI(genre, term)
    
    // データを結合（HTMLを基準にして、nvAPIの情報で補完）
    const enrichedItems = enrichWithNvAPIData(htmlData.items, nvapiData.itemsMap)
    
    return {
      items: enrichedItems,
      popularTags: htmlData.popularTags || nvapiData.popularTags
    }
    
  } catch (error) {
    throw new Error(`Complete hybrid scraping v2 failed: ${error}`)
  }
}

// HTMLのmeta tagから確実にデータを取得
async function fetchFromHTMLMetaTag(
  genre: string,
  term: string
): Promise<{
  items: Partial<RankingItem>[]
  popularTags?: string[]
}> {
  await checkRateLimit()
  
  const url = `https://www.nicovideo.jp/ranking/genre/${genre}?term=${term}`
  
  const response = await fetchImpl(url, {
    headers: {
      'User-Agent': USER_AGENT,
      'Accept': 'text/html,application/xhtml+xml',
      'Accept-Language': 'ja,en;q=0.9',
      'Cookie': 'sensitive_material_status=accept', // 重要: センシティブコンテンツを表示
      'X-Forwarded-For': '1.1.1.1' // 日本のIPをシミュレート
    }
  })
  
  if (!response.ok) {
    throw new Error(`HTML fetch failed: ${response.status}`)
  }
  
  const html = await response.text()
  
  // meta tagからデータを抽出
  const metaMatch = html.match(/<meta name="server-response" content="([^"]+)"/)
  if (!metaMatch) {
    throw new Error('No meta tag found in HTML')
  }
  
  const encodedData = metaMatch[1]!
  const decodedData = encodedData
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
  
  try {
    const jsonData = JSON.parse(decodedData)
    const rankingData = jsonData?.data?.response?.$getTeibanRanking?.data?.items
    
    if (!rankingData || !Array.isArray(rankingData)) {
      throw new Error('No ranking data in meta tag')
    }
    
    // 全ての動画を取得（センシティブ動画も含む）
    const items = rankingData.map((item: any, index: number) => ({
      rank: index + 1,
      id: item.id,
      title: item.title,
      thumbURL: item.thumbnail?.largeUrl || item.thumbnail?.url || '',
      views: item.count?.view || 0,
      comments: item.count?.comment,
      mylists: item.count?.mylist,
      likes: item.count?.like,
      authorId: item.owner?.id,
      authorName: item.owner?.name,
      authorIcon: item.owner?.iconUrl,
      registeredAt: item.registeredAt,
      requireSensitiveMasking: item.requireSensitiveMasking || false,
      tags: []
    }))
    
    // 人気タグを抽出
    const popularTags = extractPopularTagsFromHTML(html)
    
    return { items, popularTags }
  } catch (error) {
    throw new Error(`Failed to parse meta tag data: ${error}`)
  }
}

// nvAPIから追加情報を取得
async function fetchFromNvAPI(
  genre: string,
  term: string
): Promise<{
  items: Partial<RankingItem>[]
  itemsMap: Map<string, Partial<RankingItem>>
  popularTags?: string[]
}> {
  await checkRateLimit()
  
  const url = `https://nvapi.nicovideo.jp/v1/ranking/genre/${genre}?term=${term}`
  
  const response = await fetchImpl(url, {
    headers: {
      'User-Agent': NORMAL_USER_AGENT,
      'Accept': 'application/json',
      'X-Frontend-Id': '6',
      'X-Frontend-Version': '0',
      'Referer': 'https://www.nicovideo.jp/',
    }
  })
  
  if (!response.ok) {
    // エラーでも空のデータを返す（HTMLのデータを優先するため）
    return { items: [], itemsMap: new Map(), popularTags: [] }
  }
  
  const data = await response.json()
  
  if (data.meta?.status !== 200 || !data.data?.items) {
    return { items: [], itemsMap: new Map(), popularTags: [] }
  }
  
  const items = data.data.items.map((item: any, index: number) => ({
    rank: index + 1,
    id: item.id,
    title: item.title,
    thumbURL: item.thumbnail?.largeUrl || item.thumbnail?.url || '',
    views: item.count?.view || 0,
    comments: item.count?.comment,
    mylists: item.count?.mylist,
    likes: item.count?.like,
    authorId: item.owner?.id,
    authorName: item.owner?.name,
    authorIcon: item.owner?.iconUrl,
    registeredAt: item.registeredAt,
    tags: item.tags?.map((tag: any) => tag.name) || []
  }))
  
  const itemsMap = new Map<string, Partial<RankingItem>>(
    items.map((item: any) => [item.id, item])
  )
  
  // 人気タグを取得
  let popularTags: string[] = []
  if (genre !== 'all') {
    popularTags = await fetchPopularTags(genre)
  }
  
  return { items, itemsMap, popularTags }
}

// R18ジャンル専用処理
async function fetchR18FromNvAPI(term: string): Promise<{
  items: Partial<RankingItem>[]
  popularTags?: string[]
}> {
  const { items, popularTags } = await fetchFromNvAPI('r18', term)
  return { items, popularTags }
}

// HTMLのデータをnvAPIの情報で補完
function enrichWithNvAPIData(
  htmlItems: Partial<RankingItem>[],
  nvapiMap: Map<string, Partial<RankingItem>>
): Partial<RankingItem>[] {
  return htmlItems.map(htmlItem => {
    const nvapiItem = htmlItem.id ? nvapiMap.get(htmlItem.id) : undefined
    
    if (nvapiItem) {
      // nvAPIの詳細情報で補完（ただし基本情報はHTMLを優先）
      return {
        ...htmlItem,
        tags: nvapiItem.tags || htmlItem.tags,
        authorName: nvapiItem.authorName || htmlItem.authorName,
        authorIcon: nvapiItem.authorIcon || htmlItem.authorIcon,
      }
    }
    
    // nvAPIにない動画（センシティブ動画など）はそのまま返す
    return htmlItem
  })
}

// 人気タグを取得
async function fetchPopularTags(genre: string): Promise<string[]> {
  await checkRateLimit()
  
  try {
    const response = await fetchImpl(
      `https://nvapi.nicovideo.jp/v1/genres/${genre}/popular-tags`,
      {
        headers: {
          'User-Agent': NORMAL_USER_AGENT,
          'Accept': 'application/json',
          'X-Frontend-Id': '6',
          'X-Frontend-Version': '0',
          'Referer': 'https://www.nicovideo.jp/'
        }
      }
    )
    
    if (response.ok) {
      const data = await response.json()
      if (data.meta?.status === 200 && data.data?.tags) {
        return data.data.tags.slice(0, 20)
      }
    }
  } catch (error) {
    // エラーは無視
  }
  
  return []
}

// HTMLから人気タグを抽出
function extractPopularTagsFromHTML(html: string): string[] {
  const tags: string[] = []
  
  const tagPattern = /<a[^>]+class="[^"]*PopularTag[^"]*"[^>]*>([^<]+)</g
  let match
  
  while ((match = tagPattern.exec(html)) !== null) {
    if (match[1]) {
      const tag = match[1].trim()
      if (tag && !tags.includes(tag) && !tag.includes('すべて')) {
        tags.push(tag)
      }
    }
  }
  
  return tags.slice(0, 20)
}