// NGリストのフィルタリング機能
// 現在はローカルストレージを使用（サーバーサイドでは無効）
import type { NGList, NGFilterResult } from '@/types/ng-list'
import type { RankingItem } from '@/types/ranking'
import { createEmptyNGList, migrateLegacyNGList } from './ng-list-migration'

// デフォルトの空のNGリスト
const DEFAULT_NG_LIST: NGList = createEmptyNGList()

// NGリストのメモリキャッシュ
let ngListCache: NGList | null = null
let ngListCacheTime = 0
const CACHE_DURATION = 60000 // 1分間キャッシュ

// NGリストを取得（サーバーサイドでは常にデフォルト値を返す）
export async function getNGList(): Promise<NGList> {
  // サーバーサイドでは常にデフォルト値を返す
  if (typeof window === 'undefined') {
    return DEFAULT_NG_LIST
  }
  
  // キャッシュが有効な場合はキャッシュから返す
  if (ngListCache && Date.now() - ngListCacheTime < CACHE_DURATION) {
    return ngListCache
  }
  
  try {
    // クライアントサイドではローカルストレージから取得
    const stored = localStorage.getItem('ng-list')
    if (stored) {
      const parsed = JSON.parse(stored)
      // マイグレーション処理を適用
      ngListCache = migrateLegacyNGList(parsed)
      ngListCacheTime = Date.now()
      return ngListCache
    }
  } catch (error) {
    // エラーは無視
  }
  
  return DEFAULT_NG_LIST
}

// 手動NGリストを保存（クライアントサイドのみ）
export async function saveManualNGList(ngList: Omit<NGList, 'derivedVideoIds'>): Promise<void> {
  if (typeof window === 'undefined') {
    return
  }
  
  try {
    const current = await getNGList()
    const updated = {
      ...current,
      ...ngList
    }
    localStorage.setItem('ng-list', JSON.stringify(updated))
    // キャッシュを無効化
    ngListCache = null
    ngListCacheTime = 0
  } catch (error) {
    // エラーは無視
  }
}

// 派生NGリストに追加（クライアントサイドのみ）
export async function addToDerivedNGList(videoIds: string[]): Promise<void> {
  if (videoIds.length === 0 || typeof window === 'undefined') return
  
  try {
    const current = await getNGList()
    const currentDerived = current.derivedVideoIds || []
    const newSet = new Set([...currentDerived, ...videoIds])
    const updated = {
      ...current,
      derivedVideoIds: Array.from(newSet)
    }
    localStorage.setItem('ng-list', JSON.stringify(updated))
    // キャッシュを無効化
    ngListCache = null
    ngListCacheTime = 0
  } catch (error) {
    // エラーは無視
  }
}

// ランキングアイテムをフィルタリング
export async function filterRankingItems(items: RankingItem[]): Promise<NGFilterResult> {
  const ngList = await getNGList()
  
  // 新しいfilterWithNGList関数を使用
  const { filterWithNGList } = await import('./filter-with-ng-list')
  const result = filterWithNGList(items, ngList)
  
  // 非同期で派生NGリストを更新
  if (result.newDerivedIds.length > 0) {
    addToDerivedNGList(result.newDerivedIds).catch(() => {
      // エラーは無視
    })
  }
  
  return {
    filteredItems: result.filteredItems,
    newDerivedIds: result.newDerivedIds
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