export interface NGList {
  // 手動で設定したNGリスト
  videoIds: string[]      // 動画ID（例: "sm12345"）
  videoTitles: string[]   // 動画タイトル（完全一致）
  authorIds: string[]     // 投稿者ID
  authorNames: string[]   // 投稿者名（完全一致）
  
  // 自動追加されたNGリスト（派生NG）
  derivedVideoIds: string[] // 他の条件でNGされた動画ID
}

export interface NGFilterResult {
  filteredItems: any[]
  newDerivedIds: string[]
  filteredCount?: number
}