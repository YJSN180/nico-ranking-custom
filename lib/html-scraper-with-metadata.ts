// HTMLスクレイピング + Snapshot APIでメタデータ取得

import type { RankingItem } from '@/types/ranking'

const USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'

// HTMLからランキングを取得
export async function scrapeRankingWithMetadata(
  genre: string,
  term: '24h' | 'hour',
  tag?: string
): Promise<{
  items: Partial<RankingItem>[]
  popularTags?: string[]
}> {
  // Step 1: HTMLスクレイピングでランキング順位を取得
  const rankingData = await scrapeRankingHTML(genre, term, tag)
  
  // Step 2: Snapshot APIでメタデータを一括取得
  const videoIds = rankingData.items.map(item => item.id).filter(Boolean) as string[]
  const metadata = await fetchBatchMetadata(videoIds)
  
  // Step 3: データをマージ
  const items = rankingData.items.map(item => {
    const meta = metadata.get(item.id!)
    return {
      ...item,
      ...meta,
      rank: item.rank // ランキング順位は保持
    }
  })
  
  return {
    items,
    popularTags: rankingData.popularTags
  }
}

// HTMLスクレイピング部分
async function scrapeRankingHTML(
  genre: string,
  term: string,
  tag?: string
): Promise<{
  items: Partial<RankingItem>[]
  popularTags?: string[]
}> {
  let url = `https://www.nicovideo.jp/ranking/genre/${genre}?term=${term}`
  if (tag) {
    url += `&tag=${encodeURIComponent(tag)}`
  }
  
  const response = await fetch(url, {
    headers: {
      'User-Agent': USER_AGENT,
      'Accept': 'text/html,application/xhtml+xml',
      'Accept-Language': 'ja,en;q=0.9'
    }
  })
  
  if (!response.ok) {
    throw new Error(`Failed to fetch ranking: ${response.status}`)
  }
  
  const html = await response.text()
  const items: Partial<RankingItem>[] = []
  
  // ランキングアイテムを抽出
  // パターン1: data-video-id属性を持つ要素
  const dataVideoIdPattern = /data-video-id="((?:sm|nm|so)\d+)"/g
  const videoIdsFromData: string[] = []
  let match
  
  while ((match = dataVideoIdPattern.exec(html)) !== null) {
    if (!videoIdsFromData.includes(match[1])) {
      videoIdsFromData.push(match[1])
    }
  }
  
  // パターン2: リンクから抽出（フォールバック）
  if (videoIdsFromData.length === 0) {
    const linkPattern = /<a[^>]+href="\/watch\/((?:sm|nm|so)\d+)"/g
    while ((match = linkPattern.exec(html)) !== null) {
      if (!videoIdsFromData.includes(match[1])) {
        videoIdsFromData.push(match[1])
      }
    }
  }
  
  // 各動画の情報を抽出
  videoIdsFromData.forEach((videoId, index) => {
    // 動画IDを含むブロックを探す
    const blockPattern = new RegExp(
      `<[^>]+(?:data-video-id="${videoId}"|href="/watch/${videoId}")[^>]*>[\\s\\S]*?(?:</div>|</li>|</article>)`,
      'gi'
    )
    const blockMatches = html.match(blockPattern)
    
    if (blockMatches && blockMatches[0]) {
      const block = blockMatches[0]
      
      // タイトル抽出
      let title = ''
      const titlePatterns = [
        /data-title="([^"]+)"/,
        /title="([^"]+)"/,
        /alt="([^"]+)"/,
        /<h3[^>]*>([^<]+)<\/h3>/,
        /<h4[^>]*>([^<]+)<\/h4>/
      ]
      
      for (const pattern of titlePatterns) {
        const titleMatch = block.match(pattern)
        if (titleMatch && titleMatch[1]) {
          title = titleMatch[1]
          break
        }
      }
      
      // サムネイル抽出
      let thumbURL = ''
      const thumbPatterns = [
        /data-original="(https?:\/\/[^"]+)"/,
        /data-src="(https?:\/\/[^"]+)"/,
        /src="(https?:\/\/[^"]+\.jpg[^"]*)"/
      ]
      
      for (const pattern of thumbPatterns) {
        const thumbMatch = block.match(pattern)
        if (thumbMatch && thumbMatch[1]) {
          thumbURL = thumbMatch[1]
          break
        }
      }
      
      // 再生数抽出（より広い範囲で検索）
      let views = 0
      const extendedBlock = html.substring(
        Math.max(0, html.indexOf(videoId) - 500),
        Math.min(html.length, html.indexOf(videoId) + 1000)
      )
      
      const viewPatterns = [
        /<span[^>]*class="[^"]*VideoMetaCount[^"]*view[^"]*"[^>]*>([\\d,]+)</,
        /<span[^>]*>([\\d,]+)\s*再生</,
        />([\\d,]+)\s*再生</,
        /再生数[:：]?\s*([\\d,]+)/
      ]
      
      for (const pattern of viewPatterns) {
        const viewMatch = extendedBlock.match(pattern)
        if (viewMatch && viewMatch[1]) {
          views = parseInt(viewMatch[1].replace(/,/g, ''), 10)
          break
        }
      }
      
      // HTMLエンティティをデコード
      title = decodeHTMLEntities(title)
        .replace(/^第\d+位[：:]/, '')
        .trim()
      
      items.push({
        rank: index + 1,
        id: videoId,
        title,
        thumbURL,
        views
      })
    }
  })
  
  // 人気タグを抽出
  const popularTags = extractPopularTags(html)
  
  return {
    items: items.filter(item => item.id && item.title),
    popularTags
  }
}

