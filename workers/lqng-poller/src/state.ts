// ポーリング Worker の状態（KV に保存する追跡情報・イベント）と KV アクセスの薄い層
// KV の書き込みは内容（updatedAt を除く）が変わったキーだけ。ロックは使わない。
// 定常の実行で変わるのは追跡表（lastPollAt と直近の実行の要約）だけなので、書き込みは通常 1 回。
import { LQNG_KV_KEYS, normalizeLqngConfig, normalizeLqngVerdicts } from '../../../lib/lqng/config'
import type { AuthorStatus, LqngConfig, LqngRuleId, LqngVerdicts, OwnerVisibility } from '../../../lib/lqng/types'
import type { TagDetail } from '../../../types/ranking'

/** テスト容易性のため、Cloudflare の KVNamespace のうち使う 4 操作だけを型にする */
export interface KvLike {
  get(key: string): Promise<string | null>
  put(key: string, value: string, options?: { expirationTtl?: number }): Promise<void>
  delete(key: string): Promise<void>
  list(options: { prefix: string; limit?: number; cursor?: string }): Promise<{ keys: Array<{ name: string }>; list_complete: boolean; cursor?: string }>
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
  /** 退会を確定した投稿者の、最初に 404 を観測した時刻 */
  deletedObservedAt: string | null
  /** 1 回目の 404 を観測した時刻（退会の疑い）。時間を置いた 2 回目の 404 で確定し、存在が分かれば消す */
  deletionSuspectedAt?: string | null
}

export interface PendingVideo {
  id: string
  authorId: string | null
  attempts: number
}

export interface UnattributedVideo {
  id: string
  /** 投稿時刻（刈り込みに使う） */
  at: string
}

/** 1 回の実行の要約（管理画面・/status の表示用） */
export interface LqngRunSummary {
  at: string
  mode: 'poll' | 'sweep'
  newVideos: number
  enriched: number
  usersChecked: number
  subrequests: number
  /** この実行で行った KV の書き込み（put / delete）の数 */
  kvWrites: number
  note?: string
}

export interface LqngRecentRun {
  at: string
  mode: 'poll' | 'sweep'
  note?: string
}

export interface LqngTracking {
  version: 1
  lastPollAt: string | null
  lastSweepDate: string | null
  authors: Record<string, TrackedAuthor>
  /** getthumbinfo の補完待ち（持ち越し） */
  pending: PendingVideo[]
  /** 取り込んだ投稿者 ID の無い動画（重なり区間で毎回新着として数え直さないため。追跡期間で消す） */
  unattributed: UnattributedVideo[]
  /** 直近の実行の要約。毎回書く追跡表に置き、履歴（events）への毎回の書き込みを避ける */
  lastRun: LqngRunSummary | null
  /** 直近の実行の時刻と注記（新しい順、/status の運用確認用） */
  recentRuns: LqngRecentRun[]
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
  /** 退会扱いの投稿者が再確認で存在した（退会扱いを外す。投稿者 NG は外さない） */
  | 'author_restored'
  /** 404 の割合が異常に高く、その回の退会判定を保留した */
  | 'deletion_held'
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
  /**
   * 旧来の置き場所。正は tracking.lastRun で、管理画面は追跡表に無いときだけここを読む。
   * 履歴を書く回に限り同じ内容をここにも入れる（書き込み回数は増やさない）
   */
  lastRun: LqngRunSummary | null
}

export const EVENTS_MAX = 500
export const RECENT_RUNS_MAX = 40

