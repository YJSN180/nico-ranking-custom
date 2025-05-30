// 完全なハイブリッドスクレイピング実装
// HTML + nvAPI + Snapshot APIを組み合わせて全情報を取得

import type { RankingItem } from '@/types/ranking'
import { cookieScrapeRanking } from './cookie-scraper'

// Node.js環境でのfetchが利用できない場合があるため、条件付きでインポート
const fetchImpl = typeof fetch !== 'undefined' 
  ? fetch 
  : (url: string, options?: any) => {
      // フォールバック: エラーを投げる
      throw new Error('fetch is not available in this environment')
    }

// Googlebot UAを使用してジオブロックを回避
const USER_AGENT = 'Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)'
// 通常のUA（必要に応じて切り替え）
const NORMAL_USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'

// レート制限管理
const RATE_LIMIT = {
  maxRequests: 60,
  windowMs: 60000
}

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
export async function completeHybridScrape(
  genre: string,
  term: '24h' | 'hour',
  tag?: string
): Promise<{
  items: Partial<RankingItem>[]
  popularTags?: string[]
}> {
  try {
    // 例のソレジャンルは専用処理（d2um7mc4はnvAPIで404のため）
    if (genre === 'd2um7mc4') {
      return await scrapeReiSoreRankingWithSnapshotAPI(term)
    }
    
    // r18ジャンルはnvAPIのみを使用（HTMLのmeta tagが間違ったデータを返すため）
    if (genre === 'r18') {
      const nvapiData = await fetchFromNvapi(genre, term, tag)
      return {
        items: nvapiData.items,
        popularTags: nvapiData.popularTags
      }
    }
    
    // Step 1: nvAPIから基本データとメタデータを取得
    const nvapiData = await fetchFromNvapi(genre, term, tag)
    
    // Step 2: タグ付きランキングの場合
    if (tag) {
      // nvAPIがタグ付きランキングをサポートしていない場合のエラーハンドリング
      if (nvapiData.items.length === 0) {
        throw new Error('タグ付きランキングは現在サポートされていません')
      }
      return {
        items: nvapiData.items,
        popularTags: nvapiData.popularTags
      }
    }
    
    // Step 3: ジャンル別ランキングの場合
    // HTMLのmeta tagは全ジャンルで総合ランキングを返すため、nvAPIのデータのみを使用
    if (genre !== 'all') {
      // 投稿者情報を補完
      const finalItems = await enrichAuthorInfo(nvapiData.items)
      return {
        items: finalItems,
        popularTags: nvapiData.popularTags
      }
    }
    
    // Step 4: 総合ランキングの場合のみHTMLスクレイピングでセンシティブ動画を取得
    const htmlData = await scrapeFromHTML(genre, term)
    
    // Step 5: データをマージ（総合ランキングのみ）
    // 重要: nvAPIはセンシティブ動画を除外するため、HTMLのデータを基準にする
    // HTMLにある動画はすべて保持し、nvAPIのリッチなデータで補完する
    const mergedItems = await mergeAllData(
      htmlData.items,
      nvapiData.items,
      nvapiData.itemsMap
    )
    
    // Step 6: 不足している投稿者情報を個別に取得
    const finalItems = await enrichAuthorInfo(mergedItems)
    
    return {
      items: finalItems,
      popularTags: nvapiData.popularTags || htmlData.popularTags
    }
    
  } catch (error) {
    throw new Error(`Complete hybrid scraping failed: ${error}`)
  }
}

