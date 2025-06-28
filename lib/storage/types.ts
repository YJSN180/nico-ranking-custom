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

// 視聴履歴データ構造
export interface WatchHistory {
  id: string           // 動画ID
  title: string        // 動画タイトル
  thumbURL: string     // サムネイルURL
  watchedAt: number    // 視聴日時
  watchCount: number   // 視聴回数
  lastWatched: number  // 最終視聴日時
  
  // 追加の動画情報（視聴時に保存）
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
  
  // 追加情報（オプション）
  views?: number       // 再生数
  comments?: number    // コメント数
  mylists?: number     // マイリスト数
  likes?: number       // いいね数
  authorName?: string  // 投稿者名
  authorId?: string    // 投稿者ID
  authorIcon?: string  // 投稿者アイコンURL
  registeredAt?: string // 動画投稿日時
}

// 動画データ（マイリストに追加する際の構造）
export interface Video {
  id: string           // 動画ID
  title: string        // 動画タイトル
  thumbURL: string     // サムネイルURL
  viewCount: number    // 再生数
  commentCount: number // コメント数
  mylistCount: number  // マイリスト数
  duration: number     // 再生時間（秒）
  authorName: string   // 投稿者名
  authorId: string     // 投稿者ID
  registeredAt: string // 動画投稿日時
  tags: string[]       // タグ
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