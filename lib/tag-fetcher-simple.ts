/**
 * ニコニコ動画の固定タグを取得するためのシンプルなモジュール
 * getthumbinfo APIのみを使用
 * KVベースのタグキャッシュでAPI呼び出しを最小化
 */

import type { RankingItem, TagDetail } from '../types/ranking'
import { kv } from './simple-kv'
import { reportPipelineProgress } from './pipeline/stall-watchdog'
import {
  TAG_CACHE_TTL_SECONDS,
  type TagCacheByShard,
  type TagCacheEntry,
  type TagCacheShard,
  type TagSource,
  describeStorageError,
  getShardIdFromKey,
  getShardKeyForVideoId,
  getTagCacheBackend,
  readTagCacheShard,
  recordTagCacheDelta,
} from './tag-cache-store'

export type { TagDetail } from '../types/ranking'

/**
 * タグ取得の統計情報
 */
export interface TagFetchRunStats {
  startedAt: string
  completedAt: string
  totalItems: number
  itemsWithTags: number
  cacheHits: number
  cacheRate: number
  nicologFetches: number
  nicologSuccesses: number
  nicologFailures: Record<string, number>
  thumbFetches: number
  thumbSuccesses: number
  thumbFailures: Record<string, number>
}

// モジュールレベルの統計情報
let runStats: TagFetchRunStats = createEmptyStats()

function createEmptyStats(): TagFetchRunStats {
  return {
    startedAt: new Date().toISOString(),
    completedAt: '',
    totalItems: 0,
    itemsWithTags: 0,
    cacheHits: 0,
    cacheRate: 0,
    nicologFetches: 0,
    nicologSuccesses: 0,
    nicologFailures: {},
    thumbFetches: 0,
    thumbSuccesses: 0,
    thumbFailures: {},
  }
}

export function getTagFetchRunStats(): TagFetchRunStats {
  return {
    ...runStats,
    completedAt: new Date().toISOString(),
    cacheRate: runStats.totalItems > 0 ? runStats.cacheHits / runStats.totalItems : 0,
  }
}

export function resetTagFetchRunStats(): void {
  runStats = createEmptyStats()
  if (getTagCacheBackend() === 'r2-aggregate') {
    for (const key of Object.keys(memoryCacheByShard)) delete memoryCacheByShard[key]
    for (const key of Object.keys(memoryCacheLoadedAt)) delete memoryCacheLoadedAt[key]
  }
}

type TagFetchResult = { ok: true; tags: TagDetail[] } | { ok: false; reason: string }

const isTagFetchFailure = (result: TagFetchResult): result is { ok: false; reason: string } => {
  return !result.ok
}

// モジュールレベルのキャッシュ（メモリ内）
const memoryCacheByShard: TagCacheByShard = {}
const memoryCacheLoadedAt: Record<string, number> = {}
const MEMORY_CACHE_MAX_AGE_MS = 5 * 60 * 1000 // 5分でリロード
const SUCCESS_TTL_MS = TAG_CACHE_TTL_SECONDS * 1000
const FAIL_TTL_MS = 6 * 60 * 60 * 1000 // 6時間

const DEFAULT_NICOLOG_CONCURRENCY = parseInt(process.env.TAG_FETCH_NICOLOG_CONCURRENCY || '2', 10)
const DEFAULT_NICOLOG_MIN_INTERVAL_MS = parseInt(process.env.TAG_FETCH_NICOLOG_MIN_INTERVAL_MS || '500', 10)
const DEFAULT_THUMB_CONCURRENCY = parseInt(process.env.TAG_FETCH_GETTHUMB_CONCURRENCY || '10', 10)
const DEFAULT_THUMB_MIN_INTERVAL_MS = parseInt(process.env.TAG_FETCH_GETTHUMB_MIN_INTERVAL_MS || '150', 10)
const DEFAULT_NICOLOG_TIMEOUT_MS = parseInt(process.env.TAG_FETCH_NICOLOG_TIMEOUT_MS || '8000', 10)
const DEFAULT_THUMB_TIMEOUT_MS = parseInt(process.env.TAG_FETCH_GETTHUMB_TIMEOUT_MS || '5000', 10)

