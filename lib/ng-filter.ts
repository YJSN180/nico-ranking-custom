import type { NGList, NGFilterResult } from '@/types/ng-list'
import type { RankingItem } from '@/types/ranking'

// デフォルトの空のNGリスト
const DEFAULT_NG_LIST: NGList = {
  videoIds: [],
  videoTitles: [],
  authorIds: [],
  authorNames: [],
  derivedVideoIds: []
}

// NGリストのメモリキャッシュ
let ngListCache: NGList | null = null
let ngListCacheTime = 0
const CACHE_DURATION = 60000 // 1分間キャッシュ

// NGリストを取得（現在は空のリストを返す）
export async function getNGList(): Promise<NGList> {
  // キャッシュが有効な場合はキャッシュから返す
  if (ngListCache && Date.now() - ngListCacheTime < CACHE_DURATION) {
    return ngListCache
  }
  
  // 現在はデフォルトの空のNGリストを返す
  // TODO: Convex DBから取得するように実装
  ngListCache = DEFAULT_NG_LIST
  ngListCacheTime = Date.now()
  
  return DEFAULT_NG_LIST
}

// 手動NGリストを保存（現在は何もしない）
export async function saveManualNGList(ngList: Omit<NGList, 'derivedVideoIds'>): Promise<void> {
  // TODO: Convex DBに保存するように実装
  // キャッシュを無効化
  ngListCache = null
  ngListCacheTime = 0
}

// 派生NGリストに追加（現在は何もしない）
export async function addToDerivedNGList(videoIds: string[]): Promise<void> {
  // TODO: Convex DBに保存するように実装
  // キャッシュを無効化
  ngListCache = null
  ngListCacheTime = 0
}

// ランキングアイテムをフィルタリング
export async function filterRankingItems(items: RankingItem[]): Promise<NGFilterResult> {
  const ngList = await getNGList()
  const newDerivedIds: string[] = []
  
  // 高速検索のためにSetを作成
  const videoIdSet = new Set([...ngList.videoIds, ...ngList.derivedVideoIds])
  const titleSet = new Set(ngList.videoTitles)
  const authorIdSet = new Set(ngList.authorIds)
  const authorNameSet = new Set(ngList.authorNames)
  
  const filteredItems = items.filter((item, index) => {
    // 既にNGリストにある場合
    if (videoIdSet.has(item.id)) {
      return false
    }
    
    // タイトルでチェック（完全一致）
    if (titleSet.has(item.title)) {
      newDerivedIds.push(item.id)
      return false
    }
    
    // 投稿者IDでチェック
    if (item.authorId && authorIdSet.has(item.authorId)) {
      newDerivedIds.push(item.id)
      return false
    }
    
    // 投稿者名でチェック（完全一致）
    if (item.authorName && authorNameSet.has(item.authorName)) {
      newDerivedIds.push(item.id)
      return false
    }
    
    return true
  })
  
  // 順位を詰める
  const rerankedItems = filteredItems.map((item, index) => ({
    ...item,
    rank: index + 1
  }))
  
  // 非同期で派生NGリストを更新
  if (newDerivedIds.length > 0) {
    addToDerivedNGList(newDerivedIds).catch(() => {
      // エラーは無視
    })
  }
  
  return {
    filteredItems: rerankedItems,
    newDerivedIds
  }
}

// ランキングデータをフィルタリング（既存の形式に合わせる）
export async function filterRankingData(data: { items: RankingItem[], popularTags?: string[] }) {
  const result = await filterRankingItems(data.items)
  return {
    items: result.filteredItems,
    popularTags: data.popularTags
  }
}