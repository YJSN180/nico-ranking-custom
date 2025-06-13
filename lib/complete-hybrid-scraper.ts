// 完全なハイブリッドスクレイピング実装
// HTML + Snapshot API + タグAPIを組み合わせて全情報を取得

import type { RankingItem } from '@/types/ranking'
import type { RankingGenre } from '@/types/ranking-config'
import { GENRE_ID_MAP } from './genre-mapping'
import { enrichRankingItemsWithTags } from './html-tag-extractor'
import { filterRankingData } from './ng-filter'

// Googlebot UAを使用してジオブロックを回避
async function fetchWithGooglebot(url: string): Promise<string> {
  const response = await fetch(url, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)',
      'Accept': 'text/html,application/xhtml+xml',
      'Accept-Language': 'ja',
      'Cookie': 'sensitive_material_status=accept'
    }
  })
  
  if (!response.ok) {
    throw new Error(`Fetch failed: ${response.status}`)
  }
  
  return response.text()
}

// server-responseメタタグからJSONデータを抽出
export function extractServerResponseData(html: string): any {
  const metaMatch = html.match(/<meta name="server-response" content="([^"]+)"/)
  if (!metaMatch) {
    throw new Error('server-responseメタタグが見つかりません')
  }
  
  const encodedData = metaMatch[1]!
  const decodedData = encodedData
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&#39;/g, "'")
  
  return JSON.parse(decodedData)
}

// GENREマッピングは外部ファイルで管理
// GENRE_ID_MAPを使用してください

// HTMLから人気タグを抽出（タグ別ランキング用のリンクから）
export function extractPopularTagsFromHTML(html: string, genreId: string): string[] {
  const tags: string[] = []
  
  // パターン1: PopularTag内のリンクから抽出
  const tagLinkPattern = new RegExp(
    `<a[^>]+href="/ranking/genre/${genreId}\\?tag=([^"&]+)"[^>]*>([^<]+)</a>`,
    'g'
  )
  
  let match
  while ((match = tagLinkPattern.exec(html)) !== null) {
    const encodedTag = match[1]
    const tagText = match[2]
    
    if (encodedTag && tagText && tagText !== 'すべて') {
      try {
        const decodedTag = decodeURIComponent(encodedTag)
        if (!tags.includes(decodedTag)) {
          tags.push(decodedTag)
        }
      } catch {
        // デコードエラーは無視
      }
    }
  }
  
  return tags.slice(0, 10) // 最大10個まで
}

// server-responseのtrendTagsから人気タグを抽出
export function extractTrendTagsFromServerResponse(serverData: any): string[] {
  try {
    const trendTags = serverData.data?.response?.$getTeibanRankingFeaturedKeyAndTrendTags?.data?.trendTags
    
    if (!Array.isArray(trendTags)) {
      return []
    }
    
    return trendTags.filter((tag: any) => {
      return typeof tag === 'string' && tag.trim().length > 0
    })
  } catch (error) {
    return []
  }
}

// ランキングデータを取得（新しいエントリポイント）
export async function fetchRanking(
  genre: RankingGenre | string,
  tag: string | null = null,
  term: '24h' | 'hour' = '24h',
  limit: number = 100,
  page: number = 1
): Promise<{
  items: RankingItem[]
  popularTags: string[]
  genre: string
  label: string
}> {
  try {
    // ジャンルIDに変換
    const genreId = GENRE_ID_MAP[genre as RankingGenre] || genre
    
    // URLを構築
    let url = `https://www.nicovideo.jp/ranking/genre/${genreId}?term=${term}`
    if (tag) {
      url += `&tag=${encodeURIComponent(tag)}`
    }
    if (page > 1) {
      url += `&page=${page}`
    }
    
    // HTMLを取得
    const html = await fetchWithGooglebot(url)
    
    // server-responseデータを抽出
    const serverData = extractServerResponseData(html)
    const rankingData = serverData.data?.response?.$getTeibanRanking?.data
    
    if (!rankingData) {
      throw new Error('ランキングデータが見つかりません')
    }
    
    // ラベルと人気タグを取得
    const label = rankingData.label || genre
    let popularTags: string[] = []
    
    // 人気タグを取得（2つの方法を試す）
    popularTags = extractTrendTagsFromServerResponse(serverData)
    if (popularTags.length === 0) {
      popularTags = extractPopularTagsFromHTML(html, genreId)
    }
    
    // アイテムを整形（ランク番号はページを考慮して計算）
    const startRank = (page - 1) * 100 + 1
    let items: RankingItem[] = (rankingData.items || []).map((item: any, index: number) => ({
      rank: startRank + index,
      id: item.id,
      title: item.title,
      thumbURL: item.thumbnail?.url || item.thumbnail?.middleUrl || '',
      views: item.count?.view || 0,
      comments: item.count?.comment || 0,
      mylists: item.count?.mylist || 0,
      likes: item.count?.like || 0,
      tags: item.tags || [],
      authorId: item.owner?.id || item.user?.id,
      authorName: item.owner?.name || item.user?.nickname || item.channel?.name,
      authorIcon: item.owner?.iconUrl || item.user?.iconUrl || item.channel?.iconUrl,
      registeredAt: item.registeredAt || item.startTime || item.createTime
    }))
    
    // HTMLからタグ情報を抽出して追加
    items = enrichRankingItemsWithTags(items, html)
    
    // limitに合わせて切り詰め
    const limitedItems = items.slice(0, limit)
    
    // NGフィルタリングはここでは適用しない（呼び出し側で制御）
    
    return {
      items: limitedItems,
      popularTags: popularTags,
      genre: genreId,
      label: label
    }
  } catch (error) {
    // fetchRanking error - re-throwing for caller to handle
    throw error
  }
}

// 複数ジャンルのランキングを並列で取得
export async function fetchMultipleRankings(
  genres: RankingGenre[],
  term: '24h' | 'hour' = '24h'
): Promise<Map<RankingGenre, { items: RankingItem[]; popularTags: string[] }>> {
  const results = new Map<RankingGenre, { items: RankingItem[]; popularTags: string[] }>()
  
  // 並列で取得（ただし同時実行数を制限）
  const concurrencyLimit = 3
  for (let i = 0; i < genres.length; i += concurrencyLimit) {
    const batch = genres.slice(i, i + concurrencyLimit)
    const batchResults = await Promise.all(
      batch.map(async (genre) => {
        try {
          const result = await fetchRanking(genre, null, term)
          return { genre, result }
        } catch (error) {
          // Failed to fetch genre - returning empty result
          return { genre, result: { items: [], popularTags: [] } }
        }
      })
    )
    
    batchResults.forEach(({ genre, result }) => {
      results.set(genre, {
        items: result.items,
        popularTags: result.popularTags
      })
    })
    
    // レート制限対策
    if (i + concurrencyLimit < genres.length) {
      await new Promise(resolve => setTimeout(resolve, 1000))
    }
  }
  
  return results
}

// 後方互換性のためのエイリアス
export const completeHybridScrape = fetchRanking