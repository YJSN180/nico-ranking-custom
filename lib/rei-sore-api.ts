import { RankingItem } from '@/types/ranking'

const USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'

export interface ReiSoreOptions {
  term?: 'hour' | 'day' | 'week' | 'month' | 'all'
  limit?: number
}

/**
 * Attempts to fetch 例のソレ genre data using multiple approaches
 */
export async function fetchReiSoreRanking(options: ReiSoreOptions = {}): Promise<{
  data: RankingItem[]
  approach: string
}> {
  const { term = 'day', limit = 100 } = options

  // Try multiple approaches in order - Direct genre ID first as it provides actual ranking data
  const approaches = [
    { fn: () => fetchViaDirectGenreId(term, limit), name: 'direct-genre' },
    { fn: () => fetchViaSnapshotAPI(term, limit), name: 'snapshot-api-v2' },
    { fn: () => fetchViaTagSearch(term, limit), name: 'tag-search' },
    { fn: () => fetchViaGenre501(term, limit), name: 'genre-501' },
    { fn: () => fetchViaSearchAPI(term, limit), name: 'search-api' }
  ]

  for (const { fn, name } of approaches) {
    try {
      const result = await fn()
      if (result && result.length > 0) {
        return { data: result, approach: name }
      }
    } catch (error) {
      // Silently continue to next approach
      continue
    }
  }

  throw new Error('All approaches to fetch 例のソレ data failed')
}

/**
 * Approach 0: Snapshot API v2 (most reliable and complete)
 */
async function fetchViaSnapshotAPI(term: string, limit: number): Promise<RankingItem[]> {
  // For Snapshot API, we need to filter by date range for term-based results
  const now = new Date()
  const startTime = new Date()
  
  switch (term) {
    case 'hour':
      startTime.setHours(now.getHours() - 1)
      break
    case 'day':
      startTime.setDate(now.getDate() - 1)
      break
    case 'week':
      startTime.setDate(now.getDate() - 7)
      break
    case 'month':
      startTime.setMonth(now.getMonth() - 1)
      break
    case 'all':
      // No date filter for all time
      startTime.setFullYear(2000) // Very old date
      break
  }
  
  const params: Record<string, string> = {
    q: '例のソレ',
    targets: 'tagsExact',
    fields: 'contentId,title,viewCounter,thumbnailUrl',
    _sort: '-viewCounter',
    _limit: limit.toString()
  }
  
  // Note: Date filtering is not working with Snapshot API v2 for tag searches
  // So we'll get all results and rely on viewCounter sorting for relevance
  
  const queryString = new URLSearchParams(params).toString()
  const url = `https://snapshot.search.nicovideo.jp/api/v2/snapshot/video/contents/search?${queryString}`
  
  const response = await fetch(url, {
    headers: {
      'User-Agent': 'nico-ranking-app/1.0' // Required header, must be 40 chars or less
    }
  })
  
  if (!response.ok) {
    throw new Error(`Snapshot API failed: ${response.status}`)
  }
  
  const data = await response.json()
  
  if (!data.data || !Array.isArray(data.data)) {
    throw new Error('Invalid response format')
  }
  
  return data.data.map((item: any, index: number) => ({
    rank: index + 1,
    id: item.contentId,
    title: item.title,
    thumbURL: item.thumbnailUrl || '',
    views: item.viewCounter || 0
  }))
}

/**
 * Approach 1: Tag-based search (fallback)
 */
async function fetchViaTagSearch(term: string, limit: number): Promise<RankingItem[]> {
  const termMap = {
    'hour': '1hour',
    'day': '24h',
    'week': '1week',
    'month': '1month',
    'all': 'all'
  }

  const url = `https://www.nicovideo.jp/tag/例のソレ?sort=f&order=d&term=${termMap[term as keyof typeof termMap] || '24h'}`

  const response = await fetch(url, {
    headers: {
      'User-Agent': USER_AGENT,
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
      'Accept-Language': 'ja-JP,ja;q=0.9,en;q=0.8',
      'Cookie': 'nicosid=1735246917.1208142647; _ga=GA1.1.939222017.1735246919'
    }
  })

  if (!response.ok) {
    throw new Error(`Tag search failed: ${response.status}`)
  }

  const html = await response.text()
  return parseVideoListFromHTML(html, limit)
}

/**
 * Approach 2: Try genre ID 501
 */
