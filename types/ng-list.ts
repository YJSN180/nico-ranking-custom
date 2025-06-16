export interface NGList {
  // 手動で設定したNGリスト
  videoIds: string[]      // 動画ID（例: "sm12345"）
  videoTitles: {          // 動画タイトル
    exact: string[]       // 完全一致
    partial: string[]     // 部分一致
  }
  authorIds: string[]     // 投稿者ID
  authorNames: {          // 投稿者名
    exact: string[]       // 完全一致
    partial: string[]     // 部分一致
  }
  
  // 自動追加されたNGリスト（派生NG）は別キーで管理
  derivedVideoIds?: string[] // 互換性のため（オプショナル）
}

export interface NGFilterResult {
  filteredItems: any[]
  newDerivedIds: string[]
  filteredCount?: number
}