// nvAPIからデータ取得
async function fetchFromNvapi(
  genre: string,
  term: string,
  tag?: string
): Promise<{
  items: Partial<RankingItem>[]
  itemsMap: Map<string, Partial<RankingItem>>
  popularTags?: string[]
}> {
  await checkRateLimit()
  
  const baseUrl = 'https://nvapi.nicovideo.jp/v1/ranking/genre'
  const url = tag 
    ? `${baseUrl}/${genre}?term=${term}&tag=${encodeURIComponent(tag)}`
    : `${baseUrl}/${genre}?term=${term}`
  
  const response = await fetchImpl(url, {
    headers: {
      'User-Agent': NORMAL_USER_AGENT, // nvAPIは通常のUAを使用
      'Accept': 'application/json',
      'X-Frontend-Id': '6',
      'X-Frontend-Version': '0',
      'Referer': 'https://www.nicovideo.jp/',
    }
  })
  
  if (!response.ok) {
    throw new Error(`nvAPI request failed: ${response.status}`)
  }
  
  const data = await response.json()
  
  if (data.meta?.status !== 200 || !data.data?.items) {
    throw new Error('Invalid nvAPI response')
  }
  
  const items = data.data.items.slice(0, 200).map((item: any, index: number) => ({
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
  
  // アイテムをMapに変換（高速検索用）
  const itemsMap = new Map<string, Partial<RankingItem>>(
    items.map((item: any) => [item.id, item])
  )
  
  // 人気タグを取得
  let popularTags: string[] = []
  if (genre !== 'all' && !tag) {
    popularTags = await fetchPopularTags(genre)
  }
  
  return { items, itemsMap, popularTags }
}

// HTMLスクレイピング
async function scrapeFromHTML(
  genre: string,
  term: string
): Promise<{
  items: Partial<RankingItem>[]
  popularTags?: string[]
}> {
  const url = `https://www.nicovideo.jp/ranking/genre/${genre}?term=${term}`
  
  const response = await fetchImpl(url, {
    headers: {
      'User-Agent': USER_AGENT, // Googlebot UAでジオブロック回避
      'Accept': 'text/html,application/xhtml+xml',
      'Accept-Language': 'ja,en;q=0.9',
      'Cookie': 'sensitive_material_status=accept' // センシティブコンテンツ表示設定
    }
  })
  
  if (!response.ok) {
    throw new Error(`HTML fetch failed: ${response.status}`)
  }
  
  const html = await response.text()
  
  // Check for meta tag with server-response (new format used by all genres)
  // Note: Meta tag data excludes sensitive videos, so we should not use it for 'all' genre
  const metaMatch = html.match(/<meta name="server-response" content="([^"]+)"/)
  if (metaMatch && genre !== 'all') {
    return await parseRankingFromMeta(html, genre)
  }
  
  // Fallback to traditional HTML parsing (kept for backward compatibility)
  const items: Partial<RankingItem>[] = []
  const videoIds: string[] = []
  
  // data-video-id属性から抽出（最も確実）
  const dataIdPattern = /data-video-id="((?:sm|nm|so)\d+)"/g
  let match
  while ((match = dataIdPattern.exec(html)) !== null) {
    if (match[1] && !videoIds.includes(match[1])) {
      videoIds.push(match[1])
    }
  }
  
  // フォールバック: リンクから抽出
  if (videoIds.length === 0) {
    const linkPattern = /<a[^>]+href="\/watch\/((?:sm|nm|so)\d+)"[^>]*>/g
    while ((match = linkPattern.exec(html)) !== null) {
      if (match[1] && !videoIds.includes(match[1])) {
        videoIds.push(match[1])
      }
    }
  }
  
  // 各動画の基本情報を抽出
  videoIds.forEach((videoId, index) => {
    const item: Partial<RankingItem> = {
      rank: index + 1,
      id: videoId
    }
    
    // 動画を含むブロックを探す
    const blockPattern = new RegExp(
      `(?:data-video-id="${videoId}"|href="/watch/${videoId}")[\\s\\S]*?(?:</article>|</li>|</div[^>]*>)`,
      'gi'
    )
    const blockMatch = html.match(blockPattern)
    
    if (blockMatch && blockMatch[0]) {
      const block = blockMatch[0]
      
      // タイトル
      const titlePatterns = [
        /data-title="([^"]+)"/,
        /title="([^"]+)"/,
        /alt="([^"]+)"/
      ]
      for (const pattern of titlePatterns) {
        const titleMatch = block.match(pattern)
        if (titleMatch && titleMatch[1]) {
          item.title = decodeHTMLEntities(titleMatch[1])
            .replace(/^第\d+位[：:]/, '').trim()
          break
        }
      }
      
      // サムネイル
      const thumbPatterns = [
        /data-original="(https?:\/\/[^"]+)"/,
        /data-src="(https?:\/\/[^"]+)"/,
        /src="(https?:\/\/[^"]+\.jpg[^"]*)"/
      ]
      for (const pattern of thumbPatterns) {
        const thumbMatch = block.match(pattern)
        if (thumbMatch) {
          item.thumbURL = thumbMatch[1]
          break
        }
      }
      
      // 再生数（より広い範囲で検索）
      const viewAreaStart = Math.max(0, html.indexOf(videoId) - 1000)
      const viewAreaEnd = Math.min(html.length, html.indexOf(videoId) + 2000)
      const viewArea = html.substring(viewAreaStart, viewAreaEnd)
      
      const viewPatterns = [
        />([\d,]+)\s*再生</,
        /<span[^>]*>([\d,]+)<\/span>[^<]*再生/,
        /再生数[:：]?\s*([\d,]+)/
      ]
      for (const pattern of viewPatterns) {
        const viewMatch = viewArea.match(pattern)
        if (viewMatch && viewMatch[1]) {
          item.views = parseInt(viewMatch[1].replace(/,/g, ''), 10)
          break
        }
      }
    }
    
    items.push(item)
  })
  
  // 人気タグを抽出
  const popularTags = extractPopularTagsFromHTML(html)
  
  return {
    items: items.filter(item => item.id),
    popularTags
  }
}

