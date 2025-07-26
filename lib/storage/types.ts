// お気に入りデータ構造
export interface Favorite {
  id: string           // 動画ID（sm番号）
  title: string        // 動画タイトル
  thumbURL: string     // サムネイルURL
  addedAt: number      // 追加日時（timestamp）
  tags: string[]       // ユーザー定義タグ
  memo?: string        // メモ（オプション）
  
  // 追加の動画情報（お気に入り時に保存）
  views?: number       // 再生数
  comments?: number    // コメント数
  mylists?: number     // マイリスト数
  likes?: number       // いいね数
  authorId?: string    // 投稿者ID
  authorName?: string  // 投稿者名
  authorIcon?: string  // 投稿者アイコン
  registeredAt?: string // 動画投稿日時
}


// マイリスト構造
export interface Mylist {
  id: string           // マイリストID (UUID)
  name: string         // マイリスト名
  description?: string // 説明（オプション）
  createdAt: number    // 作成日時（タイムスタンプ）
  updatedAt: number    // 更新日時（タイムスタンプ）
  videoCount: number   // 動画数
}

// マイリスト内の動画
export interface MylistVideo {
  id: string           // 動画ID (例: sm12345)
  mylistId: string     // 所属マイリストID
  title: string        // 動画タイトル
  thumbURL: string     // サムネイルURL
  addedAt: number      // 追加日時（タイムスタンプ）
  memo?: string        // メモ（オプション）
  orderIndex?: number  // 並び順インデックス（オプション）
  
  // 追加情報（オプション）
  views?: number       // 再生数
  comments?: number    // コメント数
  mylists?: number     // マイリスト数
  likes?: number       // いいね数
  authorName?: string  // 投稿者名
  authorId?: string    // 投稿者ID
  authorIcon?: string  // 投稿者アイコンURL
  registeredAt?: string // 動画投稿日時
  duration?: number    // 動画の再生時間（秒単位）
}


// ストレージ統計情報
export interface StorageStats {
  favoriteCount: number
  historyCount: number
  mylistCount: number
  totalVideoCount: number
  storageUsed: number  // バイト数
  storageQuota: number // バイト数
  lastUpdated: number
}

// マイリスト並び替えオプション
export type MylistSortOrder = 
  | 'createdAt-desc'    // 作成日（新しい順）
  | 'createdAt-asc'     // 作成日（古い順）
  | 'updatedAt-desc'    // 更新日（新しい順）
  | 'updatedAt-asc'     // 更新日（古い順）
  | 'name-asc'          // 名前（昇順）
  | 'name-desc'         // 名前（降順）
  | 'videoCount-desc'   // 動画数（多い順）
  | 'videoCount-asc'    // 動画数（少ない順）

// マイリストソート設定
export interface MylistSortConfig {
  order: MylistSortOrder
  lastUpdated?: number  // 設定更新日時
}

// カスタムランキング関連型定義（IndexedDB用）
import type { RankingGenre } from '@/types/ranking-config'

// タグ条件の演算子
export type TagOperator = 'AND' | 'OR' | 'NOT'

// IndexedDB用カスタムランキング
export interface CustomRankingIndexedDB {
  id: string                    // UUID (Primary Key)
  title: string                 // ユーザー定義タイトル
  baseGenre: RankingGenre       // ベースジャンル
  createdAt: number            // 作成日時
  updatedAt: number            // 更新日時
  orderIndex: number           // 表示順序（統合）
  isVisible: boolean           // 表示/非表示（統合）
}

// IndexedDB用カスタムランキング条件
export interface CustomRankingConditionIndexedDB {
  id: string                   // UUID (Primary Key)
  rankingId: string           // 関連するランキングID
  tag: string                 // タグ名
  operator: TagOperator       // 演算子
  tagType: 'lock' | 'user' | 'both' // タグ種別
  orderIndex: number          // 条件内の順序
}

// 条件付きカスタムランキング（クエリ結果用）
export interface CustomRankingWithConditions extends CustomRankingIndexedDB {
  conditions: CustomRankingConditionIndexedDB[]
}

// カスタムランキング並び替えオプション
export type CustomRankingSortOrder = 
  | 'orderIndex-asc'        // 表示順序（昇順）
  | 'createdAt-desc'        // 作成日（新しい順）
  | 'createdAt-asc'         // 作成日（古い順）
  | 'updatedAt-desc'        // 更新日（新しい順）
  | 'updatedAt-asc'         // 更新日（古い順）
  | 'title-asc'             // タイトル（昇順）
  | 'title-desc'            // タイトル（降順）

// カスタムランキング作成データ
export interface CreateCustomRankingData {
  title: string
  baseGenre: RankingGenre
  conditions: Omit<CustomRankingConditionIndexedDB, 'id' | 'rankingId'>[]
}

// カスタムランキング更新データ
export interface UpdateCustomRankingData {
  title?: string
  baseGenre?: RankingGenre
  isVisible?: boolean
  conditions?: Omit<CustomRankingConditionIndexedDB, 'id' | 'rankingId'>[]
}