export function emptyTracking(now: string): LqngTracking {
  return { version: 1, lastPollAt: null, lastSweepDate: null, authors: {}, pending: [], unattributed: [], lastRun: null, recentRuns: [], updatedAt: now }
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

function normalizeRecentRuns(raw: unknown): LqngRecentRun[] {
  if (!Array.isArray(raw)) return []
  return raw.filter((r): r is LqngRecentRun => isRecord(r) && typeof r.at === 'string' && (r.mode === 'poll' || r.mode === 'sweep')).slice(0, RECENT_RUNS_MAX)
}

export function normalizeTracking(raw: unknown, now: string): LqngTracking {
  if (!isRecord(raw) || !isRecord(raw.authors)) return emptyTracking(now)
  return {
    version: 1,
    lastPollAt: typeof raw.lastPollAt === 'string' ? raw.lastPollAt : null,
    lastSweepDate: typeof raw.lastSweepDate === 'string' ? raw.lastSweepDate : null,
    authors: raw.authors as Record<string, TrackedAuthor>,
    pending: Array.isArray(raw.pending) ? (raw.pending as PendingVideo[]) : [],
    unattributed: Array.isArray(raw.unattributed) ? raw.unattributed.filter((u): u is UnattributedVideo => isRecord(u) && typeof u.id === 'string' && typeof u.at === 'string') : [],
    lastRun: isRecord(raw.lastRun) ? (raw.lastRun as unknown as LqngRunSummary) : null,
    recentRuns: normalizeRecentRuns(raw.recentRuns),
    updatedAt: typeof raw.updatedAt === 'string' ? raw.updatedAt : now,
  }
}

export function normalizeEvents(raw: unknown): LqngEvents {
  if (!isRecord(raw) || !Array.isArray(raw.items)) return emptyEvents()
  return {
    version: 1,
    items: raw.items as LqngEvent[],
    lastRun: isRecord(raw.lastRun) ? (raw.lastRun as unknown as LqngRunSummary) : null,
  }
}

export interface LoadedState {
  config: LqngConfig
  verdicts: LqngVerdicts
  tracking: LqngTracking
  events: LqngEvents
}

/** 設定だけを読む（判定表・追跡表など大きいキーを読まずに済ませたいとき用） */
export async function loadConfig(kv: KvLike): Promise<LqngConfig> {
  return normalizeLqngConfig(parseJson<unknown>(await kv.get(LQNG_KV_KEYS.config), null))
}

/** 有効フラグだけを読む。無効時に判定表・追跡表など大きいキーを読まずに抜けるための軽量読み */
export async function loadEnabled(kv: KvLike): Promise<boolean> {
  return (await loadConfig(kv)).enabled
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

/** updatedAt を除いた内容（書き込みの要否の判定に使う） */
function contentOf(value: { updatedAt: string }): string {
  return JSON.stringify({ ...value, updatedAt: '' })
}

/** 読み込み直後の内容。保存時にこれと比べて、変わったキーだけを書く */
export interface StateBaseline {
  verdicts: string
  tracking: string
  events: string
}

export function captureBaseline(state: Pick<LoadedState, 'verdicts' | 'tracking' | 'events'>): StateBaseline {
  return { verdicts: contentOf(state.verdicts), tracking: contentOf(state.tracking), events: JSON.stringify(state.events.items) }
}

/**
 * 内容（updatedAt を除く）が変わったキーだけを書き、updatedAt もそのときだけ進める。
 * 順番は 判定表 → 履歴 → 受け箱の削除 → 追跡表。追跡表（取り込み済みの動画・最終取得時刻）を
 * 最後にするので、途中で失敗しても次回は同じ新着と受け箱を取り直して冪等に判定し直せる。
 * 直近の実行の要約（書き込み数を含む）は書く前に数えて追跡表に入れ、同じ数を返す。
 */
export async function saveState(
  kv: KvLike,
  baseline: StateBaseline,
  state: Pick<LoadedState, 'verdicts' | 'tracking' | 'events'>,
  run: Omit<LqngRunSummary, 'kvWrites'>,
  inboxKeys: readonly string[] = []
): Promise<number> {
  const verdictsChanged = contentOf(state.verdicts) !== baseline.verdicts
  const eventsChanged = JSON.stringify(state.events.items) !== baseline.events
  const summary: LqngRunSummary = { ...run, kvWrites: 0 }
  state.tracking.lastRun = summary
  state.tracking.recentRuns = [{ at: run.at, mode: run.mode, ...(run.note ? { note: run.note } : {}) }, ...state.tracking.recentRuns].slice(0, RECENT_RUNS_MAX)
  const trackingChanged = contentOf(state.tracking) !== baseline.tracking
  summary.kvWrites = (verdictsChanged ? 1 : 0) + (eventsChanged ? 1 : 0) + inboxKeys.length + (trackingChanged ? 1 : 0)
  if (verdictsChanged) state.verdicts.updatedAt = run.at
  if (trackingChanged) state.tracking.updatedAt = run.at
  if (eventsChanged) state.events.lastRun = summary
  if (verdictsChanged) await kv.put(LQNG_KV_KEYS.verdicts, JSON.stringify(state.verdicts))
  if (eventsChanged) await kv.put(LQNG_KV_KEYS.events, JSON.stringify(state.events))
  for (const key of inboxKeys) await kv.delete(key)
  if (trackingChanged) await kv.put(LQNG_KV_KEYS.tracking, JSON.stringify(state.tracking))
  return summary.kvWrites
}

export function pushEvent(events: LqngEvents, event: LqngEvent): void {
  events.items.unshift(event)
  if (events.items.length > EVENTS_MAX) events.items.length = EVENTS_MAX
}
