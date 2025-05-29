// ニコニコ動画のランキングページをスクレイピングするモジュール
// 完全なハイブリッド実装：HTML + nvAPI + Snapshot API

import { completeHybridScrape } from './complete-hybrid-scraper'
import type { RankingItem } from '@/types/ranking'

// メインのスクレイピング関数
export async function scrapeRankingPage(
  genre: string,
  term: '24h' | 'hour',
  tag?: string
): Promise<{
  items: Partial<RankingItem>[]
  popularTags?: string[]
}> {
  return await completeHybridScrape(genre, term, tag)
}

// 互換性のため、既存の関数もエクスポート
export { fetchPopularTags } from './complete-hybrid-scraper'

// 以下は互換性のための空実装（使用されていない場合は削除可能）
export async function fetchVideoDetailsBatch(
  videoIds: string[],
  concurrency: number = 3
): Promise<Map<string, { tags?: string[], likes?: number, registeredAt?: string }>> {
  // 新実装では不要（completeHybridScrape内で処理）
  return new Map()
}

export async function fetchVideoTagsBatch(
  videoIds: string[],
  concurrency: number = 10
): Promise<Map<string, string[]>> {
  // 新実装では不要（completeHybridScrape内で処理）
  return new Map()
}

export async function fetchVideoDetails(videoId: string): Promise<{
  tags?: string[]
  likes?: number
  registeredAt?: string
}> {
  // 新実装では不要（completeHybridScrape内で処理）
  return {}
}