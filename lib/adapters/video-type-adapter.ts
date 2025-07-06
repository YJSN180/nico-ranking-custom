/**
 * 動画型変換アダプター
 * マイリスト動画とランキング動画の型変換を行う
 */

import type { MylistVideo } from '@/lib/storage/types'
import type { RankingItem } from '@/types/ranking'

/**
 * MylistVideo を RankingItem に変換
 * VideoContextMenu で使用するための型変換
 * 
 * @param video - 変換元のマイリスト動画データ
 * @param rank - 表示順位（1から開始）
 * @returns RankingItem形式のデータ
 */
export function convertMylistVideoToRankingItem(
  video: MylistVideo, 
  rank: number
): RankingItem {
  return {
    rank,
    id: video.id,
    title: video.title,
    thumbURL: video.thumbURL,
    views: video.views || 0,
    comments: video.comments,
    mylists: video.mylists,
    likes: video.likes,
    authorId: video.authorId,
    authorName: video.authorName,
    authorIcon: video.authorIcon,
    registeredAt: video.registeredAt,
    duration: video.duration,
    // RankingItem固有のフィールドはデフォルト値
    tags: undefined,
    originalRank: undefined
  }
}

/**
 * 複数のMylistVideoをRankingItemの配列に変換
 * 
 * @param videos - 変換元のマイリスト動画配列
 * @returns RankingItem形式の配列（rank付き）
 */
export function convertMylistVideosToRankingItems(
  videos: MylistVideo[]
): RankingItem[] {
  return videos.map((video, index) => 
    convertMylistVideoToRankingItem(video, index + 1)
  )
}