async function fetchViaGenre501(term: string, limit: number): Promise<RankingItem[]> {
  const url = `https://www.nicovideo.jp/ranking/genre/501?term=${term}&rss=2.0&lang=ja-jp`

  const response = await fetch(url, {
    headers: {
      'User-Agent': USER_AGENT,
      'Accept': 'application/rss+xml, application/xml, text/xml',
      'Cookie': 'nicosid=1735246917.1208142647'
    }
  })

  if (!response.ok) {
    throw new Error(`Genre 501 failed: ${response.status}`)
  }

  const xml = await response.text()
  return parseRSSFeed(xml, limit)
}

/**
 * Approach 3: Direct genre ID d2um7mc4
 */
async function fetchViaDirectGenreId(term: string, limit: number): Promise<RankingItem[]> {
  const termMap: Record<string, string> = {
    'hour': 'hour',
    'day': '24h',
    'week': 'week',
    'month': 'month',
    'all': 'all'
  }

  const url = `https://www.nicovideo.jp/ranking/genre/d2um7mc4?term=${termMap[term] || '24h'}`

  const response = await fetch(url, {
    headers: {
      'User-Agent': USER_AGENT,
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
      'Cookie': 'nicosid=1725186023.265332462; user_session=user_session_134077750_2da2315c5d1f49d1246ce0a83cc9519e18ab79a9bab91f27463f5dca8d10641a; sensitive_material_status=accept'
    }
  })

  if (!response.ok) {
    throw new Error(`Direct genre failed: ${response.status}`)
  }

  const html = await response.text()
  
  // First, try to extract embedded JSON data from meta tag
  const metaMatch = html.match(/<meta name="server-response" content="([^"]+)"/)
  if (metaMatch) {
    const encodedData = metaMatch[1]!
    const decodedData = encodedData
      .replace(/&quot;/g, '"')
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&#039;/g, "'")
      .replace(/\\\\/g, '/')
    
    try {
      const jsonData = JSON.parse(decodedData)
      const rankingData = jsonData?.data?.response?.$getTeibanRanking?.data?.items
      
      if (Array.isArray(rankingData)) {
        const items: RankingItem[] = rankingData.slice(0, limit).map((item: any, index: number) => ({
          rank: index + 1,
          id: item.id,
          title: item.title,
          thumbURL: item.thumbnail?.url || item.thumbnail?.middleUrl || '',
          views: item.count?.view || 0,
          author: {
            name: item.owner?.name || '',
            id: item.owner?.id || '',
            iconURL: item.owner?.iconUrl || ''
          }
        }))
        
        return items
      }
    } catch (parseError) {
      // Failed to parse embedded JSON, will fallback to HTML parsing
    }
  }
  
  // Fallback to HTML parsing if JSON extraction fails
  return parseVideoListFromHTML(html, limit)
}

/**
 * Approach 4: Search API with genre filter
 */
async function fetchViaSearchAPI(term: string, limit: number): Promise<RankingItem[]> {
  const sortMap = {
    'hour': 'h',
    'day': 'h',
    'week': 'f',
    'month': 'f',
    'all': 'f'
  }

  const url = `https://www.nicovideo.jp/api/search/video?q=例のソレ&targets=tags&fields=contentId,title,viewCounter,thumbnailUrl&_sort=-viewCounter&_limit=${limit}`

  const response = await fetch(url, {
    headers: {
      'User-Agent': USER_AGENT,
      'Accept': 'application/json',
      'Cookie': 'nicosid=1735246917.1208142647'
    }
  })

  if (!response.ok) {
    throw new Error(`Search API failed: ${response.status}`)
  }

  const data = await response.json()
  return parseSearchAPIResponse(data)
}

/**
 * Parse HTML content to extract video list
 */
