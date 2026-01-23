/**
 * 型定義の統合エクスポート
 *
 * このファイルからすべての型をインポートすることで、
 * インポートパスを統一できます。
 *
 * 例: import { RankingItem, NGList, VideoInfo } from '@/types'
 */

// ランキング関連
export type {
  TagDetail,
  RankingItem,
  PopularTag,
  RankingData,
  DerivativeNGData,
  KVRankingData,
} from './ranking'

// ランキング設定
export type {
  RankingPeriod,
  RankingGenre,
  RankingConfig,
} from './ranking-config'

export {
  GENRE_LABELS,
  PERIOD_LABELS,
  CACHED_GENRES,
  RANKING_GENRES,
  GENRE_GROUPS,
  getGroupIdForGenre,
} from './ranking-config'

// NGリスト
export type { NGList, NGFilterResult } from './ng-list'

// 拡張NGリスト
export type {
  TagNGList,
  ExtendedNGList,
  ExtendedUserNGList,
  ExtendedNGListBackupData,
} from './ng-list-extended'

// API関連
export type {
  VideoInfo,
  VideoStats,
  TagRankingItem,
  AdminVideoInfo,
  TagAccumulationData,
} from './api'

// カスタムランキング
export type {
  TagOperator,
  TagCondition,
  CustomRanking,
  CustomRankingStorage,
  CustomRankingFormState,
  ModalStep,
  TagSuggestion,
} from './custom-ranking'

// ジャンル順序
export type { GenreItem, GenreOrderState } from './genre-order'

export { DEFAULT_GENRE_ORDER, createDefaultGenreItems } from './genre-order'

// RSS
export type { RSSItem, RSSChannel, RSSDocument } from './rss'
