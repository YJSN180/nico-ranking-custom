// ランキングデータ取得の統合モジュール
// RSS廃止予定のため、すべてスクレイピングで実装

import { scrapeRankingPage, fetchVideoDetailsBatch } from './scraper'
import type { RankingItem, RankingData } from '@/types/ranking'
import type { RankingPeriod, RankingGenre } from '@/types/ranking-config'

const DEFAULT_API_GATEWAY = 'https://nico-rank.com'

function shouldUseApiGateway(): boolean {
  if (process.env.FORCE_SCRAPER_FETCH === 'true') {
    return false
  }
  if (process.env.VERCEL === '1') {
    return true
  }
  if (process.env.VERCEL_ENV === 'preview') {
    return true
  }
  return process.env.USE_RANKING_GATEWAY_FOR_SSR === 'true'
}

function resolveApiGatewayBase(): string {
  const explicitGateway = process.env.NEXT_PUBLIC_API_GATEWAY_URL
  if (explicitGateway && explicitGateway.startsWith('http')) {
    return explicitGateway.replace(/\/$/, '')
  }
  const vercelUrl = process.env.VERCEL_URL
  if (vercelUrl) {
    const normalized = vercelUrl.startsWith('http') ? vercelUrl : `https://${vercelUrl}`
    return normalized.replace(/\/$/, '')
  }
  if (process.env.NODE_ENV === 'development') {
    return 'http://localhost:3000'
  }
  return DEFAULT_API_GATEWAY
}

async function fetchRankingViaGateway(period: RankingPeriod, genre: RankingGenre, tag?: string): Promise<RankingData> {
  const params = new URLSearchParams({ genre, period })
  if (tag) {
    params.set('tag', tag)
  }
  const baseUrl = resolveApiGatewayBase()
  const targetUrl = `${baseUrl}/api/ranking?${params.toString()}`
  const response = await fetch(targetUrl, {
    headers: {
      Accept: 'application/json'
    },
    // キャッシュ無効化: ISRキャッシュによる古いデータ問題を防ぐ
    cache: 'no-store'
  })
  if (!response.ok) {
    throw new Error(`API gateway responded with ${response.status}`)
  }
  const data = (await response.json()) as RankingData
  if (!data || !Array.isArray(data.items)) {
    throw new Error('Invalid response from API gateway')
  }
  return data
}

/**
 * ランキングデータを取得（すべてスクレイピングベース）
 * @param period - 期間（24h or hour）
 * @param genre - ジャンル
 * @param tag - タグ（オプション）
 * @returns 完全なランキングデータ
 */
export async function fetchRankingData(
  period: RankingPeriod = '24h',
  genre: RankingGenre = 'all',
  tag?: string
): Promise<RankingData> {
  if (shouldUseApiGateway()) {
    try {
      return await fetchRankingViaGateway(period, genre, tag)
    } catch (error) {
      if (process.env.NODE_ENV !== 'production') {
        console.warn('[fetchRankingData] API gateway fallback triggered:', error)
      }
      // フォールバックとしてスクレイピングに切り替える
    }
  }
  return fetchRankingWithScraping(period, genre, tag)
}

/**
 * スクレイピングでランキングデータを取得
 */
async function fetchRankingWithScraping(
  period: RankingPeriod,
  genre: RankingGenre,
  tag?: string
): Promise<RankingData> {
  // HTMLからベースデータを取得
  const { items: scrapedItems, popularTags } = await scrapeRankingPage(genre, period, tag)
  
  // 人気タグをグローバルストアに保存（後でタグセレクターから参照）
  if (popularTags && genre !== 'all') {
    storePopularTags(genre, popularTags)
  }
  
  // 動画IDのリストを作成
  const videoIds = scrapedItems
    .filter(item => item.id)
    .map(item => item.id!)
  
  // バッチで詳細情報を取得
  const detailsMap = await fetchVideoDetailsBatch(videoIds)
  
  // データを統合
  const items = scrapedItems
    .filter(item => item.id)
    .map(item => {
      const details = detailsMap.get(item.id!) || {}
      return {
        rank: item.rank!,
        id: item.id!,
        title: item.title || '',
        thumbURL: item.thumbURL || '',
        views: item.views || 0,
        comments: item.comments,
        mylists: item.mylists,
        likes: details.likes,
        tags: details.tags,
        authorId: item.authorId,
        authorName: item.authorName,
        authorIcon: item.authorIcon,
        registeredAt: details.registeredAt
      } as RankingItem
    })
  
  return {
    items,
    popularTags: popularTags || [],
    metadata: {
      version: 1,
      updatedAt: new Date().toISOString(),
      genre,
      period
    }
  }
}

// 人気タグを一時的に保存
const popularTagsCache = new Map<string, string[]>()

function storePopularTags(genre: string, tags: string[]) {
  popularTagsCache.set(genre, tags)
}

export function getStoredPopularTags(genre: string): string[] {
  return popularTagsCache.get(genre) || []
}