function parseVideoListFromHTML(html: string, limit: number): RankingItem[] {
  const items: RankingItem[] = []

  // Look for video items in various formats
  const videoPatterns = [
    // Pattern 1: data-video-id attribute
    /<[^>]+data-video-id="(sm\d+|so\d+)"[^>]*>[\s\S]*?<img[^>]+src="([^"]+)"[^>]*>[\s\S]*?<a[^>]+title="([^"]+)"[\s\S]*?<span[^>]+class="[^"]*videoLength[^"]*"[^>]*>([^<]+)</g,
    // Pattern 2: Watch page links
    /<a[^>]+href="\/watch\/(sm\d+|so\d+)"[^>]*>[\s\S]*?<img[^>]+src="([^"]+)"[^>]*alt="([^"]+)"[\s\S]*?<span[^>]+>再生数：([\d,]+)</g,
    // Pattern 3: Ranking items
    /<div[^>]+class="[^"]*RankingMainVideo[^"]*"[^>]*>[\s\S]*?<a[^>]+href="\/watch\/(sm\d+|so\d+)"[\s\S]*?<img[^>]+src="([^"]+)"[\s\S]*?<p[^>]+title="([^"]+)"[\s\S]*?<span[^>]*>([\d,]+)[\s\S]*?再生/g
  ]

  let rank = 1

  for (const pattern of videoPatterns) {
    let match
    while ((match = pattern.exec(html)) !== null && items.length < limit) {
      const [, id, thumbURL, title, viewsStr] = match
      
      // Parse view count
      let views = 0
      if (viewsStr) {
        views = parseInt(viewsStr.replace(/,/g, '').replace(/再生/g, ''), 10) || 0
      }

      // Skip if already added
      if (items.some(item => item.id === id)) continue

      items.push({
        rank: rank++,
        id: id || '',
        title: title ? decodeHTMLEntities(title) : '',
        thumbURL: thumbURL ? (thumbURL.startsWith('http') ? thumbURL : `https:${thumbURL}`) : '',
        views
      })

      if (items.length >= limit) break
    }
  }

  // If no items found with patterns, try a more general approach
  if (items.length === 0) {
    const videoIdMatches = html.matchAll(/\/watch\/(sm\d+|so\d+)/g)
    const titleMatches = html.matchAll(/title="([^"]+)"/g)
    const thumbMatches = html.matchAll(/src="(https?:\/\/[^"]+\.jpg)"/g)

    const ids = Array.from(videoIdMatches).map(m => m[1])
    const titles = Array.from(titleMatches).map(m => m[1])
    const thumbs = Array.from(thumbMatches).map(m => m[1])

    for (let i = 0; i < Math.min(ids.length, titles.length, thumbs.length, limit); i++) {
      const id = ids[i]
      const title = titles[i]
      const thumbURL = thumbs[i]
      
      if (id && title && thumbURL) {
        items.push({
          rank: i + 1,
          id,
          title: decodeHTMLEntities(title),
          thumbURL,
          views: 0 // No view data in this approach
        })
      }
    }
  }

  return items
}

/**
 * Parse RSS feed
 */
function parseRSSFeed(xml: string, limit: number): RankingItem[] {
  const items: RankingItem[] = []

  // Simple RSS parsing
  const itemMatches = xml.matchAll(/<item>[\s\S]*?<\/item>/g)
  let rank = 1

  for (const itemMatch of itemMatches) {
    if (items.length >= limit) break

    const itemXml = itemMatch[0]
    
    const idMatch = itemXml.match(/<link>https?:\/\/www\.nicovideo\.jp\/watch\/(sm\d+|so\d+)<\/link>/)
    const titleMatch = itemXml.match(/<title>(.+?)<\/title>/)
    const thumbMatch = itemXml.match(/<media:thumbnail[^>]+url="([^"]+)"/)
    const viewMatch = itemXml.match(/<nicovideo:view_counter>(\d+)<\/nicovideo:view_counter>/)

    if (idMatch?.[1] && titleMatch?.[1]) {
      items.push({
        rank: rank++,
        id: idMatch[1],
        title: decodeHTMLEntities(titleMatch[1]),
        thumbURL: thumbMatch?.[1] || '',
        views: viewMatch?.[1] ? parseInt(viewMatch[1], 10) : 0
      })
    }
  }

  return items
}

/**
 * Parse search API response
 */
function parseSearchAPIResponse(data: any): RankingItem[] {
  if (!data?.data) return []

  return data.data.map((item: any, index: number) => ({
    rank: index + 1,
    id: item.contentId,
    title: item.title,
    thumbURL: item.thumbnailUrl,
    views: item.viewCounter || 0
  }))
}

/**
 * Decode HTML entities
 */
function decodeHTMLEntities(text: string): string {
  const entities: Record<string, string> = {
    '&amp;': '&',
    '&lt;': '<',
    '&gt;': '>',
    '&quot;': '"',
    '&#039;': "'",
    '&#x27;': "'",
    '&#x2F;': '/',
    '&#x60;': '`',
    '&#x3D;': '='
  }

  return text.replace(/&[#\w]+;/g, (entity) => entities[entity] || entity)
}