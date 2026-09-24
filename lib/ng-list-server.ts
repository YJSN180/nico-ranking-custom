// Server-side NG list management using Cloudflare KV
import { kv } from './simple-kv'
import type { NGList } from '@/types/ng-list'
import { migrateLegacyNGList, createEmptyNGList } from './ng-list-migration'
import { collectAutoNg, mergeAutoNgIntoList } from './lqng/merge'
import { invalidateLqngCache, isLqngEnabled, loadLqngConfig, loadLqngVerdicts } from './lqng/server'
import type { AutoNgSets } from './lqng/types'

// 管理者NGリストの短期メモリキャッシュ（検索リアルタイム統合計画 S1 / P2）
// 検索・SSRのたびに KV を2読み（REST往復）していたのを、関数インスタンス内で
// 60秒だけ再利用する。書き込み時は invalidate する。テスト環境では無効。
// 読み取りは 1 回だけ試し、失敗したら直前の成功値（無ければ空）を返す。失敗のあと 10 秒は
// KV を読まずに同じ値を返し、自動NG だけが代替値だった一覧も 10 秒だけ持つ（障害中にリクエストのたび読まない）。
const NG_LIST_CACHE_TTL_MS = 60_000
/** 読み取りに失敗したあと、KV を読み直さずに代替値を返す間隔。自動NG が代替値だった一覧もこの間だけ持つ */
const RETRY_AFTER_FAILURE_MS = 10_000
let ngListCache: { value: NGList; expiresAt: number } | null = null
/** 直前に読み取りに成功した値（失敗時の代替。キャッシュの無効化では消さない） */
let lastGoodNGList: NGList | null = null
let retryAt = 0

/** 手動 NG の 4 項目 */
export type ManualNGList = Pick<NGList, 'videoIds' | 'videoTitles' | 'authorIds' | 'authorNames'>

export function invalidateServerNGListCache(): void {
  ngListCache = null
  retryAt = 0
  invalidateLqngCache()
}

/** テスト用: キャッシュと直前の成功値をすべて捨てる */
export function resetServerNGListState(): void {
  invalidateServerNGListCache()
  lastGoodNGList = null
}

/** 手動 NG の 4 項目だけを取り出す（合流済みの自動 NG などを手動として扱わない） */
export function pickManualNGList(list: ManualNGList): ManualNGList {
  return { videoIds: list.videoIds, videoTitles: list.videoTitles, authorIds: list.authorIds, authorNames: list.authorNames }
}

const toStringArray = (value: unknown): string[] =>
  Array.isArray(value) ? value.filter((id): id is string => typeof id === 'string') : []

// 手動 NG と派生 NG を読む。未設定（404）は空、読み取り失敗は例外（空の一覧と取り違えない）
async function readManualAndDerived(attempts?: number): Promise<NGList> {
  const [manual, derived] = await Promise.all([
    kv.getStrict<unknown>('ng-list-manual', { attempts }),
    kv.getStrict<unknown>('ng-list-derived', { attempts }),
  ])
  // マイグレーション処理を適用
  return { ...pickManualNGList(migrateLegacyNGList(manual)), derivedVideoIds: toStringArray(derived) }
}

// 粗悪コンテンツ自動NG（lib/lqng）: Worker が書く判定テーブルから、許可リストを除いた
// 投稿者 ID・動画 ID を取り出す。失敗時や無効時は空（サービスを落とさない）。
// ok=false は読み取りに失敗して代替値を使ったこと（その結果はキャッシュしない）
async function loadAutoNg(): Promise<{ sets: AutoNgSets; ok: boolean }> {
  if (!isLqngEnabled()) return { sets: { authorIds: [], videoIds: [] }, ok: true }
  try {
    const [config, verdicts] = await Promise.all([loadLqngConfig(), loadLqngVerdicts()])
    return { sets: collectAutoNg(verdicts.value, config.value, new Date()), ok: config.ok && verdicts.ok }
  } catch {
    return { sets: { authorIds: [], videoIds: [] }, ok: false }
  }
}

// Get NG list from KV
export async function getServerNGList(): Promise<NGList> {
  const cacheEnabled = process.env.NODE_ENV !== 'test'
  const now = Date.now()
  if (cacheEnabled && ngListCache && now < ngListCache.expiresAt) {
    return ngListCache.value
  }
  if (cacheEnabled && now < retryAt) {
    return lastGoodNGList ?? createEmptyNGList()
  }
  const autoPromise = loadAutoNg()
  let base: NGList
  try {
    // 1 回だけ試す（失敗したら代替値ですぐ応答し、再試行の待ちをリクエストに乗せない）
    base = await readManualAndDerived(1)
  } catch {
    retryAt = Date.now() + RETRY_AFTER_FAILURE_MS
    return lastGoodNGList ?? createEmptyNGList()
  }
  const auto = await autoPromise
  // 自動NGは手動リストより後に評価される（ng-filter-core）。何も無ければ欄自体を足さない
  const value = auto.sets.authorIds.length > 0 || auto.sets.videoIds.length > 0 ? mergeAutoNgIntoList(base, auto.sets) : base
  // 手動・派生は読めているので直前の成功値にする（自動NG の部分は lqng 側の直前の成功値か空）
  lastGoodNGList = value
  retryAt = 0
  if (cacheEnabled) {
    // 自動NG が代替値だったときは短くだけ持ち、回復したら早めに合流し直す
    ngListCache = { value, expiresAt: Date.now() + (auto.ok ? NG_LIST_CACHE_TTL_MS : RETRY_AFTER_FAILURE_MS) }
  }
  return value
}

/**
 * 管理画面用: キャッシュを通さずに手動 NG（4 項目）と派生 NG を読む。
 * 読み取りに失敗したら例外にする（空の一覧を返して、それを土台に保存させない）
 */
export async function getAdminNGList(): Promise<NGList> {
  return readManualAndDerived()
}

// Save manual NG list to KV
export async function saveServerManualNGList(ngList: Omit<NGList, 'derivedVideoIds'>): Promise<void> {
  invalidateServerNGListCache()
  try {
    await kv.set('ng-list-manual', ngList)
    invalidateServerNGListCache()
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
    // 読み取りに失敗したら例外にする（空とみなして追加分だけで上書きしない）
    const current = toStringArray(await kv.getStrict<unknown>('ng-list-derived'))
    const newSet = new Set([...current, ...videoIds])
    await kv.set('ng-list-derived', Array.from(newSet))
    invalidateServerNGListCache()
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
    invalidateServerNGListCache()
  } catch (error) {
    console.error('Failed to clear derived NG list:', error)
    throw error
  }
}