// データをマージ
async function mergeAllData(
  htmlItems: Partial<RankingItem>[],
  nvapiItems: Partial<RankingItem>[],
  nvapiMap: Map<string, Partial<RankingItem>>
): Promise<Partial<RankingItem>[]> {
  const mergedItems: Partial<RankingItem>[] = []
  const missingVideoIds: string[] = []
  
  // HTMLの順序でマージ
  for (const htmlItem of htmlItems) {
    const nvapiItem = htmlItem.id ? nvapiMap.get(htmlItem.id) : undefined
    
    if (nvapiItem) {
      // nvAPIのリッチなデータを使用、順位はHTMLから
      mergedItems.push({
        ...nvapiItem,
        rank: htmlItem.rank
      })
    } else {
      // nvAPIにない動画（センシティブ）
      mergedItems.push(htmlItem)
      if (htmlItem.id) {
        missingVideoIds.push(htmlItem.id)
      }
    }
  }
  
  // 不足している動画のメタデータをSnapshot APIから取得
  if (missingVideoIds.length > 0) {
    const snapshotData = await fetchFromSnapshot(missingVideoIds)
    
    mergedItems.forEach((item, index) => {
      if (item.id && missingVideoIds.includes(item.id)) {
        const snapshot = snapshotData.get(item.id)
        if (snapshot) {
          mergedItems[index] = {
            ...item,
            ...snapshot,
            rank: item.rank // 順位は保持
          }
        }
      }
    })
  }
  
  return mergedItems
}

// Snapshot APIからメタデータ取得
async function fetchFromSnapshot(
  videoIds: string[]
): Promise<Map<string, Partial<RankingItem>>> {
  const metadata = new Map<string, Partial<RankingItem>>()
  const batchSize = 50
  
  for (let i = 0; i < videoIds.length; i += batchSize) {
    const batch = videoIds.slice(i, i + batchSize)
    const query = batch.map(id => `contentId:${id}`).join(' OR ')
    
    const params = new URLSearchParams({
      q: query,
      targets: 'contentId',
      fields: 'contentId,title,viewCounter,commentCounter,mylistCounter,likeCounter,thumbnailUrl,userId,channelId,startTime,tags',
      _limit: String(batch.length),
      _context: 'nicorankingapp'
    })
    
    try {
      const response = await fetchImpl(
        `https://api.nicovideo.jp/api/v2/snapshot/video/contents/search?${params}`,
        {
          headers: {
            'User-Agent': USER_AGENT,
            'Accept': 'application/json'
          }
        }
      )
      
      if (response.ok) {
        const data = await response.json()
        
        if (data.data && Array.isArray(data.data)) {
          data.data.forEach((item: any) => {
            metadata.set(item.contentId, {
              title: item.title,
              thumbURL: item.thumbnailUrl?.player || item.thumbnailUrl?.large || item.thumbnailUrl?.middle,
              views: item.viewCounter || 0,
              comments: item.commentCounter,
              mylists: item.mylistCounter,
              likes: item.likeCounter,
              registeredAt: item.startTime,
              tags: item.tags ? item.tags.split(' ') : [],
              authorId: item.userId || item.channelId
            })
          })
        }
      }
    } catch (error) {
      // エラーは無視
    }
    
    if (i + batchSize < videoIds.length) {
      await new Promise(resolve => setTimeout(resolve, 100))
    }
  }
  
  return metadata
}

// 投稿者情報を補完
async function enrichAuthorInfo(
  items: Partial<RankingItem>[]
): Promise<Partial<RankingItem>[]> {
  const itemsNeedingAuthor = items.filter(item => 
    item.authorId && (!item.authorName || !item.authorIcon)
  )
  
  if (itemsNeedingAuthor.length === 0) {
    return items
  }
  
  // 投稿者IDごとにグループ化
  const authorGroups = new Map<string, string[]>()
  itemsNeedingAuthor.forEach(item => {
    if (item.authorId) {
      if (!authorGroups.has(item.authorId)) {
        authorGroups.set(item.authorId, [])
      }
      authorGroups.get(item.authorId)!.push(item.id!)
    }
  })
  
  // 各投稿者の情報を取得
  const authorInfoMap = new Map<string, { name?: string, icon?: string }>()
  
  for (const [authorId, videoIds] of authorGroups) {
    // 最初の動画IDを使って投稿者情報を取得
    const videoId = videoIds[0]
    
    try {
      await checkRateLimit()
      const response = await fetchImpl(
        `https://nvapi.nicovideo.jp/v1/video/${videoId}`,
        {
          headers: {
            'User-Agent': USER_AGENT,
            'Accept': 'application/json',
            'X-Frontend-Id': '6',
            'X-Frontend-Version': '0',
            'Referer': `https://www.nicovideo.jp/watch/${videoId}`
          }
        }
      )
      
      if (response.ok) {
        const data = await response.json()
        
        if (data.data?.owner) {
          authorInfoMap.set(authorId, {
            name: data.data.owner.name,
            icon: data.data.owner.iconUrl
          })
        }
      }
    } catch (error) {
      // エラーは無視
    }
  }
  
  // 投稿者情報を適用
  const enrichedItems = items.map(item => {
    if (item.authorId && authorInfoMap.has(item.authorId)) {
      const authorInfo = authorInfoMap.get(item.authorId)!
      return {
        ...item,
        authorName: item.authorName || authorInfo.name,
        authorIcon: item.authorIcon || authorInfo.icon
      }
    }
    return item
  })
  
  return enrichedItems
}

