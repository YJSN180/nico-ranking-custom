export interface RankingItem {
  rank: number
  id: string
  title: string
  thumbURL: string
  views: number
}

export type RankingData = RankingItem[]