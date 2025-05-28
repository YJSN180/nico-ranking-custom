export interface RankingItem {
  rank: number
  id: string
  title: string
  thumbURL: string
  views: number
  comments?: number
  mylists?: number
  likes?: number
}

export type RankingData = RankingItem[]