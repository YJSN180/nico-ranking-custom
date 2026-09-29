// 検索結果の投稿者情報補完
// Snapshot API は userId / channelId しか返さず名前・アイコンのフィールドが無いため、
// 結果表示後にクライアントが非同期で呼び、ランキング画面と同じ投稿者表示にする。
// 実測（2026-09）:
//   - ユーザー: nvapi /v1/users/{id} が 200（nickname / icons.small）。1件 0.1〜0.2s。
//     一括の /v1/users?userIds= は 404。
//   - チャンネル: ID から引ける API は見つからず（nvapi /v1/channels/{id} 等は 404）。
//     watch v3_guest の data.channel.{id,name,thumbnail} から取れるので、チャンネルごとに
//     代表動画 1 件を叩いて解決する。
import { buildV3GuestUrl, compareIds, isVideoId } from '@/lib/search/realtime-tags'
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
/**
 * 退会済みの記憶は短くする。nvapi は経路の誤りにも同じ 404 と NOT_FOUND を返す（2026-09-27 実測）ので、
 * API の変更や障害で退会と見分けられなかったときに、長く固定しない
 */
const MISSING_CACHE_TTL_MS = 60 * 60 * 1000
/** メモリキャッシュの上限件数（未認証の呼び出しでインスタンスのメモリを使い切らせない） */
const USER_CACHE_MAX = 5000
const CHANNEL_CACHE_MAX = 2000

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

/** 番号の先頭に 0 は付かない（同じ投稿者を別の書き方で問い合わせられないようにする） */
const USER_ID_PATTERN = /^[1-9]\d{0,11}$/

export const isUserId = (id: string): boolean => USER_ID_PATTERN.test(id)

/**
 * 投稿者情報の問い合わせの正規形（ID は重複なし・昇順。ユーザー → チャンネルの代表動画の順）。
 * 画面はこれで組み立て、サーバーはこれと同じ形だけを受け付ける（並べ替えや書き換えで CDN のキャッシュを外せないようにする）
 */
export function buildOwnersQuery(input: { userIds: string[]; channelVideoIds: string[] }): string {
  const params = new URLSearchParams()
  const users = Array.from(new Set(input.userIds)).sort(compareIds)
  const videos = Array.from(new Set(input.channelVideoIds)).sort(compareIds)
  if (users.length > 0) params.set('users', users.join(','))
  if (videos.length > 0) params.set('videos', videos.join(','))
  return params.toString()
}

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

/**
 * 名前が条件に当たる投稿者を、検索結果の投稿者 ID の形（ユーザーは数字、チャンネルは channel/chNNN）で返す。
 * Snapshot 由来の行には名前が無く、/api/search では投稿者名 NG を当てられないため、名前が分かったここで当てる
 */
export function authorIdsMatchingNames(result: OwnerInfoResult, matches: (name: string) => boolean): string[] {
  const users = Object.entries(result.users).filter(([, info]) => matches(info.name)).map(([id]) => id)
  const channels = Object.entries(result.channels)
    .filter(([, info]) => matches(info.name))
    .map(([id]) => (id.startsWith('ch') ? `channel/${id}` : `channel/ch${id}`))
  return [...users, ...channels]
}

function sanitizeIds(raw: string | null, isValid: (id: string) => boolean, max: number): string[] {
  if (!raw) return []
  const seen = new Set<string>()
  const ids: string[] = []
  for (const part of raw.split(',')) {
    const id = part.trim()
    if (!isValid(id) || seen.has(id)) continue
    seen.add(id)
    ids.push(id)
    if (ids.length >= max) break
  }
  return ids
}

export function sanitizeUserIds(raw: string | null, max = OWNER_INFO_MAX_USERS): string[] {
  return sanitizeIds(raw, isUserId, max)
}

export function sanitizeChannelVideoIds(raw: string | null, max = OWNER_INFO_MAX_CHANNEL_VIDEOS): string[] {
  // チャンネルの代表動画にはショート（ss）も来る
  return sanitizeIds(raw, isVideoId, max)
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

/** 上限件数つきの期限つきキャッシュ。上限を超えたら、入れた順に古いものから捨てる */
export class BoundedTtlCache<T> {
  private readonly entries = new Map<string, { value: T; expiresAt: number }>()

  constructor(private readonly maxEntries: number) {}

  get size(): number {
    return this.entries.size
  }

  get(key: string, now: number): T | undefined {
    const entry = this.entries.get(key)
    if (!entry) return undefined
    if (entry.expiresAt <= now) {
      this.entries.delete(key)
      return undefined
    }
    return entry.value
  }

  set(key: string, value: T, expiresAt: number): void {
    // 入れ直したものは新しい扱いにする（Map は入れた順を保つ）
    this.entries.delete(key)
    while (this.entries.size >= this.maxEntries) {
      const oldest = this.entries.keys().next().value
      if (oldest === undefined) break
      this.entries.delete(oldest)
    }
    this.entries.set(key, { value, expiresAt })
  }

  clear(): void {
    this.entries.clear()
  }
}

const userCache = new BoundedTtlCache<OwnerInfo>(USER_CACHE_MAX)
/** 退会済みも覚えて再照会を避ける（期限は MISSING_CACHE_TTL_MS） */
const missingUserCache = new BoundedTtlCache<true>(USER_CACHE_MAX)
const channelByVideoCache = new BoundedTtlCache<{ id: string; info: OwnerInfo }>(CHANNEL_CACHE_MAX)

/** nvapi の 404 が退会済み（本文が meta.errorCode = NOT_FOUND）か */
function isNotFoundBody(body: unknown): boolean {
  const meta = (body as { meta?: { status?: unknown; errorCode?: unknown } } | null)?.meta
  return meta?.errorCode === 'NOT_FOUND'
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
    const cached = userCache.get(id, now)
    if (cached) result.users[id] = cached
    else if (missingUserCache.get(id, now)) result.missing.push(id)
    else pendingUsers.push(id)
  }
  const pendingVideos: string[] = []
  for (const id of input.channelVideoIds) {
    const cached = channelByVideoCache.get(id, now)
    if (cached) result.channels[cached.id] = cached.info
    else pendingVideos.push(id)
  }

  const fetchJson = async (url: string, headers: Record<string, string>): Promise<{ status: number; body: unknown | null }> => {
    const res = await fetchImpl(url, { headers, cache: 'no-store', signal: withTimeout(timeoutMs, options.signal) })
    // 404 は本文で退会かどうかを確かめる。本文が JSON でない（CDN・プロキシの応答など）ときは null
    if (res.status === 404) return { status: res.status, body: await res.json().catch(() => null) }
    if (!res.ok) return { status: res.status, body: null }
    return { status: res.status, body: await res.json() }
  }

  const fetchUser = async (id: string): Promise<void> => {
    try {
      const { status, body } = await fetchJson(buildUserInfoUrl(id), NVAPI_HEADERS)
      if (status === 404 && isNotFoundBody(body)) {
        // 退会済み。一時的な失敗（5xx・タイムアウト・本文の無い 404）とは区別して表示側で明示する
        result.missing.push(id)
        missingUserCache.set(id, true, now + MISSING_CACHE_TTL_MS)
        return
      }
      const info = parseUserInfo(body)
      if (!info) {
        result.failed.push(id)
        return
      }
      result.users[id] = info
      userCache.set(id, info, now + CACHE_TTL_MS)
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
      channelByVideoCache.set(videoId, channel, now + CACHE_TTL_MS)
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