// A healthy full load takes 1-2 minutes even sequentially; past this, continue without the rest.
const DEFAULT_TAG_CACHE_LOAD_BUDGET_MS = 3 * 60_000
const DEFAULT_TAG_CACHE_LOAD_CONCURRENCY = 4
const TAG_CACHE_LOAD_PROGRESS_INTERVAL_MS = 10_000

function readPositiveIntEnv(name: string, fallback: number): number {
  const value = Number.parseInt(process.env[name] ?? '', 10)
  return Number.isFinite(value) && value > 0 ? value : fallback
}

let currentTagFetchContext: string | null = null

export function setTagFetchContext(label: string | null): void {
  currentTagFetchContext = label
}

function decodeHtmlEntities(text: string): string {
  return text
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&#39;/g, "'")
}

function getShardKey(videoId: string): string {
  return getShardKeyForVideoId(videoId)
}

async function fetchWithTimeout(url: string, options: RequestInit, timeoutMs: number): Promise<Response> {
  // The signal must remain active while the caller consumes the response body.
  return fetch(url, { ...options, signal: AbortSignal.timeout(timeoutMs) })
}

function isFreshSuccess(entry: TagCacheEntry, now: number): boolean {
  if (!entry.tags || entry.tags.length === 0 || !entry.fetchedAt) return false
  const fetchedAt = Date.parse(entry.fetchedAt)
  return Number.isFinite(fetchedAt) && (now - fetchedAt) < SUCCESS_TTL_MS
}

function isFreshFailure(entry: TagCacheEntry, now: number, source: TagSource): boolean {
  if (!entry.fail || entry.fail.source !== source || !entry.fail.at) return false
  const failedAt = Date.parse(entry.fail.at)
  return Number.isFinite(failedAt) && (now - failedAt) < FAIL_TTL_MS
}

function addFailureToCache(cacheByShard: TagCacheByShard, shardKey: string, videoId: string, source: TagSource, reason?: string): void {
  const shard = cacheByShard[shardKey] || {}
  const existing = shard[videoId]
  if (existing && existing.tags && existing.tags.length > 0) {
    return
  }
  shard[videoId] = {
    tags: [],
    fetchedAt: new Date().toISOString(),
    source,
    fail: {
      source,
      at: new Date().toISOString(),
      reason
    }
  }
  cacheByShard[shardKey] = shard
}

function addToCache(cacheByShard: TagCacheByShard, shardKey: string, videoId: string, tags: TagDetail[], source: TagSource): void {
  const shard = cacheByShard[shardKey] || {}
  shard[videoId] = {
    tags,
    fetchedAt: new Date().toISOString(),
    source
  }
  cacheByShard[shardKey] = shard
}

function createRateLimitedQueue(concurrency: number, minIntervalMs: number) {
  let active = 0
  let lastStart = 0
  const queue: Array<{
    fn: () => Promise<any>
    resolve: (value: any) => void
    reject: (reason?: any) => void
  }> = []

  const runNext = () => {
    if (active >= concurrency || queue.length === 0) return
    const task = queue.shift()
    if (!task) return
    active++

    const now = Date.now()
    const wait = Math.max(0, minIntervalMs - (now - lastStart))
    lastStart = now + wait

    setTimeout(async () => {
      try {
        const result = await task.fn()
        task.resolve(result)
      } catch (error) {
        task.reject(error)
      } finally {
        active--
        runNext()
      }
    }, wait)
  }

  return <T>(fn: () => Promise<T>): Promise<T> => {
    return new Promise((resolve, reject) => {
      queue.push({ fn, resolve, reject })
      runNext()
    })
  }
}

/**
 * Reads shards with bounded concurrency. Once the load budget is spent, returns what was
 * read so far; results that arrive later are ignored.
 */
