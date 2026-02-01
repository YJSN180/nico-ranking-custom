/**
 * ニコニコ動画の固定タグを取得するためのシンプルなモジュール
 * getthumbinfo APIのみを使用
 * KVベースのタグキャッシュでAPI呼び出しを最小化
 */

import type { RankingItem } from '../types/ranking'
import { kv } from './simple-kv'

// キャッシュキー（シャード化）
const TAG_CACHE_KEY_PREFIX = 'TAG_CACHE_'
const TAG_CACHE_SHARDS = 100
// キャッシュの有効期限（7日間 = 604800秒）
const TAG_CACHE_TTL_SECONDS = 7 * 24 * 60 * 60

type TagSource = 'nicolog' | 'getthumbinfo'

interface TagCacheFailure {
  source: TagSource
  at: string
  reason?: string
}

/**
 * タグキャッシュのエントリ
 */
interface TagCacheEntry {
  tags: TagDetail[]
  fetchedAt: string
  source?: TagSource
  fail?: TagCacheFailure
}

/**
 * タグキャッシュの全体構造
 */
type TagCacheShard = Record<string, TagCacheEntry>
type TagCacheByShard = Record<string, TagCacheShard>

/**
 * タグの詳細情報
 */
export interface TagDetail {
  name: string
  isLocked: boolean
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

function hashVideoId(videoId: string): number {
  let hash = 0
  for (let i = 0; i < videoId.length; i += 1) {
    hash = ((hash << 5) - hash) + videoId.charCodeAt(i)
    hash |= 0
  }
  return Math.abs(hash)
}

function getShardKey(videoId: string): string {
  const shard = hashVideoId(videoId) % TAG_CACHE_SHARDS
  return `${TAG_CACHE_KEY_PREFIX}${shard}`
}

async function fetchWithTimeout(url: string, options: RequestInit, timeoutMs: number): Promise<Response> {
  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs)
  try {
    return await fetch(url, { ...options, signal: controller.signal })
  } finally {
    clearTimeout(timeoutId)
  }
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
 * KVからタグキャッシュを読み込む（シャード単位）
 */
async function loadTagCacheForItems(items: RankingItem[]): Promise<{ cacheByShard: TagCacheByShard; shardKeys: string[] }> {
  const now = Date.now()
  const shardKeys = Array.from(new Set(items.map(item => getShardKey(item.id))))
  const cacheByShard: TagCacheByShard = {}

  for (const shardKey of shardKeys) {
    const loadedAt = memoryCacheLoadedAt[shardKey]
    if (memoryCacheByShard[shardKey] && loadedAt && (now - loadedAt) < MEMORY_CACHE_MAX_AGE_MS) {
      cacheByShard[shardKey] = memoryCacheByShard[shardKey]
      continue
    }

    try {
      const shard = await kv.get<TagCacheShard>(shardKey)
      memoryCacheByShard[shardKey] = shard || {}
      memoryCacheLoadedAt[shardKey] = now
      cacheByShard[shardKey] = memoryCacheByShard[shardKey]
    } catch (error) {
      console.warn('[Tag Cache] Failed to load shard from KV:', error)
      memoryCacheByShard[shardKey] = {}
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
async function fetchTagsFromNicolog(videoId: string): Promise<{ ok: true, tags: TagDetail[] } | { ok: false, reason: string }> {
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

async function fetchAllTagsFromGetThumbInfoWithStatus(videoId: string): Promise<{ ok: true, tags: TagDetail[] } | { ok: false, reason: string }> {
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
    const totalCached = cacheShardKeys.reduce((count, shardKey) => count + Object.keys(cacheByShard[shardKey] || {}).length, 0)
    console.log(`[Tag Cache] Loaded ${totalCached} cached entries across ${cacheShardKeys.length} shards`)
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
            cacheUpdated = true
          }
          return {
            ...item,
            tagDetails: nicologResult.tags,
            tags: nicologResult.tags.map(t => t.name)
          }
        }
        if (useCache) {
          addFailureToCache(cacheByShard, shardKey, item.id, 'nicolog', nicologResult.ok ? 'empty' : nicologResult.reason)
          dirtyShards.add(shardKey)
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
            cacheUpdated = true
          }
          return {
            ...item,
            tagDetails: thumbResult.tags,
            tags: thumbResult.tags.map(t => t.name)
          }
        }
        if (useCache) {
          addFailureToCache(cacheByShard, shardKey, item.id, 'getthumbinfo', thumbResult.ok ? 'empty' : thumbResult.reason)
          dirtyShards.add(shardKey)
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

    const batchResults = await Promise.all(batchPromises)
    enrichedItems.push(...batchResults)

    processedCount += batch.length

    // 進捗表示（10%ごと）
    const progress = Math.floor((processedCount / totalItems) * 10) * 10
    if (progress > 0 && processedCount % Math.floor(totalItems / 10) < parallelCount) {
      const elapsed = Date.now() - startTime
      const avgTime = elapsed / processedCount
      const remainingTime = Math.round((totalItems - processedCount) * avgTime / 1000)
      console.log(
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
    console.log(`[Tag Cache] Saving ${shardsToSave.length} shards to KV...`)
    await saveTagCacheShards(cacheByShard, shardsToSave)
  }

  // 最終統計
  const elapsed = Math.round((Date.now() - startTime) / 1000)
  const cacheRate = totalItems > 0 ? Math.round((cacheHits / totalItems) * 100) : 0
  console.log(
    `[Tag Details Fetching] Completed: ${totalItems} items in ${elapsed}s, ` +
    `${itemsWithTags} items with tags (${Math.round(itemsWithTags / totalItems * 100)}%), ` +
    `Cache: ${cacheHits} hits (${cacheRate}%), Nicolog: ${nicologFetches}, getthumbinfo: ${thumbFetches}`
  )

  return enrichedItems
}