// Snapshot APIでメタデータを一括取得
async function fetchBatchMetadata(
  videoIds: string[]
): Promise<Map<string, Partial<RankingItem>>> {
  const metadata = new Map<string, Partial<RankingItem>>()
  
  if (videoIds.length === 0) return metadata
  
  const baseUrl = 'https://api.nicovideo.jp/api/v2/snapshot/video/contents/search'
  const batchSize = 50 // 一度に50件まで
  
  for (let i = 0; i < videoIds.length; i += batchSize) {
    const batch = videoIds.slice(i, i + batchSize)
    const videoIdQuery = batch.map(id => `contentId:${id}`).join(' OR ')
    
    const params = new URLSearchParams({
      q: videoIdQuery,
      targets: 'contentId',
      fields: 'contentId,title,viewCounter,commentCounter,mylistCounter,likeCounter,thumbnailUrl,userId,channelId,startTime,tags',
      _limit: String(batch.length),
      _context: 'nicorankingapp'
    })
    
    try {
      const response = await fetch(`${baseUrl}?${params}`, {
        headers: {
          'User-Agent': USER_AGENT,
          'Accept': 'application/json'
        }
      })
      
      if (response.ok) {
        const data = await response.json()
        
        if (data.data && Array.isArray(data.data)) {
          data.data.forEach((item: any) => {
            metadata.set(item.contentId, {
              id: item.contentId,
              title: item.title,
              thumbURL: item.thumbnailUrl?.player || item.thumbnailUrl?.large || item.thumbnailUrl?.middle,
              views: item.viewCounter || 0,
              comments: item.commentCounter,
              mylists: item.mylistCounter,
              likes: item.likeCounter,
              registeredAt: item.startTime,
              tags: item.tags ? item.tags.split(' ') : [],
              // 投稿者情報（Snapshot APIでは限定的）
              authorId: item.userId || item.channelId
            })
          })
        }
      }
    } catch (error) {
      // エラーは無視して続行
    }
    
    // レート制限対策
    if (i + batchSize < videoIds.length) {
      await new Promise(resolve => setTimeout(resolve, 100))
    }
  }
  
  return metadata
}

// 人気タグを抽出
function extractPopularTags(html: string): string[] {
  const tags: string[] = []
  
  // パターン1: PopularTagクラス
  const tagPattern1 = /<a[^>]+class="[^"]*PopularTag[^"]*"[^>]*>([^<]+)</g
  let match
  
  while ((match = tagPattern1.exec(html)) !== null) {
    const tag = match[1].trim()
    if (tag && !tags.includes(tag)) {
      tags.push(tag)
    }
  }
  
  // パターン2: tag-listクラス
  if (tags.length === 0) {
    const tagPattern2 = /<div[^>]+class="[^"]*tag-list[^"]*"[^>]*>[\s\S]*?<\/div>/gi
    const tagListMatch = html.match(tagPattern2)
    
    if (tagListMatch) {
      const linkPattern = /<a[^>]+>([^<]+)</g
      while ((match = linkPattern.exec(tagListMatch[0])) !== null) {
        const tag = match[1].trim()
        if (tag && !tags.includes(tag) && !tag.includes('すべて')) {
          tags.push(tag)
        }
      }
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
}

// 人気タグを公式APIから取得（フォールバック）
export async function fetchPopularTagsFromAPI(genre: string): Promise<string[]> {
  if (genre === 'all') return []
  
  try {
    const response = await fetch(
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