async function readShardsWithinBudget(shardKeys: string[]): Promise<Map<string, TagCacheShard>> {
  const budgetMs = readPositiveIntEnv('TAG_CACHE_LOAD_BUDGET_MS', DEFAULT_TAG_CACHE_LOAD_BUDGET_MS)
  const concurrency = Math.min(
    readPositiveIntEnv('TAG_CACHE_LOAD_CONCURRENCY', DEFAULT_TAG_CACHE_LOAD_CONCURRENCY),
    shardKeys.length,
  )
  const startedAt = Date.now()
  const loaded = new Map<string, TagCacheShard>()
  const inFlight = new Map<string, number>()
  const counts = { found: 0, missing: 0, failed: 0, entries: 0 }
  let nextIndex = 0
  let budgetReached = false

  const describeProgress = (): string => {
    const now = Date.now()
    const settled = counts.found + counts.missing + counts.failed
    const oldest = [...inFlight.entries()]
      .sort((a, b) => a[1] - b[1])
      .slice(0, 3)
      .map(([shardKey, since]) => `shard ${getShardIdFromKey(shardKey)} ${Math.round((now - since) / 1000)}s`)
    return `${settled}/${shardKeys.length} shards settled ` +
      `(found ${counts.found}, missing ${counts.missing}, failed ${counts.failed}), ${counts.entries} entries, ` +
      `${inFlight.size} in flight${oldest.length > 0 ? ` (waiting on ${oldest.join(', ')})` : ''}, ` +
      `${((now - startedAt) / 1000).toFixed(1)}s elapsed`
  }

  const readNextShards = async (): Promise<void> => {
    while (!budgetReached && nextIndex < shardKeys.length) {
      const shardKey = shardKeys[nextIndex]
      nextIndex += 1
      inFlight.set(shardKey, Date.now())
      try {
        const shard = await readTagCacheShard(shardKey)
        if (budgetReached) return
        if (shard) {
          loaded.set(shardKey, shard)
          counts.found += 1
          counts.entries += Object.keys(shard).length
        } else {
          counts.missing += 1
        }
      } catch (error: unknown) {
        if (budgetReached) return
        counts.failed += 1
        console.warn(
          `[Tag Cache] Shard ${getShardIdFromKey(shardKey)} could not be loaded (${describeStorageError(error)}); ` +
          'its videos use the normal tag fetch path',
        )
      } finally {
        inFlight.delete(shardKey)
        reportPipelineProgress(`tag cache shard ${getShardIdFromKey(shardKey)}`)
      }
    }
  }

  const progressTimer = setInterval(() => {
    console.warn(`[Tag Cache] Loading: ${describeProgress()}`)
  }, TAG_CACHE_LOAD_PROGRESS_INTERVAL_MS)
  progressTimer.unref()
  let budgetTimer: ReturnType<typeof setTimeout> | undefined
  const budgetSpent = new Promise<void>((resolve) => {
    budgetTimer = setTimeout(() => {
      budgetReached = true
      resolve()
    }, budgetMs)
  })

  try {
    await Promise.race([
      Promise.all(Array.from({ length: concurrency }, () => readNextShards())),
      budgetSpent,
    ])
  } finally {
    clearTimeout(budgetTimer)
    clearInterval(progressTimer)
  }

  if (budgetReached) {
    console.warn(
      `[Tag Cache] Load budget of ${Math.round(budgetMs / 1000)}s reached: continuing with ${loaded.size}/${shardKeys.length} shards; ` +
      `${inFlight.size} in flight and ${shardKeys.length - nextIndex} not started use the normal tag fetch path (${describeProgress()})`,
    )
    reportPipelineProgress('tag cache load budget reached')
  } else {
    console.warn(`[Tag Cache] Loaded: ${describeProgress()}`)
  }
  return loaded
}

/**
 * KVからタグキャッシュを読み込む（シャード単位）
 */
async function loadTagCacheForItems(items: RankingItem[]): Promise<{ cacheByShard: TagCacheByShard; shardKeys: string[] }> {
  const now = Date.now()
  const shardKeys = Array.from(new Set(items.map(item => getShardKey(item.id))))
  const cacheByShard: TagCacheByShard = {}
  const shardKeysToRead: string[] = []

  for (const shardKey of shardKeys) {
    const loadedAt = memoryCacheLoadedAt[shardKey]
    // Aggregate jobs publish only after collection; reloading discards this run's fresh entries.
    if (
      memoryCacheByShard[shardKey] && loadedAt &&
      (getTagCacheBackend() === 'r2-aggregate' || (now - loadedAt) < MEMORY_CACHE_MAX_AGE_MS)
    ) {
      cacheByShard[shardKey] = memoryCacheByShard[shardKey]
    } else {
      shardKeysToRead.push(shardKey)
    }
  }

  if (shardKeysToRead.length > 0) {
    const loaded = await readShardsWithinBudget(shardKeysToRead)
    for (const shardKey of shardKeysToRead) {
      // Missing or unreadable shards start empty for this run, as failed reads always have.
      memoryCacheByShard[shardKey] = loaded.get(shardKey) ?? {}
      memoryCacheLoadedAt[shardKey] = now
      cacheByShard[shardKey] = memoryCacheByShard[shardKey]
    }
  }

  return { cacheByShard, shardKeys }
}

