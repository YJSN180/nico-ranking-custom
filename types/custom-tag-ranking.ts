/**
 * カスタムタグランキング関連の型定義
 */

import type { RankingGenre, RankingPeriod } from './ranking-config'

/**
 * タグ条件の論理演算子
 */
export type TagOperator = 'and' | 'or' | 'not'

/**
 * カスタムタグランキングの条件
 */
export interface CustomTagConditions {
  and: string[]  // AND条件のタグ（すべて含む）
  or: string[]   // OR条件のタグ（いずれか含む）
  not: string[]  // NOT条件のタグ（含まない）
}

/**
 * カスタムタグランキング
 */
export interface CustomTagRanking {
  id: string
  name: string
  genre: RankingGenre
  period: RankingPeriod
  conditions: CustomTagConditions
  createdAt: number
  updatedAt: number
}

/**
 * タグ候補（オートコンプリート用）
 */
export interface TagSuggestion {
  name: string
  count: number      // 出現回数
  isPopular: boolean // 人気タグかどうか
}

/**
 * タグキャッシュ
 */
export interface TagCache {
  genre: RankingGenre
  period: RankingPeriod
  tags: TagSuggestion[]
  cachedAt: number
}

/**
 * カスタムランキングのストレージキー
 */
export const CUSTOM_RANKINGS_STORAGE_KEY = 'custom-tag-rankings'
export const TAG_CACHE_KEY_PREFIX = 'tag-cache'

/**
 * タグキャッシュの有効期限（5分）
 */
export const TAG_CACHE_TTL = 5 * 60 * 1000