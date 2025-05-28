// ランキングデータ取得の統合モジュール
// RSS廃止予定のため、すべてスクレイピングで実装

import { scrapeRankingPage, fetchVideoDetailsBatch } from './scraper'
import type { RankingItem, RankingData } from '@/types/ranking'
import type { RankingPeriod, RankingGenre } from '@/types/ranking-config'

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
  // スクレイピングでランキングを取得
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
  const scrapedItems = await scrapeRankingPage(genre, period, tag)
  
  // 動画IDのリストを作成
  const videoIds = scrapedItems
    .filter(item => item.id)
    .map(item => item.id!)
  
  // バッチで詳細情報を取得
  const detailsMap = await fetchVideoDetailsBatch(videoIds)
  
  // データを統合
  return scrapedItems
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
}