/**
 * タグキャッシュをKVに保存する（シャード単位）
 */
async function saveTagCacheShards(cacheByShard: TagCacheByShard, shardKeys: string[]): Promise<void> {
  if (getTagCacheBackend() === 'r2-aggregate') {
    console.warn(`[Tag Cache] Recorded ${shardKeys.length} dirty shards for aggregate R2 merge`)
    return
  }

  for (const shardKey of shardKeys) {
    try {
      await kv.set(shardKey, cacheByShard[shardKey] || {}, { ex: TAG_CACHE_TTL_SECONDS })
      memoryCacheByShard[shardKey] = cacheByShard[shardKey] || {}
      memoryCacheLoadedAt[shardKey] = Date.now()
    } catch (error) {
      console.warn('[Tag Cache] Failed to save shard to KV:', error)
    }
  }
}

/**
 * Nicologからタグを取得（HTML解析）
 */
async function fetchTagsFromNicolog(videoId: string): Promise<TagFetchResult> {
  try {
    const response = await fetchWithTimeout(`https://www.nicolog.jp/watch/${videoId}`, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36',
        'Accept-Language': 'ja,en;q=0.8',
      }
    }, DEFAULT_NICOLOG_TIMEOUT_MS)

    if (!response.ok) {
      return { ok: false, reason: `http_${response.status}` }
    }

    const html = await response.text()
    const tdMatch = html.match(/<td class="tdtag[\s\S]*?<\/td>/)
    if (!tdMatch) {
      return { ok: false, reason: 'no_tag_cell' }
    }

    const tags: TagDetail[] = []
    const seen = new Map<string, TagDetail>()
    const re = /<li class="(genre|lock|tag)"[^>]*>([^<]+)<\/li>/g
    let m: RegExpExecArray | null
    while ((m = re.exec(tdMatch[0]))) {
      const type = m[1]
      if (type === 'genre') continue
      const name = decodeHtmlEntities(m[2]).trim()
      if (!name) continue
      const isLocked = type === 'lock'
      const existing = seen.get(name)
      if (!existing || (isLocked && !existing.isLocked)) {
        const detail = { name, isLocked }
        seen.set(name, detail)
      }
    }

    tags.push(...seen.values())
    if (tags.length === 0) {
      return { ok: false, reason: 'empty' }
    }
    return { ok: true, tags }
  } catch (error: any) {
    if (error?.name === 'AbortError') {
      return { ok: false, reason: 'timeout' }
    }
    return { ok: false, reason: 'network' }
  }
}

/**
 * getthumbinfo APIを使用して固定タグを取得
 * @param videoId 動画ID
 * @returns 固定タグの配列、取得できない場合は空配列
 */
export async function fetchFixedTagsFromGetThumbInfo(videoId: string): Promise<string[]> {
  try {
    const response = await fetchWithTimeout(
      `https://ext.nicovideo.jp/api/getthumbinfo/${videoId}`,
      {},
      DEFAULT_THUMB_TIMEOUT_MS
    )
    
    if (!response.ok) {
      return []
    }
    
    const xml = await response.text()
    
    // エラーレスポンスのチェック
    if (xml.includes('status="fail"')) {
      return []
    }
    
    // 成功レスポンスのチェック
    if (!xml.includes('status="ok"')) {
      return []
    }
    
    // ロックされたタグ（固定タグ）を抽出
    const lockedTagMatches = xml.matchAll(/<tag[^>]*lock="1"[^>]*>([^<]+)<\/tag>/g)
    const lockedTags = Array.from(lockedTagMatches, m => m[1])
    
    return lockedTags
  } catch (error) {
    // エラーは静かに処理（ログ出力なし）
    return []
  }
}

/**
 * getthumbinfo APIを使用してすべてのタグ（ロックタグ＋ユーザータグ）を取得
 * @param videoId 動画ID
 * @returns タグ詳細の配列、取得できない場合は空配列
 */
