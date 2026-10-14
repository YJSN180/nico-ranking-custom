// Server-side NG list management using Cloudflare KV
import { kv } from './simple-kv'
import type { NGList } from '@/types/ng-list'
import { migrateLegacyNGList, createEmptyNGList } from './ng-list-migration'

/** 手動 NG の 4 項目 */
export type ManualNGList = Pick<NGList, 'videoIds' | 'videoTitles' | 'authorIds' | 'authorNames'>

/** 手動 NG の 4 項目だけを取り出す（保存済みレコードの余分な欄を手動として扱わない） */
function pickManualNGList(list: ManualNGList): ManualNGList {
  return { videoIds: list.videoIds, videoTitles: list.videoTitles, authorIds: list.authorIds, authorNames: list.authorNames }
}

const toStringArray = (value: unknown): string[] =>
  Array.isArray(value) ? value.filter((id): id is string => typeof id === 'string') : []

// Get NG list from KV
export async function getServerNGList(): Promise<NGList> {
  try {
    const [manual, derived] = await Promise.all([
      kv.get<any>('ng-list-manual'),
      kv.get<string[]>('ng-list-derived')
    ])
    
    // マイグレーション処理を適用
    const migratedManual = migrateLegacyNGList(manual)
    
    return {
      ...migratedManual,
      derivedVideoIds: derived || []
    }
  } catch (error) {
    // Failed to get NG list from KV - returning empty list
    return createEmptyNGList()
  }
}

/**
 * 管理画面用: 手動 NG（4 項目）と派生 NG を読む。未設定（404）は空。
 * 読み取りに失敗したら例外にする（空の一覧を返して、それを土台に保存させない）
 */
export async function getAdminNGList(): Promise<NGList> {
  const [manual, derived] = await Promise.all([
    kv.getStrict<unknown>('ng-list-manual'),
    kv.getStrict<unknown>('ng-list-derived'),
  ])
  // マイグレーション処理を適用
  return { ...pickManualNGList(migrateLegacyNGList(manual)), derivedVideoIds: toStringArray(derived) }
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
    // 読み取りに失敗したら例外にする（空とみなして追加分だけで上書きしない）
    const current = toStringArray(await kv.getStrict<unknown>('ng-list-derived'))
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