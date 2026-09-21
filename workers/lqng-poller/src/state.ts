// ポーリング Worker の状態（KV に保存する追跡情報・イベント）と KV アクセスの薄い層
// KV の書き込みは 1 回の実行で最大 4 キー（lock / tracking / verdicts / events）に抑える。
import { LQNG_KV_KEYS, normalizeLqngConfig, normalizeLqngVerdicts } from '../../../lib/lqng/config'
import type { AuthorStatus, LqngConfig, LqngRuleId, LqngVerdicts, OwnerVisibility } from '../../../lib/lqng/types'
import type { TagDetail } from '../../../types/ranking'

/** テスト容易性のため、Cloudflare の KVNamespace のうち使う 3 操作だけを型にする */
export interface KvLike {
  get(key: string): Promise<string | null>
  put(key: string, value: string, options?: { expirationTtl?: number }): Promise<void>
  delete(key: string): Promise<void>
}

export interface TrackedPost {
  id: string
  title: string
  at: string
  /** getthumbinfo で補完済みなら配列、未取得なら null */
  tagDetails: TagDetail[] | null
  ownerVisibility: OwnerVisibility | null
}

export interface TrackedAuthor {
  authorId: string
  firstSeenAt: string
  lastPostAt: string
  posts: TrackedPost[]
  status: AuthorStatus
  lastCheckedAt: string | null
  followerCount: number | null
  nickname: string | null
  visibility: OwnerVisibility | null
  deletedObservedAt: string | null
}

export interface PendingVideo {
  id: string
  authorId: string | null
  attempts: number
}

export interface LqngTracking {
  version: 1
  lastPollAt: string | null
  lastSweepDate: string | null
  authors: Record<string, TrackedAuthor>
  /** getthumbinfo の補完待ち（持ち越し） */
  pending: PendingVideo[]
  updatedAt: string
}

export type LqngEventKind =
  | 'poll'
  | 'sweep'
  | 'author_ng'
  | 'video_ng'
  | 'hold'
  | 'released'
  | 'author_deleted'
  | 'access_limited'
  | 'backfill'
  | 'error'

export interface LqngEvent {
  at: string
  kind: LqngEventKind
  id?: string
  authorId?: string | null
  reasons?: LqngRuleId[]
  note?: string
}

export interface LqngEvents {
  version: 1
  items: LqngEvent[]
  /** 直近の実行サマリ（管理画面のヘッダー表示用） */
  lastRun: {
    at: string
    mode: 'poll' | 'sweep'
    newVideos: number
    enriched: number
    usersChecked: number
    subrequests: number
    kvWrites: number
    note?: string
  } | null
}

export const EVENTS_MAX = 500

export function emptyTracking(now: string): LqngTracking {
  return { version: 1, lastPollAt: null, lastSweepDate: null, authors: {}, pending: [], updatedAt: now }
}

export function emptyEvents(): LqngEvents {
  return { version: 1, items: [], lastRun: null }
}

function parseJson<T>(raw: string | null, fallback: T): T {
  if (!raw) return fallback
  try {
    return JSON.parse(raw) as T
  } catch {
    return fallback
  }
}

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v)

export function normalizeTracking(raw: unknown, now: string): LqngTracking {
  if (!isRecord(raw) || !isRecord(raw.authors)) return emptyTracking(now)
  return {
    version: 1,
    lastPollAt: typeof raw.lastPollAt === 'string' ? raw.lastPollAt : null,
    lastSweepDate: typeof raw.lastSweepDate === 'string' ? raw.lastSweepDate : null,
    authors: raw.authors as Record<string, TrackedAuthor>,
    pending: Array.isArray(raw.pending) ? (raw.pending as PendingVideo[]) : [],
    updatedAt: typeof raw.updatedAt === 'string' ? raw.updatedAt : now,
  }
}

export function normalizeEvents(raw: unknown): LqngEvents {
  if (!isRecord(raw) || !Array.isArray(raw.items)) return emptyEvents()
  return {
    version: 1,
    items: raw.items as LqngEvent[],
    lastRun: isRecord(raw.lastRun) ? (raw.lastRun as LqngEvents['lastRun']) : null,
  }
}

export interface LoadedState {
  config: LqngConfig
  verdicts: LqngVerdicts
  tracking: LqngTracking
  events: LqngEvents
}

/** 有効フラグだけを読む。無効時にロック取得の KV 書き込み（1 日 96 回）を避けるための軽量読み */
export async function loadEnabled(kv: KvLike): Promise<boolean> {
  return normalizeLqngConfig(parseJson<unknown>(await kv.get(LQNG_KV_KEYS.config), null)).enabled
}

export async function loadState(kv: KvLike, now: string): Promise<LoadedState> {
  const [config, verdicts, tracking, events] = await Promise.all([
    kv.get(LQNG_KV_KEYS.config),
    kv.get(LQNG_KV_KEYS.verdicts),
    kv.get(LQNG_KV_KEYS.tracking),
    kv.get(LQNG_KV_KEYS.events),
  ])
  return {
    config: normalizeLqngConfig(parseJson<unknown>(config, null)),
    verdicts: normalizeLqngVerdicts(parseJson<unknown>(verdicts, null)),
    tracking: normalizeTracking(parseJson<unknown>(tracking, null), now),
    events: normalizeEvents(parseJson<unknown>(events, null)),
  }
}

/** 変更のあったキーだけ書き込み、書き込んだ数を返す */
export async function saveState(
  kv: KvLike,
  before: { verdicts: string; events: string },
  state: Pick<LoadedState, 'verdicts' | 'tracking' | 'events'>
): Promise<number> {
  let writes = 0
  await kv.put(LQNG_KV_KEYS.tracking, JSON.stringify(state.tracking))
  writes++
  const verdicts = JSON.stringify(state.verdicts)
  if (verdicts !== before.verdicts) {
    await kv.put(LQNG_KV_KEYS.verdicts, verdicts)
    writes++
  }
  const events = JSON.stringify(state.events)
  if (events !== before.events) {
    await kv.put(LQNG_KV_KEYS.events, events)
    writes++
  }
  return writes
}

export function pushEvent(events: LqngEvents, event: LqngEvent): void {
  events.items.unshift(event)
  if (events.items.length > EVENTS_MAX) events.items.length = EVENTS_MAX
}

/** 実行ロック。取得できなければ false */
export async function acquireLock(kv: KvLike, now: string, ttlSeconds: number): Promise<boolean> {
  const existing = await kv.get(LQNG_KV_KEYS.lock)
  if (existing) return false
  await kv.put(LQNG_KV_KEYS.lock, now, { expirationTtl: ttlSeconds })
  return true
}

export async function releaseLock(kv: KvLike): Promise<void> {
  try {
    await kv.delete(LQNG_KV_KEYS.lock)
  } catch {
    // ロックは TTL で消えるので握りつぶす
  }
}
