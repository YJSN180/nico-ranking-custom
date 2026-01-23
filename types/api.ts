/**
 * API関連の型定義
 * ニコニコ動画APIのレスポンス型やデータ構造
 */

/**
 * Snapshot APIから取得する動画情報
 */
export interface VideoInfo {
  contentId: string
  title: string
  viewCounter: number
  commentCounter: number
  mylistCounter: number
  likeCounter: number
  thumbnail: {
    url: string
    largeUrl?: string
  }
  registeredAt: string
  lengthSeconds: number
  tags?: string[]
}

/**
 * 動画の統計情報（リアルタイム取得用）
 */
export interface VideoStats {
  viewCounter?: number
  commentCounter?: number
  mylistCounter?: number
  likeCounter?: number
  tags?: string[]
}

/**
 * タグランキングアイテム
 */
export interface TagRankingItem {
  rank: number
  contentId: string
  title: string
  viewCounter: number
  commentCounter: number
  mylistCounter: number
  likeCounter: number
  thumbnail: {
    url: string
    largeUrl?: string
  }
  tags: string[]
  registeredAt: string
}

/**
 * Admin用の動画情報（簡易版）
 */
export interface AdminVideoInfo {
  id: string
  title: string
  authorName: string
  url: string
  viewCount: number
  commentCount: number
  mylistCount: number
  likeCount: number
  isDeleted?: boolean
}

/**
 * タグ蓄積データ構造（Worker/API用）
 */
export interface TagAccumulationData {
  tags: Record<string, number>
  updatedAt: string
  genre: string
  period: string
  totalVideos: number
}