export async function fetchAllTagsFromGetThumbInfo(videoId: string): Promise<TagDetail[]> {
  try {
    const response = await fetchWithTimeout(
      `https://ext.nicovideo.jp/api/getthumbinfo/${videoId}`,
      {},
      DEFAULT_THUMB_TIMEOUT_MS
    )
    
    if (!response.ok) {
      return []
    }
    
    const xml = await response.text()
    
    // エラーレスポンスのチェック
    if (xml.includes('status="fail"')) {
      return []
    }
    
    // 成功レスポンスのチェック
    if (!xml.includes('status="ok"')) {
      return []
    }
    
    // すべてのタグを抽出（ロック状態も含む）
    const allTagMatches = xml.matchAll(/<tag(\s+lock="1")?[^>]*>([^<]+)<\/tag>/g)
    const tagDetails: TagDetail[] = []
    
    for (const match of allTagMatches) {
      tagDetails.push({
        name: match[2],
        isLocked: match[1] !== undefined
      })
    }
    
    return tagDetails
  } catch (error) {
    // エラーは静かに処理（ログ出力なし）
    return []
  }
}

async function fetchAllTagsFromGetThumbInfoWithStatus(videoId: string): Promise<TagFetchResult> {
  try {
    const response = await fetchWithTimeout(
      `https://ext.nicovideo.jp/api/getthumbinfo/${videoId}`,
      {},
      DEFAULT_THUMB_TIMEOUT_MS
    )
    if (!response.ok) {
      return { ok: false, reason: `http_${response.status}` }
    }
    const xml = await response.text()
    if (xml.includes('status="fail"')) {
      const codeMatch = xml.match(/<code>([^<]+)<\/code>/)
      return { ok: false, reason: codeMatch ? codeMatch[1] : 'status_fail' }
    }
    if (!xml.includes('status="ok"')) {
      return { ok: false, reason: 'status_unknown' }
    }

    const allTagMatches = xml.matchAll(/<tag(\s+lock="1")?[^>]*>([^<]+)<\/tag>/g)
    const tagDetails: TagDetail[] = []
    for (const match of allTagMatches) {
      tagDetails.push({
        name: match[2],
        isLocked: match[1] !== undefined
      })
    }

    if (tagDetails.length === 0) {
      return { ok: false, reason: 'empty' }
    }

    return { ok: true, tags: tagDetails }
  } catch (error: any) {
    if (error?.name === 'AbortError') {
      return { ok: false, reason: 'timeout' }
    }
    return { ok: false, reason: 'network' }
  }
}

/**
 * 複数のランキングアイテムに対して固定タグを一括取得（最適化版）
 * @param items ランキングアイテムの配列
 * @param parallelCount 並列処理数（デフォルト: 50）
 * @param batchDelay バッチ間の遅延（ミリ秒、デフォルト: 50）
 * @returns 固定タグ情報が追加されたランキングアイテムの配列
 */
export async function enrichRankingItemsWithFixedTags(
  items: RankingItem[],
  parallelCount: number = 50,
  batchDelay: number = 50
): Promise<RankingItem[]> {
  const totalItems = items.length
  const startTime = Date.now()
  let processedCount = 0
  let itemsWithTags = 0
  
  // バッチ処理
  const enrichedItems: RankingItem[] = []
  
  for (let i = 0; i < items.length; i += parallelCount) {
    const batch = items.slice(i, i + parallelCount)
    
    const batchPromises = batch.map(async (item) => {
      // 既にタグがある場合はスキップ
      if (item.tags && item.tags.length > 0) {
        return item
      }
      
      const tags = await fetchFixedTagsFromGetThumbInfo(item.id)
      
      if (tags.length > 0) {
        itemsWithTags++
      }
      
      return {
        ...item,
        tags
      }
    })
    
    const batchResults = await Promise.all(batchPromises)
    enrichedItems.push(...batchResults)
    
    processedCount += batch.length
    
    // 進捗表示（10%ごと）
    const progress = Math.floor((processedCount / totalItems) * 10) * 10
    if (progress > 0 && processedCount % Math.floor(totalItems / 10) < parallelCount) {
      const elapsed = Date.now() - startTime
      const avgTime = elapsed / processedCount
      const remainingTime = Math.round((totalItems - processedCount) * avgTime / 1000)
      // eslint-disable-next-line no-console
      console.log(
        `[Tag Fetching] ${progress}% complete (${processedCount}/${totalItems}), ` +
        `${itemsWithTags} items with tags, ` +
        `ETA: ${remainingTime}s`
      )
    }
    
    // バッチ間の遅延（最後のバッチ以外）
    if (i + parallelCount < items.length) {
      await new Promise(resolve => setTimeout(resolve, batchDelay))
    }
  }
  
  // 最終統計
  const elapsed = Math.round((Date.now() - startTime) / 1000)
  // eslint-disable-next-line no-console
  console.log(
    `[Tag Fetching] Completed: ${totalItems} items in ${elapsed}s, ` +
    `${itemsWithTags} items with tags (${Math.round(itemsWithTags / totalItems * 100)}%)`
  )
  
  return enrichedItems
}


