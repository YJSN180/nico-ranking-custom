import type { NGList } from './ng-list'

/**
 * タグNGの種類
 */
export interface TagNGList {
  /** ロックタグのNGリスト */
  locked: {
    exact: string[]
    partial: string[]
  }
  /** ユーザータグのNGリスト */
  user: {
    exact: string[]
    partial: string[]
  }
  /** 両方（ロック・ユーザー問わず）のNGリスト */
  both: {
    exact: string[]
    partial: string[]
  }
}

/**
 * 拡張NGList（タグNG機能付き）
 * 既存のNGListを拡張し、後方互換性を維持
 */
export interface ExtendedNGList extends NGList {
  /** タグNGリスト（オプショナル: 後方互換性のため） */
  tags?: TagNGList
}

/**
 * ユーザー用の拡張NGList
 * LocalStorageに保存される形式
 */
export interface ExtendedUserNGList extends ExtendedNGList {
  /** NGListのバージョン（1: 既存, 2: タグ対応） */
  version: number
  /** 全NGアイテムの総数 */
  totalCount: number
  /** 最終更新日時 */
  updatedAt: string
}

/**
 * 拡張NGListバックアップデータ形式
 */
export interface ExtendedNGListBackupData {
  /** バックアップ形式のバージョン ("1.0.0" → "1.1.0") */
  version: string
  /** エクスポート日時 */
  exportDate: string
  /** エクスポート元 */
  exportSource: 'settings-applied'
  /** NGListデータ */
  ngList: ExtendedUserNGList
  /** メタデータ */
  metadata: {
    /** 全アイテム総数 */
    totalItems: number
    /** カテゴリ別内訳 */
    categoryBreakdown: {
      // 既存フィールド
      videoIds: number
      videoTitlesExact: number
      videoTitlesPartial: number
      authorIds: number
      authorNamesExact: number
      authorNamesPartial: number
      // 新規フィールド（オプショナル）
      tagsLockedExact?: number
      tagsLockedPartial?: number
      tagsUserExact?: number
      tagsUserPartial?: number
      tagsBothExact?: number
      tagsBothPartial?: number
    }
    /** アプリバージョン */
    appVersion: string
  }
}