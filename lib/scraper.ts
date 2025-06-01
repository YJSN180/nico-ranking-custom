// ニコニコ動画のランキングページをnvapiから取得するモジュール

import type { RankingItem } from '@/types/ranking'
import { fetchRanking } from './complete-hybrid-scraper'
import { rssHybridScrape } from './rss-hybrid-scraper'

// User-Agentの設定
const USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'

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

// nvapiからランキングデータを取得
export async function scrapeRankingPage(
  genre: string,
  term: '24h' | 'hour',
  tag?: string,
  limit: number = 100 // ニコニコ動画のserver-responseデータは最大100件
): Promise<{
  items: Partial<RankingItem>[]
  popularTags?: string[]
}> {
  // 全てのジャンルでfetchRankingを使用
  // これによりmeta tagベースの新形式に対応し、センシティブ動画も取得できる
  const data = await fetchRanking(genre, tag, term, limit)
  return {
    items: data.items,
    popularTags: data.popularTags
  }
}

// 既存のnvAPI専用実装（テスト用に保持）
export async function scrapeRankingPageNvApiOnly(
  genre: string,
  term: '24h' | 'hour',
  tag?: string
): Promise<{
  items: Partial<RankingItem>[]
  popularTags?: string[]
}> {
  await checkRateLimit()
  
  // URLの構築（tagパラメータをサポート）
  const params = new URLSearchParams({ term })
  if (tag) {
    params.append('tag', tag)
  }
  const url = `https://nvapi.nicovideo.jp/v1/ranking/genre/${genre}?${params}`
  
  try {
    const response = await fetch(url, {
      headers: {
        'User-Agent': USER_AGENT,
        'Accept': 'application/json, text/plain, */*',
        'Accept-Language': 'ja,en;q=0.9',
        'X-Frontend-Id': '6',
        'X-Frontend-Version': '0',
        'Referer': 'https://www.nicovideo.jp/',
      }
    })
    
    if (!response.ok) {
      throw new Error(`Failed to fetch ranking data: ${response.status}`)
    }
    
    const data = await response.json()
    
    if (data.meta?.status !== 200 || !data.data?.items) {
      throw new Error('Invalid nvapi response')
    }
    
    // 基本は200件取得するが、タグ取得は上位のみ
    const MAX_ITEMS = 200
    const MAX_TAG_FETCH = 50 // タグ取得は上位50件のみ
    const rankingItems = data.data.items.slice(0, MAX_ITEMS)
    
    // nvapiレスポンスをパース
    let items: Partial<RankingItem>[] = rankingItems.map((item: any, index: number) => ({
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
      tags: undefined,
    }))
    
    // tagパラメータを使った場合は、すでにフィルタリング済みなので個別タグ取得は不要
    // ジャンルが'all'以外で、tagパラメータがない場合のみ人気タグ集計のためタグを取得
    let popularTags: string[] = []
    
    if (!tag && genre !== 'all') {
      // 人気タグ集計のため、上位50件のみタグを取得（パフォーマンス最適化）
      const videoIds = items.slice(0, 50).map(item => item.id!).filter(Boolean)
      const tagsMap = await fetchVideoTagsBatch(videoIds, 5) // 並列数を減らして安定性向上
      
      // タグ情報をマージ（人気タグ集計用）
      const itemsWithTags = items.slice(0, 50).map(item => ({
        ...item,
        tags: tagsMap.get(item.id!) || []
      }))
      
      // 人気タグを集計
      const tagCounts = new Map<string, number>()
      itemsWithTags.forEach(item => {
        item.tags?.forEach(tag => {
          tagCounts.set(tag, (tagCounts.get(tag) || 0) + 1)
        })
      })
      
      popularTags = Array.from(tagCounts.entries())
        .sort((a, b) => b[1] - a[1])
        .slice(0, 20)
        .map(([tag]) => tag)
    }
    
    return { items, popularTags }
    
  } catch (error) {
    throw new Error(`Scraping failed: ${error}`)
  }
}

// バッチで複数の動画のタグを取得（最適化版）
export async function fetchVideoTagsBatch(
  videoIds: string[],
  concurrency: number = 10
): Promise<Map<string, string[]>> {
  const results = new Map<string, string[]>()
  
  // 並列実行数を制限しながら処理
  for (let i = 0; i < videoIds.length; i += concurrency) {
    const batch = videoIds.slice(i, i + concurrency)
    const batchPromises = batch.map(async (id) => {
      try {
        await checkRateLimit()
        const url = `https://nvapi.nicovideo.jp/v1/videos/${id}/tags`
        
        const response = await fetch(url, {
          headers: {
            'User-Agent': USER_AGENT,
            'Accept': 'application/json',
            'X-Frontend-Id': '6',
            'X-Frontend-Version': '0',
            'Referer': 'https://www.nicovideo.jp/',
          }
        })
        
        if (!response.ok) {
          return { id, tags: [] }
        }
        
        const data = await response.json()
        const tags = data.data?.tags?.map((tag: any) => tag.name) || []
        return { id, tags }
      } catch (error) {
        // エラーログはスキップ（ESLintエラー回避）
        return { id, tags: [] }
      }
    })
    
    const batchResults = await Promise.all(batchPromises)
    batchResults.forEach(({ id, tags }) => {
      results.set(id, tags)
    })
  }
  
  return results
}

// 動画詳細情報を取得（主にタグ用）
export async function fetchVideoDetails(videoId: string): Promise<{
  tags?: string[]
  likes?: number
  registeredAt?: string
}> {
  await checkRateLimit()
  
  const url = `https://nvapi.nicovideo.jp/v1/video/${videoId}`
  
  try {
    const response = await fetch(url, {
      headers: {
        'User-Agent': USER_AGENT,
        'Accept': 'application/json',
        'X-Frontend-Id': '6',
        'X-Frontend-Version': '0',
        'Referer': `https://www.nicovideo.jp/watch/${videoId}`
      }
    })
    
    if (!response.ok) {
      // 404の場合は空のデータを返す
      if (response.status === 404) {
        return {}
      }
      throw new Error(`Failed to fetch video details: ${response.status}`)
    }
    
    const data = await response.json()
    
    if (data.meta?.status !== 200 || !data.data?.video) {
      return {}
    }
    
    return {
      tags: data.data.tag?.items?.map((tag: any) => tag.name) || [],
      likes: data.data.video?.count?.like,
      registeredAt: data.data.video?.registeredAt
    }
    
  } catch (error) {
    // エラー時は空のデータを返す
    // エラーログはスキップ（ESLintエラー回避）
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

// 人気タグを取得する関数
export async function fetchPopularTags(genre: string): Promise<string[]> {
  await checkRateLimit()
  
  const url = `https://nvapi.nicovideo.jp/v1/genres/${genre}/popular-tags`
  
  try {
    const response = await fetch(url, {
      headers: {
        'User-Agent': USER_AGENT,
        'Accept': 'application/json',
        'X-Frontend-Id': '6',
        'X-Frontend-Version': '0',
        'Referer': 'https://www.nicovideo.jp/',
      }
    })
    
    if (!response.ok) {
      return []
    }
    
    const data = await response.json()
    
    if (data.meta?.status !== 200 || !data.data?.tags) {
      return []
    }
    
    // タグ名のリストを返す（tagsは文字列配列として返される）
    return data.data.tags.slice(0, 20)
    
  } catch (error) {
    // エラーログはスキップ（ESLintエラー回避）
    return []
  }
}