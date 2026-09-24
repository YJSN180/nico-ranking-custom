// 検索結果の投稿者情報補完
// Snapshot API は userId / channelId しか返さず名前・アイコンのフィールドが無いため、
// 結果表示後にクライアントが非同期で呼び、ランキング画面と同じ投稿者表示にする。
// 実測（2026-09）:
//   - ユーザー: nvapi /v1/users/{id} が 200（nickname / icons.small）。1件 0.1〜0.2s。
//     一括の /v1/users?userIds= は 404。
//   - チャンネル: ID から引ける API は見つからず（nvapi /v1/channels/{id} 等は 404）。
//     watch v3_guest の data.channel.{id,name,thumbnail} から取れるので、チャンネルごとに
//     代表動画 1 件を叩いて解決する。
import { buildV3GuestUrl } from '@/lib/search/realtime-tags'
import { withTimeout } from '../abort-signal'

/**
 * 1リクエストあたりの上限（未認証で叩ける増幅器になるため有界に保つ）。
 * 25 件 ÷ 並列 8 = 4 巡で、全件が遅くても呼び出し側の期限（/api/search/owners は 8 秒）で打ち切れる量にする
 */
export const OWNER_INFO_MAX_USERS = 20
export const OWNER_INFO_MAX_CHANNEL_VIDEOS = 5
const DEFAULT_CONCURRENCY = 8
const DEFAULT_PER_REQUEST_TIMEOUT_MS = 2500
/** 名前・アイコンは滅多に変わらないので長めにメモする（Vercel インスタンス内） */
const CACHE_TTL_MS = 24 * 60 * 60 * 1000

const NVAPI_HEADERS: Record<string, string> = {
  'X-Frontend-Id': '6',
  'X-Frontend-Version': '0',
  Accept: 'application/json',
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
}

const V3_GUEST_HEADERS: Record<string, string> = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
  Accept: '*/*',
  'Accept-Language': 'ja,en;q=0.9',
}

const USER_ID_PATTERN = /^\d{1,12}$/
/** チャンネルの代表動画にはショート（ss）も来る */
const VIDEO_ID_PATTERN = /^(sm|so|nm|ss)\d{1,12}$/

export interface OwnerInfo {
  name: string
  icon?: string
}

export interface OwnerInfoResult {
  /** ユーザーID → 情報。取得できなかったものは含めない */
  users: Record<string, OwnerInfo>
  /** チャンネルID（"ch1234" 形式） → 情報 */
  channels: Record<string, OwnerInfo>
  /** 存在しなかったユーザーID（nvapi 404 = 退会済み）。failed とは区別する */
  missing: string[]
  /** 失敗したユーザーID / 動画ID */
  failed: string[]
}

function sanitizeIds(raw: string | null, pattern: RegExp, max: number): string[] {
  if (!raw) return []
  const seen = new Set<string>()
  const ids: string[] = []
  for (const part of raw.split(',')) {
    const id = part.trim()
    if (!pattern.test(id) || seen.has(id)) continue
    seen.add(id)
    ids.push(id)
    if (ids.length >= max) break
  }
  return ids
}

export function sanitizeUserIds(raw: string | null, max = OWNER_INFO_MAX_USERS): string[] {
  return sanitizeIds(raw, USER_ID_PATTERN, max)
}

export function sanitizeChannelVideoIds(raw: string | null, max = OWNER_INFO_MAX_CHANNEL_VIDEOS): string[] {
  return sanitizeIds(raw, VIDEO_ID_PATTERN, max)
}

export function buildUserInfoUrl(userId: string): string {
  return `https://nvapi.nicovideo.jp/v1/users/${userId}`
}

interface UserPayload {
  data?: { user?: { nickname?: string; icons?: { small?: string; large?: string } } }
}

/** nvapi /v1/users/{id} の応答から名前・アイコンを取り出す（想定外の形なら null） */
export function parseUserInfo(payload: unknown): OwnerInfo | null {
  const user = (payload as UserPayload | null)?.data?.user
  if (!user || typeof user.nickname !== 'string' || user.nickname.length === 0) return null
  const icon = user.icons?.small ?? user.icons?.large
  return { name: user.nickname, icon: typeof icon === 'string' ? icon : undefined }
}

interface ChannelPayload {
  data?: { channel?: { id?: string; name?: string; thumbnail?: { url?: string; smallUrl?: string } } | null }
}

/** v3_guest の応答から data.channel を取り出す（ユーザー動画なら channel が null で null を返す） */
export function parseChannelInfo(payload: unknown): { id: string; info: OwnerInfo } | null {
  const channel = (payload as ChannelPayload | null)?.data?.channel
  if (!channel || typeof channel.id !== 'string' || typeof channel.name !== 'string' || channel.name.length === 0) return null
  const icon = channel.thumbnail?.smallUrl ?? channel.thumbnail?.url
  return { id: channel.id, info: { name: channel.name, icon: typeof icon === 'string' ? icon : undefined } }
}

