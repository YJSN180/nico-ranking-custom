// Server-side NG list management using Cloudflare KV
import { kv } from './simple-kv'
import type { NGList } from '@/types/ng-list'
import { migrateLegacyNGList, createEmptyNGList } from './ng-list-migration'

// 管理者NGリストの短期メモリキャッシュ（検索リアルタイム統合計画 S1 / P2）
// 検索・SSRのたびに KV を2読み（REST往復）していたのを、関数インスタンス内で
// 60秒だけ再利用する。書き込み時は invalidate する。テスト環境では無効。
const NG_LIST_CACHE_TTL_MS = 60_000
let ngListCache: { value: NGList; fetchedAt: number } | null = null

export function invalidateServerNGListCache(): void {
  ngListCache = null
}

// Get NG list from KV
export async function getServerNGList(): Promise<NGList> {
  const cacheEnabled = process.env.NODE_ENV !== 'test'
  if (cacheEnabled && ngListCache && Date.now() - ngListCache.fetchedAt < NG_LIST_CACHE_TTL_MS) {
    return ngListCache.value
  }
  try {
    const [manual, derived] = await Promise.all([
      kv.get<any>('ng-list-manual'),
      kv.get<string[]>('ng-list-derived')
    ])
    
    // マイグレーション処理を適用
    const migratedManual = migrateLegacyNGList(manual)
    
    const value: NGList = {
      ...migratedManual,
      derivedVideoIds: derived || []
    }
    if (cacheEnabled) {
      ngListCache = { value, fetchedAt: Date.now() }
    }
    return value
  } catch (error) {
    // Failed to get NG list from KV - returning empty list
    return createEmptyNGList()
  }
}

// Save manual NG list to KV
export async function saveServerManualNGList(ngList: Omit<NGList, 'derivedVideoIds'>): Promise<void> {
  invalidateServerNGListCache()
  try {
    await kv.set('ng-list-manual', ngList)
  } catch (error) {
    // Failed to save NG list to KV
    throw error
  }
}

// Add to derived NG list in KV
export async function addToServerDerivedNGList(videoIds: string[]): Promise<void> {
  invalidateServerNGListCache()
  if (videoIds.length === 0) return
  
  try {
    const current = await kv.get<string[]>('ng-list-derived') || []
    const newSet = new Set([...current, ...videoIds])
    await kv.set('ng-list-derived', Array.from(newSet))
  } catch (error) {
    // Failed to update derived NG list
    throw error
  }
}

// Get manual NG list
export async function getNGListManual(): Promise<Omit<NGList, 'derivedVideoIds'>> {
  try {
    const manual = await kv.get<any>('ng-list-manual')
    
    if (!manual) {
      const empty = createEmptyNGList()
      const { derivedVideoIds, ...manualOnly } = empty
      return manualOnly
    }
    
    // マイグレーション処理を適用
    const migrated = migrateLegacyNGList(manual)
    const { derivedVideoIds, ...manualOnly } = migrated
    return manualOnly
  } catch (error) {
    console.error('Failed to get manual NG list:', error)
    const empty = createEmptyNGList()
    const { derivedVideoIds, ...manualOnly } = empty
    return manualOnly
  }
}

// Set manual NG list
export async function setNGListManual(ngList: Omit<NGList, 'derivedVideoIds'>): Promise<void> {
  invalidateServerNGListCache()
  return saveServerManualNGList(ngList)
}

// Get derived NG list
export async function getServerDerivedNGList(): Promise<string[]> {
  try {
    const derived = await kv.get<string[]>('ng-list-derived')
    return derived || []
  } catch (error) {
    console.error('Failed to get derived NG list:', error)
    return []
  }
}

// Clear derived NG list
export async function clearServerDerivedNGList(): Promise<void> {
  invalidateServerNGListCache()
  try {
    await kv.set('ng-list-derived', [])
  } catch (error) {
    console.error('Failed to clear derived NG list:', error)
    throw error
  }
}