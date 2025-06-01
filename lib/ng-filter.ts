import { kv } from '@vercel/kv'
import type { NGList, NGFilterResult } from '@/types/ng-list'
import type { RankingItem } from '@/types/ranking'

// NGリストのキー
const NG_LIST_MANUAL_KEY = 'ng-list-manual'
const NG_LIST_DERIVED_KEY = 'ng-list-derived'

// デフォルトの空のNGリスト
const DEFAULT_NG_LIST: NGList = {
  videoIds: [],
  videoTitles: [],
  authorIds: [],
  authorNames: [],
  derivedVideoIds: []
}

// NGリストを取得
export async function getNGList(): Promise<NGList> {
  try {
    const [manual, derived] = await Promise.all([
      kv.get<Omit<NGList, 'derivedVideoIds'>>(NG_LIST_MANUAL_KEY),
      kv.get<string[]>(NG_LIST_DERIVED_KEY)
    ])
    
    return {
      ...DEFAULT_NG_LIST,
      ...(manual || {}),
      derivedVideoIds: derived || []
    }
  } catch (error) {
    // エラーは無視してデフォルト値を返す
    return DEFAULT_NG_LIST
  }
}

// 手動NGリストを保存
export async function saveManualNGList(ngList: Omit<NGList, 'derivedVideoIds'>): Promise<void> {
  await kv.set(NG_LIST_MANUAL_KEY, ngList)
}

// 派生NGリストに追加
export async function addToDerivedNGList(videoIds: string[]): Promise<void> {
  if (videoIds.length === 0) return
  
  try {
    const existing = await kv.get<string[]>(NG_LIST_DERIVED_KEY) || []
    const newSet = new Set([...existing, ...videoIds])
    await kv.set(NG_LIST_DERIVED_KEY, Array.from(newSet))
  } catch (error) {
    // エラーは無視
  }
}

// ランキングアイテムをフィルタリング
export async function filterRankingItems(items: RankingItem[]): Promise<NGFilterResult> {
  const ngList = await getNGList()
  const newDerivedIds: string[] = []
  
  const filteredItems = items.filter((item, index) => {
    // 既にNGリストにある場合
    if (ngList.videoIds.includes(item.id) || 
        ngList.derivedVideoIds.includes(item.id)) {
      return false
    }
    
    // タイトルでチェック（完全一致）
    if (ngList.videoTitles.includes(item.title)) {
      newDerivedIds.push(item.id)
      return false
    }
    
    // 投稿者IDでチェック
    if (item.authorId && ngList.authorIds.includes(item.authorId)) {
      newDerivedIds.push(item.id)
      return false
    }
    
    // 投稿者名でチェック（完全一致）
    if (item.authorName && ngList.authorNames.includes(item.authorName)) {
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