interface CacheEntry<T> {
  value: T
  expiresAt: number
}

const userCache = new Map<string, CacheEntry<OwnerInfo>>()
/** 退会済みは戻らないので、こちらも同じ TTL でメモして再照会を避ける */
const missingUserCache = new Map<string, CacheEntry<true>>()
const channelByVideoCache = new Map<string, CacheEntry<{ id: string; info: OwnerInfo }>>()

function readCache<T>(cache: Map<string, CacheEntry<T>>, key: string, now: number): T | undefined {
  const entry = cache.get(key)
  if (!entry) return undefined
  if (entry.expiresAt <= now) {
    cache.delete(key)
    return undefined
  }
  return entry.value
}

export function clearOwnerInfoCache(): void {
  userCache.clear()
  missingUserCache.clear()
  channelByVideoCache.clear()
}

export interface FetchOwnerInfoOptions {
  fetchImpl?: typeof fetch
  concurrency?: number
  timeoutMs?: number
  now?: number
  /** 呼び出し全体の期限。切れたら、まだ問い合わせていない分は問い合わせずに failed にする */
  signal?: AbortSignal
}

/**
 * ユーザーは nvapi、チャンネルは代表動画の v3_guest から投稿者情報を集める。
 * 並列数を絞り、1件でも失敗しても他は返す（部分成功）。
 */
export async function fetchOwnerInfo(
  input: { userIds: string[]; channelVideoIds: string[] },
  options: FetchOwnerInfoOptions = {}
): Promise<OwnerInfoResult> {
  const fetchImpl = options.fetchImpl ?? fetch
  const concurrency = options.concurrency ?? DEFAULT_CONCURRENCY
  const timeoutMs = options.timeoutMs ?? DEFAULT_PER_REQUEST_TIMEOUT_MS
  const now = options.now ?? Date.now()
  const result: OwnerInfoResult = { users: {}, channels: {}, missing: [], failed: [] }

  const pendingUsers: string[] = []
  for (const id of input.userIds) {
    const cached = readCache(userCache, id, now)
    if (cached) result.users[id] = cached
    else if (readCache(missingUserCache, id, now)) result.missing.push(id)
    else pendingUsers.push(id)
  }
  const pendingVideos: string[] = []
  for (const id of input.channelVideoIds) {
    const cached = readCache(channelByVideoCache, id, now)
    if (cached) result.channels[cached.id] = cached.info
    else pendingVideos.push(id)
  }

  const fetchJson = async (url: string, headers: Record<string, string>): Promise<{ status: number; body: unknown | null }> => {
    const res = await fetchImpl(url, { headers, cache: 'no-store', signal: withTimeout(timeoutMs, options.signal) })
    if (!res.ok) return { status: res.status, body: null }
    return { status: res.status, body: await res.json() }
  }

  const fetchUser = async (id: string): Promise<void> => {
    try {
      const { status, body } = await fetchJson(buildUserInfoUrl(id), NVAPI_HEADERS)
      if (status === 404) {
        // 退会済み。一時的な失敗（5xx・タイムアウト）とは区別して表示側で明示する
        result.missing.push(id)
        missingUserCache.set(id, { value: true, expiresAt: now + CACHE_TTL_MS })
        return
      }
      const info = parseUserInfo(body)
      if (!info) {
        result.failed.push(id)
        return
      }
      result.users[id] = info
      userCache.set(id, { value: info, expiresAt: now + CACHE_TTL_MS })
    } catch {
      result.failed.push(id)
    }
  }

  const fetchChannel = async (videoId: string): Promise<void> => {
    try {
      const channel = parseChannelInfo((await fetchJson(buildV3GuestUrl(videoId), V3_GUEST_HEADERS)).body)
      if (!channel) {
        result.failed.push(videoId)
        return
      }
      result.channels[channel.id] = channel.info
      channelByVideoCache.set(videoId, { value: channel, expiresAt: now + CACHE_TTL_MS })
    } catch {
      result.failed.push(videoId)
    }
  }

  const tasks: Array<{ id: string; run: () => Promise<void> }> = [
    ...pendingUsers.map((id) => ({ id, run: () => fetchUser(id) })),
    ...pendingVideos.map((videoId) => ({ id: videoId, run: () => fetchChannel(videoId) })),
  ]

  for (let i = 0; i < tasks.length; i += concurrency) {
    if (options.signal?.aborted) {
      result.failed.push(...tasks.slice(i).map((task) => task.id))
      break
    }
    await Promise.all(tasks.slice(i, i + concurrency).map((task) => task.run()))
  }
  return result
}
