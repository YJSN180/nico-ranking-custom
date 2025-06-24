// Server-side NG list management using Cloudflare KV
import { kv } from './simple-kv'
import type { NGList } from '@/types/ng-list'
import { migrateLegacyNGList, createEmptyNGList } from './ng-list-migration'

// NGリストのメモリキャッシュ
let ngListCache: { data: NGList, timestamp: number } | null = null
const NG_CACHE_TTL = 10 * 60 * 1000 // 10分間

// Get NG list from KV
export async function getServerNGList(): Promise<NGList> {
  // メモリキャッシュから確認
  if (ngListCache && Date.now() - ngListCache.timestamp < NG_CACHE_TTL) {
    return ngListCache.data
  }
  
  try {
    const [manual, derived] = await Promise.all([
      kv.get<any>('ng-list-manual'),
      kv.get<string[]>('ng-list-derived')
    ])
    
    // マイグレーション処理を適用
    const migratedManual = migrateLegacyNGList(manual)
    
    const result = {
      ...migratedManual,
      derivedVideoIds: derived || []
    }
    
    // メモリキャッシュに保存
    ngListCache = { data: result, timestamp: Date.now() }
    
    return result
  } catch (error) {
    // Failed to get NG list from KV - returning empty list
    const empty = createEmptyNGList()
    ngListCache = { data: empty, timestamp: Date.now() }
    return empty
  }
}

// Save manual NG list to KV
export async function saveServerManualNGList(ngList: Omit<NGList, 'derivedVideoIds'>): Promise<void> {
  try {
    await kv.set('ng-list-manual', ngList)
  } catch (error) {
    // Failed to save NG list to KV
    throw error
  }
}

// Add to derived NG list in KV
export async function addToServerDerivedNGList(videoIds: string[]): Promise<void> {
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
  try {
    await kv.set('ng-list-derived', [])
  } catch (error) {
    console.error('Failed to clear derived NG list:', error)
    throw error
  }
}