// 人気タグを取得
export async function fetchPopularTags(genre: string): Promise<string[]> {
  await checkRateLimit()
  
  try {
    const response = await fetchImpl(
      `https://nvapi.nicovideo.jp/v1/genres/${genre}/popular-tags`,
      {
        headers: {
          'User-Agent': USER_AGENT,
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
  
  // パターン1: PopularTagクラス
  const tagPattern1 = /<a[^>]+class="[^"]*PopularTag[^"]*"[^>]*>([^<]+)</g
  let match
  
  while ((match = tagPattern1.exec(html)) !== null) {
    if (match[1]) {
      const tag = match[1].trim()
      if (tag && !tags.includes(tag) && !tag.includes('すべて')) {
        tags.push(tag)
      }
    }
  }
  
  // パターン2: tag-listクラス内のリンク
  if (tags.length === 0) {
    const tagListPattern = /<[^>]+class="[^"]*tag[^"]*"[^>]*>[\s\S]*?<\/[^>]+>/gi
    const tagListMatches = html.match(tagListPattern)
    
    if (tagListMatches) {
      tagListMatches.forEach(block => {
        const linkPattern = /<a[^>]*>([^<]+)</g
        let linkMatch
        while ((linkMatch = linkPattern.exec(block)) !== null) {
          if (linkMatch[1]) {
            const tag = linkMatch[1].trim()
            if (tag && !tags.includes(tag) && !tag.includes('すべて')) {
              tags.push(tag)
            }
          }
        }
      })
    }
  }
  
  return tags.slice(0, 20)
}

// HTMLエンティティをデコード
function decodeHTMLEntities(text: string): string {
  return text
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, ' ')
    .replace(/&#(\d+);/g, (match, dec) => String.fromCharCode(dec))
    .replace(/&#x([0-9A-F]+);/gi, (match, hex) => String.fromCharCode(parseInt(hex, 16)))
}

// Parse ranking data from meta tag (new format used by all genres)
async function parseRankingFromMeta(html: string, genre: string): Promise<{
  items: Partial<RankingItem>[]
  popularTags?: string[]
}> {
  // Extract data from meta tag
  const metaMatch = html.match(/<meta name="server-response" content="([^"]+)"/)
  if (!metaMatch) {
    return { items: [], popularTags: [] }
  }
  
  const encodedData = metaMatch[1]!
  const decodedData = encodedData
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, '&')
  
  try {
    const jsonData = JSON.parse(decodedData)
    const rankingData = jsonData?.data?.response?.$getTeibanRanking?.data?.items
    
    if (!rankingData || !Array.isArray(rankingData)) {
      return { items: [], popularTags: [] }
    }
    
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
      tags: [] // Tags not provided in this format
    }))
    
    // Extract popular tags
    const popularTags = extractPopularTagsFromHTML(html)
    
    return { items, popularTags }
  } catch (error) {
    throw new Error(`Failed to parse ranking meta data: ${error}`)
  }
}

// 例のソレジャンル専用処理 - 実際のランキングデータを取得
async function scrapeReiSoreRankingWithSnapshotAPI(term: '24h' | 'hour'): Promise<{
  items: Partial<RankingItem>[]
  popularTags?: string[]
}> {
  try {
    // Import the rei-sore-api function
    const { fetchReiSoreRanking } = await import('./rei-sore-api')
    
    // Map term to the rei-sore-api format
    const apiTerm = term === '24h' ? 'day' : 'hour'
    
    const result = await fetchReiSoreRanking({
      term: apiTerm,
      limit: 200
    })
    
    if (result.data && result.data.length > 0) {
      return {
        items: result.data,
        popularTags: ['例のソレ', 'その他', 'エンターテイメント', 'R-18', '真夏の夜の淫夢']
      }
    }
    
    // Fallback to empty data if all approaches fail
    return {
      items: [],
      popularTags: ['例のソレ', 'その他']
    }
  } catch (error) {
    // Return empty data instead of throwing
    return {
      items: [],
      popularTags: ['例のソレ', 'その他']
    }
  }
}