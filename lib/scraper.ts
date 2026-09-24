// ニコニコ動画のランキングページをnvapiから取得するモジュール

import type { RankingItem } from '@/types/ranking'

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
  limit: number = 100,
  page: number = 1
): Promise<{
  items: Partial<RankingItem>[]
  popularTags?: string[]
}> {
  // nvAPI専用実装を使用
  return await scrapeRankingPageNvApiOnly(genre, term, tag)
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
    const rankingItems = data.data.items.slice(0, MAX_ITEMS)
    
    // nvapiレスポンスをパース
    const items: Partial<RankingItem>[] = rankingItems.map((item: any, index: number) => ({
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
      duration: item.duration,
      tags: undefined,
    }))
    
    // 人気タグ: 以前は nvapi /v1/videos/{id}/tags で上位50件のタグを集計していたが、
    // 同エンドポイントは 404 で廃止済み（2026-09 実測）。この経路は KV 未生成時の
    // 最終フォールバックであり、人気タグはパイプライン側（POPULAR_TAGS_LATEST）が担う
    const popularTags: string[] = []

    return { items, popularTags }
    
  } catch (error) {
    throw new Error(`Scraping failed: ${error}`)
  }
}
