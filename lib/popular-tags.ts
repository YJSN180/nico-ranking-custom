// 各ジャンルの人気タグ
// 動的取得が失敗した場合のフォールバック用
// 最新のデータはgetPopularTags関数で取得すること

import { scrapeRankingPage } from './scraper'
import { kv } from './simple-kv'
import { POPULAR_TAGS_LATEST_KEY, type PopularTagsLatest } from './pipeline/popular-tags-latest'
import type { RankingGenre } from '../types/ranking-config'

export { POPULAR_TAGS_LATEST_KEY } from './pipeline/popular-tags-latest'
export type { PopularTagsLatest } from './pipeline/popular-tags-latest'

// パイプライン（scripts/sync-ranking-auxiliary.ts）が公開成功後に書き出す人気タグだけの小キー。
// ランキング本体（数百KB〜）を丸読みしていた /api/popular-tags の遅さ（1〜3s）を解消する。
// 未生成・不正・読取失敗のときは従来経路（ゲートウェイ → スクレイパー）へ落ちる。
const POPULAR_TAGS_CACHE_TTL_MS = 5 * 60 * 1000

let popularTagsLatestCache: { value: PopularTagsLatest | null; fetchedAt: number } | null = null

export function invalidatePopularTagsLatestCache(): void {
  popularTagsLatestCache = null
}

function isPopularTagsLatest(value: unknown): value is PopularTagsLatest {
  if (typeof value !== 'object' || value === null) return false
  const { genres, all } = value as Record<string, unknown>
  return typeof genres === 'object' && genres !== null && typeof all === 'object' && all !== null
}

async function getPopularTagsLatest(): Promise<PopularTagsLatest | null> {
  const cacheEnabled = process.env.NODE_ENV !== 'test'
  if (cacheEnabled && popularTagsLatestCache && Date.now() - popularTagsLatestCache.fetchedAt < POPULAR_TAGS_CACHE_TTL_MS) {
    return popularTagsLatestCache.value
  }
  try {
    const value = await kv.get<unknown>(POPULAR_TAGS_LATEST_KEY)
    const valid = isPopularTagsLatest(value) ? value : null
    if (cacheEnabled) popularTagsLatestCache = { value: valid, fetchedAt: Date.now() }
    return valid
  } catch {
    return null
  }
}

async function getGenreRanking(genre: RankingGenre, period: '24h' | 'hour') {
  // Reuse the same-origin proxy on Vercel, as the SSR ranking loader does.
  const deployment = process.env.VERCEL_URL
  const base = deployment
    ? deployment.startsWith('http') ? deployment : `https://${deployment}`
    : process.env.NEXT_PUBLIC_API_GATEWAY_URL || 'https://nico-rank.com'
  const url = new URL('/api/ranking', base)
  url.search = new URLSearchParams({ genre, period }).toString()
  const response = await fetch(url, {
    headers: {
      Accept: 'application/json',
      'User-Agent': 'nico-ranking-web/1.0',
    },
    cache: 'no-store',
    signal: AbortSignal.timeout(10_000),
  })
  if (!response.ok) throw new Error('Ranking gateway unavailable')
  const data = await response.json() as { popularTags?: unknown }
  if (!Array.isArray(data.popularTags) || data.popularTags.some((tag: unknown) => typeof tag !== 'string')) {
    throw new Error('Invalid popular tags')
  }
  return data as { popularTags: string[] }
}

// ジャンルの人気タグを取得（キャッシュ付き）
export async function getPopularTags(genre: RankingGenre, period: '24h' | 'hour' = '24h'): Promise<string[]> {
  // 0. 小キー（1読み・5分メモ）。未生成/不正なら従来経路へフォールバック
  const latest = await getPopularTagsLatest()
  if (latest) {
    const tags = genre === 'all' ? latest.all[period] : latest.genres[genre]?.[period]
    if (Array.isArray(tags) && tags.length > 0) return tags
  }

  // 「すべて」ジャンルの場合は、他のジャンルから人気タグを集計
  if (genre === 'all') {
    try {
      const genres: RankingGenre[] = ['game', 'anime', 'entertainment', 'technology', 'voicesynthesis', 'other']
      const tagCountMap = new Map<string, number>()
      
      // 各ジャンルの人気タグを取得して集計
      for (const g of genres) {
        const tags = await getPopularTagsForGenre(g, period)
        tags.forEach((tag, index) => {
          // 順位が高いタグほど高いスコアを付与（15位から1位へ）
          const score = tags.length - index
          tagCountMap.set(tag, (tagCountMap.get(tag) || 0) + score)
        })
      }
      
      // スコア順にソートして上位15個を返す
      const sortedTags = Array.from(tagCountMap.entries())
        .sort((a, b) => b[1] - a[1])
        .slice(0, 15)
        .map(([tag]) => tag)
      
      return sortedTags
    } catch (error) {
      // Failed to aggregate popular tags for all genre - returning empty array
      return []
    }
  }
  
  try {
    // 1. 公開済みR2世代をAPI gateway経由で取得
    const cfData = await getGenreRanking(genre, period)
    if (cfData && cfData.popularTags && cfData.popularTags.length > 0) {
      return cfData.popularTags
    }
  } catch (error) {
    // Gateway unavailable; try the existing scraper fallback.
  }
  
  try {
    // 2. 動的に人気タグを取得（フォールバック）
    const data = await scrapeRankingPage(genre, period)
    
    if (data.popularTags && data.popularTags.length > 0) {
      return data.popularTags
    }
  } catch (error) {
    // Failed to fetch popular tags dynamically - returning empty array
  }
  
  // 3. 最終フォールバック：空配列を返す
  return []
}

// 個別ジャンルの人気タグを取得（内部用、allジャンルの集計で使用）
async function getPopularTagsForGenre(genre: RankingGenre, period: '24h' | 'hour' = '24h'): Promise<string[]> {
  try {
    // 1. 公開済みR2世代をAPI gateway経由で取得
    const cfData = await getGenreRanking(genre, period)
    if (cfData && cfData.popularTags && cfData.popularTags.length > 0) {
      return cfData.popularTags
    }
  } catch (error) {
    // Gateway unavailable; try the existing scraper fallback.
  }
  
  try {
    // 2. 動的に人気タグを取得（フォールバック）
    const data = await scrapeRankingPage(genre, period)
    
    if (data.popularTags && data.popularTags.length > 0) {
      return data.popularTags
    }
  } catch (error) {
    // Failed to fetch popular tags dynamically - returning empty array
  }
  
  // 3. 最終フォールバック：空配列を返す
  return []
}
