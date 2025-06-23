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
  duration?: number  // 動画の再生時間（秒単位）
  // 順位管理用（NGフィルタリング後の元順位保持）
  originalRank?: number
}

// R2に保存されるランキングデータの構造
export interface RankingData {
  items: RankingItem[]
  popularTags: string[]
  tags?: Record<string, number>  // タグとその出現回数
  metadata: {
    version: number
    updatedAt: string
    genre: string
    period: string
  }
}

// 派生NGリストデータ構造
export interface DerivativeNGData {
  blockedVideoIds: string[]
  blockedAuthorIds: string[]
  statsSnapshot: {
    totalVideosProcessed: number
    totalBlocked: number
    lastUpdated: string
  }
}

// KVに保存されるランキングデータ構造
export interface KVRankingData {
  genres: {
    [genre: string]: {
      '24h': {
        items: RankingItem[]
        popularTags: string[]
        tags?: Record<string, RankingItem[]>
      }
      'hour': {
        items: RankingItem[]
        popularTags: string[]
        tags?: Record<string, RankingItem[]>
      }
    }
  }
  metadata: {
    version: number
    updatedAt: string
    totalItems: number
    ngFiltered: boolean
  }
  derivativeNGData?: DerivativeNGData
}