/**
 * 複数のランキングアイテムに対してタグ詳細を一括取得
 * KVキャッシュを使用してAPI呼び出しを最小化
 * @param items ランキングアイテムの配列
 * @param parallelCount 並列処理数（デフォルト: 50、getthumbinfo APIは軽量）
 * @param batchDelay バッチ間の遅延（ミリ秒、デフォルト: 50）
 * @param useCache キャッシュを使用するか（デフォルト: true）
 * @returns タグ詳細情報が追加されたランキングアイテムの配列
 */
export async function enrichRankingItemsWithTagDetails(
  items: RankingItem[],
  parallelCount: number = 50,
  batchDelay: number = 50,
  useCache: boolean = true
): Promise<(RankingItem & { tagDetails?: TagDetail[] })[]> {
  const totalItems = items.length
  const startTime = Date.now()
  let processedCount = 0
  let itemsWithTags = 0
  let cacheHits = 0
  let nicologFetches = 0
  let thumbFetches = 0

  const nicologLimiter = createRateLimitedQueue(DEFAULT_NICOLOG_CONCURRENCY, DEFAULT_NICOLOG_MIN_INTERVAL_MS)
  const thumbLimiter = createRateLimitedQueue(
    Number.isFinite(DEFAULT_THUMB_CONCURRENCY) ? DEFAULT_THUMB_CONCURRENCY : parallelCount,
    DEFAULT_THUMB_MIN_INTERVAL_MS
  )

  // キャッシュを読み込む
  let cacheByShard: TagCacheByShard = {}
  let cacheShardKeys: string[] = []
  if (useCache) {
    const cacheResult = await loadTagCacheForItems(items)
    cacheByShard = cacheResult.cacheByShard
    cacheShardKeys = cacheResult.shardKeys
    console.warn(`[Tag Cache] Looking up ${items.length} videos across ${cacheShardKeys.length} shards`)
  }

  // バッチ処理
  const enrichedItems: (RankingItem & { tagDetails?: TagDetail[] })[] = []
  let cacheUpdated = false
  const dirtyShards = new Set<string>()

  for (let i = 0; i < items.length; i += parallelCount) {
    const batch = items.slice(i, i + parallelCount)

    const batchPromises = batch.map(async (item) => {
      // キャッシュをチェック
      const now = Date.now()
      const shardKey = getShardKey(item.id)
      const shard = useCache ? cacheByShard[shardKey] : undefined
      const cached = shard ? shard[item.id] : undefined
      const lkgTags = cached?.tags && cached.tags.length > 0 ? cached.tags : null

      if (cached && isFreshSuccess(cached, now)) {
        cacheHits++
        itemsWithTags++
        return {
          ...item,
          tagDetails: cached.tags,
          tags: cached.tags.map(t => t.name)
        }
      }

      const skipNicolog = cached ? isFreshFailure(cached, now, 'nicolog') : false
      const skipThumb = cached ? isFreshFailure(cached, now, 'getthumbinfo') : false

      if (!skipNicolog) {
        nicologFetches++
        const nicologResult = await nicologLimiter(() => fetchTagsFromNicolog(item.id))
        if (nicologResult.ok && nicologResult.tags.length > 0) {
          itemsWithTags++
          if (useCache) {
            addToCache(cacheByShard, shardKey, item.id, nicologResult.tags, 'nicolog')
            dirtyShards.add(shardKey)
            recordTagCacheDelta(shardKey, item.id, cacheByShard[shardKey][item.id])
            cacheUpdated = true
          }
          return {
            ...item,
            tagDetails: nicologResult.tags,
            tags: nicologResult.tags.map(t => t.name)
          }
        }
        if (useCache) {
          let failureReason = 'empty'
          if (isTagFetchFailure(nicologResult)) {
            failureReason = nicologResult.reason
          }
          addFailureToCache(cacheByShard, shardKey, item.id, 'nicolog', failureReason)
          dirtyShards.add(shardKey)
          recordTagCacheDelta(shardKey, item.id, cacheByShard[shardKey][item.id])
          cacheUpdated = true
        }
      }

      if (!skipThumb) {
        thumbFetches++
        const thumbResult = await thumbLimiter(() => fetchAllTagsFromGetThumbInfoWithStatus(item.id))
        if (thumbResult.ok && thumbResult.tags.length > 0) {
          itemsWithTags++
          if (useCache) {
            addToCache(cacheByShard, shardKey, item.id, thumbResult.tags, 'getthumbinfo')
            dirtyShards.add(shardKey)
            recordTagCacheDelta(shardKey, item.id, cacheByShard[shardKey][item.id])
            cacheUpdated = true
          }
          return {
            ...item,
            tagDetails: thumbResult.tags,
            tags: thumbResult.tags.map(t => t.name)
          }
        }
        if (useCache) {
          let failureReason = 'empty'
          if (isTagFetchFailure(thumbResult)) {
            failureReason = thumbResult.reason
          }
          addFailureToCache(cacheByShard, shardKey, item.id, 'getthumbinfo', failureReason)
          dirtyShards.add(shardKey)
          recordTagCacheDelta(shardKey, item.id, cacheByShard[shardKey][item.id])
          cacheUpdated = true
        }
      }

      if (item.tags && item.tags.length > 0) {
        return {
          ...item,
          tagDetails: undefined,
          tags: item.tags
        }
      }

      if (lkgTags && lkgTags.length > 0) {
        return {
          ...item,
          tagDetails: lkgTags,
          tags: lkgTags.map(t => t.name)
        }
      }

      return {
        ...item,
        tagDetails: undefined,
        tags: []
      }
    })

    const progressLabel = `tag details ${currentTagFetchContext ?? 'batch'}`
    const markProgress = (): void => reportPipelineProgress(progressLabel)
    for (const promise of batchPromises) void promise.then(markProgress, markProgress)

    const batchResults = await Promise.all(batchPromises)
    enrichedItems.push(...batchResults)

    processedCount += batch.length

    // 進捗表示（10%ごと）
    const progress = Math.floor((processedCount / totalItems) * 10) * 10
    if (progress > 0 && processedCount % Math.floor(totalItems / 10) < parallelCount) {
      const elapsed = Date.now() - startTime
      const avgTime = elapsed / processedCount
      const remainingTime = Math.round((totalItems - processedCount) * avgTime / 1000)
      console.warn(
        `[Tag Details Fetching] ${progress}% complete (${processedCount}/${totalItems}), ` +
        `${itemsWithTags} items with tags, ` +
        `cache: ${cacheHits} hits / nicolog: ${nicologFetches} / getthumbinfo: ${thumbFetches}, ` +
        `ETA: ${remainingTime}s`
      )
    }

    // バッチ間の遅延（最後のバッチ以外）- APIフェッチがあった場合のみ
    if (i + parallelCount < items.length && (nicologFetches + thumbFetches) > 0) {
      await new Promise(resolve => setTimeout(resolve, batchDelay))
    }
  }

  // キャッシュを保存
  if (useCache && cacheUpdated) {
    const shardsToSave = Array.from(dirtyShards)
    console.warn(`[Tag Cache] Saving ${shardsToSave.length} shards to KV...`)
    await saveTagCacheShards(cacheByShard, shardsToSave)
  }

  // 最終統計
  const elapsed = Math.round((Date.now() - startTime) / 1000)
  const cacheRate = totalItems > 0 ? Math.round((cacheHits / totalItems) * 100) : 0
  console.warn(
    `[Tag Details Fetching] Completed: ${totalItems} items in ${elapsed}s, ` +
    `${itemsWithTags} items with tags (${Math.round(itemsWithTags / totalItems * 100)}%), ` +
    `Cache: ${cacheHits} hits (${cacheRate}%), Nicolog: ${nicologFetches}, getthumbinfo: ${thumbFetches}`
  )

  return enrichedItems
}
