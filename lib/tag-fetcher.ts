/**
 * ニコニコ動画のタグ情報を取得するためのモジュール
 * 複数の方法を試して、最も効率的な方法でタグを取得する
 */

import type { RankingItem } from '@/types/ranking'

interface TagInfo {
  name: string
  isLocked: boolean
}

/**
 * actionTrackIdを生成（24文字: 英数字10文字 + _ + 数字13文字）
 */
function generateActionTrackId(): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789'
  let result = ''
  
  // 最初の10文字: 英数字
  for (let i = 0; i < 10; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length))
  }
  
  // アンダースコア
  result += '_'
  
  // 最後の13文字: 数字
  for (let i = 0; i < 13; i++) {
    result += Math.floor(Math.random() * 10).toString()
  }
  
  return result
}

/**
 * watch/v3_guest APIを使用してタグを取得
 * @param videoId 動画ID
 * @returns タグの配列、取得できない場合はnull
 */
export async function fetchTagsFromWatchAPI(videoId: string): Promise<string[] | null> {
  try {
    const actionTrackId = generateActionTrackId()
    const response = await fetch(
      `https://www.nicovideo.jp/api/watch/v3_guest/${videoId}?_frontendId=6&_frontendVersion=0&actionTrackId=${actionTrackId}`,
      {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
          'X-Frontend-Id': '6',
          'X-Frontend-Version': '0'
        }
      }
    )
    
    if (!response.ok) {
      console.warn(`Watch API returned ${response.status} for ${videoId}`)
      return null
    }
    
    const data = await response.json()
    // APIレスポンスの構造を確認
    if (data.data?.tag?.items) {
      return data.data.tag.items.map((tag: any) => tag.name).filter(Boolean)
    }
    
    return null
  } catch (error) {
    console.error(`Failed to fetch tags from Watch API for ${videoId}:`, error)
    return null
  }
}

/**
 * watch/v3_guest APIを使用して固定タグのみを取得
 * @param videoId 動画ID
 * @returns 固定タグの配列、取得できない場合はnull
 */
export async function fetchFixedTagsFromWatchAPI(videoId: string): Promise<string[] | null> {
  try {
    const actionTrackId = generateActionTrackId()
    const response = await fetch(
      `https://www.nicovideo.jp/api/watch/v3_guest/${videoId}?_frontendId=6&_frontendVersion=0&actionTrackId=${actionTrackId}`,
      {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
          'X-Frontend-Id': '6',
          'X-Frontend-Version': '0'
        }
      }
    )
    
    if (!response.ok) {
      console.warn(`Watch API returned ${response.status} for ${videoId}`)
      return null
    }
    
    const data = await response.json()
    // APIレスポンスの構造を確認
    if (data.data?.tag?.items) {
      // isLocked === true の固定タグのみをフィルタリング
      const fixedTags = data.data.tag.items
        .filter((tag: any) => tag.isLocked === true)
        .map((tag: any) => tag.name)
        .filter(Boolean)
      
      return fixedTags.length > 0 ? fixedTags : []
    }
    
    return null
  } catch (error) {
    console.error(`Failed to fetch fixed tags from Watch API for ${videoId}:`, error)
    return null
  }
}

/**
 * 動画ページのHTMLからタグを抽出
 * @param videoId 動画ID
 * @returns タグの配列、取得できない場合はnull
 */
export async function fetchTagsFromHTML(videoId: string): Promise<string[] | null> {
  try {
    const response = await fetch(`https://www.nicovideo.jp/watch/${videoId}`, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
      }
    })
    
    if (!response.ok) {
      console.warn(`HTML fetch returned ${response.status} for ${videoId}`)
      return null
    }
    
    const html = await response.text()
    
    // __INITIAL_DATA__ からタグ情報を抽出
    const dataMatch = html.match(/<script[^>]*>window\.__INITIAL_DATA__\s*=\s*({[^<]+})<\/script>/)
    if (dataMatch) {
      try {
        const data = JSON.parse(dataMatch[1])
        if (data.tag?.items && Array.isArray(data.tag.items)) {
          // ロックされたタグ（公式タグ）のみを取得
          return data.tag.items
            .filter((tag: TagInfo) => tag.isLocked)
            .map((tag: TagInfo) => tag.name)
        }
      } catch (e) {
        console.error(`Failed to parse __INITIAL_DATA__ for ${videoId}:`, e)
      }
    }
    
    return null
  } catch (error) {
    console.error(`Failed to fetch tags from HTML for ${videoId}:`, error)
    return null
  }
}

