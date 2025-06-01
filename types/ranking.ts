export interface RankingItem {
  rank: number
  id: string
  title: string
  thumbURL: string
  views: number
  comments?: number
  mylists?: number
  likes?: number
  // 拡張フィールド（スクレイピング用）
  tags?: string[]
  authorId?: string
  authorName?: string
  authorIcon?: string
  registeredAt?: string  // ISO 8601形式の投稿日時
  latestComment?: {
    body: string
    postedAt: string
  }
}

export type RankingData = RankingItem[]