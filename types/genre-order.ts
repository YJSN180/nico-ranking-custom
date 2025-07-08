import { RankingGenre } from './ranking-config'

/**
 * ジャンルアイテムの情報
 */
export interface GenreItem {
  id: RankingGenre
  isVisible: boolean
  order: number
}

/**
 * ジャンル順序の状態
 */
export interface GenreOrderState {
  items: GenreItem[]
}

/**
 * デフォルトのジャンル順序
 */
export const DEFAULT_GENRE_ORDER: RankingGenre[] = [
  'all', 'game', 'anime', 'vocaloid', 'voicesynthesis', 
  'entertainment', 'music', 'sing', 'dance', 'play', 
  'commentary', 'cooking', 'travel', 'nature', 'vehicle', 
  'technology', 'society', 'mmd', 'vtuber', 'radio', 
  'sports', 'animal', 'other'
]

/**
 * デフォルトのジャンル状態を生成
 */
export function createDefaultGenreItems(): GenreItem[] {
  return DEFAULT_GENRE_ORDER.map((id, index) => ({
    id,
    isVisible: true,
    order: index
  }))
}