/**
 * 複数のランキングアイテムに対してタグを一括取得
 * @param items ランキングアイテムの配列
 * @param method 取得方法（'watch' | 'html' | 'auto'）
 * @returns タグ情報が追加されたランキングアイテムの配列
 */
export async function enrichRankingItemsWithTags(
  items: RankingItem[], 
  method: 'watch' | 'html' | 'auto' = 'auto'
): Promise<RankingItem[]> {
  // console.log(`Enriching ${items.length} items with tags using method: ${method}`)
  
  const enrichedItems = await Promise.all(
    items.map(async (item, index) => {
      let tags: string[] | null = null
      
      // 既にタグがある場合はスキップ
      if (item.tags && item.tags.length > 0) {
        return item
      }
      
      // レート制限を考慮して待機（2番目以降のアイテム）
      if (index > 0) {
        await new Promise(resolve => setTimeout(resolve, 300))
      }
      
      if (method === 'watch' || method === 'auto') {
        tags = await fetchTagsFromWatchAPI(item.id)
      }
      
      // Watch APIで取得できなかった場合、HTMLから取得を試みる
      if (!tags && (method === 'html' || method === 'auto')) {
        // レート制限を考慮して少し待機
        await new Promise(resolve => setTimeout(resolve, 200))
        tags = await fetchTagsFromHTML(item.id)
      }
      
      return {
        ...item,
        tags: tags || []
      }
    })
  )
  
  // タグ取得統計をログ出力
  const itemsWithTags = enrichedItems.filter(item => item.tags && item.tags.length > 0)
  // console.log(`Successfully fetched tags for ${itemsWithTags.length}/${items.length} items`)
  
  return enrichedItems
}

/**
 * ランキングアイテムからタグを集計して人気タグを生成
 * @param items タグ情報を含むランキングアイテムの配列
 * @param limit 返すタグの最大数
 * @returns タグとその出現回数のレコード
 */
export function aggregateTags(items: RankingItem[], limit: number = 30): Record<string, number> {
  const tagCounts: Record<string, number> = {}
  
  items.forEach(item => {
    if (item.tags) {
      item.tags.forEach(tag => {
        tagCounts[tag] = (tagCounts[tag] || 0) + 1
      })
    }
  })
  
  // 出現回数でソートして上位のタグのみを返す
  const sortedTags = Object.entries(tagCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
  
  return Object.fromEntries(sortedTags)
}

/**
 * 複数のランキングアイテムに対して固定タグを一括取得
 * @param items ランキングアイテムの配列
 * @param method 取得方法（'watch' | 'html' | 'auto'）
 * @returns 固定タグ情報が追加されたランキングアイテムの配列
 */
export async function enrichRankingItemsWithFixedTags(
  items: RankingItem[], 
  method: 'watch' | 'html' | 'auto' = 'auto'
): Promise<RankingItem[]> {
  // console.log(`Enriching ${items.length} items with fixed tags using method: ${method}`)
  
  const enrichedItems = await Promise.all(
    items.map(async (item, index) => {
      let tags: string[] | null = null
      
      // 既にタグがある場合はスキップ
      if (item.tags && item.tags.length > 0) {
        return item
      }
      
      // レート制限を考慮して待機（2番目以降のアイテム）
      if (index > 0) {
        await new Promise(resolve => setTimeout(resolve, 300))
      }
      
      // Watch APIから固定タグを取得
      if (method === 'watch' || method === 'auto') {
        tags = await fetchFixedTagsFromWatchAPI(item.id)
      }
      
      // Watch APIで取得できなかった場合、HTMLスクレイピングを試みる
      if (!tags && (method === 'html' || method === 'auto')) {
        // console.log(`Falling back to HTML scraping for ${item.id}`)
        // レート制限を考慮して少し待機
        await new Promise(resolve => setTimeout(resolve, 200))
        tags = await fetchTagsFromHTML(item.id)
      }
      
      return {
        ...item,
        tags: tags || []
      }
    })
  )
  
  // タグ取得統計をログ出力
  const itemsWithTags = enrichedItems.filter(item => item.tags && item.tags.length > 0)
  // console.log(`Successfully fetched fixed tags for ${itemsWithTags.length}/${items.length} items`)
  
  return enrichedItems
}