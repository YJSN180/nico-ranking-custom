export interface Uploader {
  name: string
  icon: string
  id?: string
}

export interface EnhancedRankingItem {
  rank: number
  id: string
  title: string
  thumbURL: string
  views: number
  comments: number
  mylists: number
  likes: number
  uploadDate: string
  uploader: Uploader
  duration?: string
  tags?: string[]
}

export type EnhancedRankingData = EnhancedRankingItem[]

export interface RankingType {
  id: string
  label: string
  term: 'hour' | '24h' | 'week' | 'month'
  genre?: string
}

export const RANKING_TYPES: RankingType[] = [
  { id: 'hourly-all', label: '毎時総合', term: 'hour' },
  { id: 'daily-all', label: '24時間総合', term: '24h' },
  { id: 'weekly-all', label: '週間総合', term: 'week' },
  { id: 'monthly-all', label: '月間総合', term: 'month' },
  // Genre specific
  { id: 'daily-entertainment', label: 'エンタメ・音楽', term: '24h', genre: 'entertainment' },
  { id: 'daily-game', label: 'ゲーム', term: '24h', genre: 'game' },
  { id: 'daily-anime', label: 'アニメ', term: '24h', genre: 'anime' },
  { id: 'daily-technology', label: '科学・技術', term: '24h', genre: 'technology' },
]