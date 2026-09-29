// ポーリング Worker の状態（KV に保存する追跡情報・イベント）と KV アクセスの薄い層
// KV の書き込みは内容（updatedAt を除く）が変わったキーだけ。ロックは使わない。
// 定常の実行で変わるのは追跡表（lastPollAt と直近の実行の要約）だけなので、書き込みは通常 1 回。
// 判定表（投稿者 NG は恒久で増え続ける）は 1 回の実行でパース 1 回・文字列化 1 回にする（CPU 時間を抑える）。
import { isLqngVerdictsShape, LQNG_KV_KEYS, normalizeLqngConfig, normalizeLqngVerdicts } from '../../../lib/lqng/config'
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
  /** 確かな失敗（error）の回数。上限で諦める */
  attempts: number
  /** 一時的な失敗（5xx・通信失敗など）の回数。待ち行列の後ろに回し、上限で諦める */
  transient?: number
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
  /**
   * 続いている問題（種類 → 状態）。同じ問題が続く間は履歴に積み直さず、内容が変わったときと
   * 解消後に再発したときだけ積む。解消は何回か続けて成功してから（出たり消えたりで増やさない）
   */
  issues: Record<string, LqngIssue>
  updatedAt: string
}

export interface LqngIssue {
  /** 問題の内容の要約（変われば別の問題として履歴に積み、監視にもすぐ出す） */
  signature: string
  /** 続けて問題なく終わった回数（一定回数で解消とみなす） */
  okStreak: number
  /** 最後に監視（reportError）へ出した時刻 */
  reportedAt: string | null
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
  /** 設定の対照（controlUserId）がユーザー情報 API で 404 だった（打ち間違い・退会。追跡中の投稿者で確かめ直す） */
  | 'control_not_found'
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
  return { version: 1, lastPollAt: null, lastSweepDate: null, authors: {}, pending: [], unattributed: [], lastRun: null, recentRuns: [], issues: {}, updatedAt: now }
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

function normalizeIssues(raw: unknown): Record<string, LqngIssue> {
  if (!isRecord(raw)) return {}
  const out: Record<string, LqngIssue> = {}
  for (const [category, value] of Object.entries(raw)) {
    // 以前の形（内容の要約の文字列だけ）も読む
    if (typeof value === 'string') out[category] = { signature: value, okStreak: 0, reportedAt: null }
    else if (isRecord(value) && typeof value.signature === 'string') {
      out[category] = {
        signature: value.signature,
        okStreak: typeof value.okStreak === 'number' && Number.isFinite(value.okStreak) ? value.okStreak : 0,
        reportedAt: typeof value.reportedAt === 'string' ? value.reportedAt : null,
      }
    }
  }
  return out
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
    issues: normalizeIssues(raw.issues),
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
  /** false: 判定表のキーはあるが JSON として読めない・形が違う（空として扱ってはいけない） */
  verdictsReadable: boolean
  /** KV から読んだ判定表の文字列（無ければ null）。保存時に、文字列化し直さずに変わったかを比べる */
  verdictsRaw: string | null
  tracking: LqngTracking
  events: LqngEvents
}

/** 設定だけを読む（判定表・追跡表など大きいキーを読まずに済ませたいとき用） */
export async function loadConfig(kv: KvLike): Promise<LqngConfig> {
  return normalizeLqngConfig(parseJson<unknown>(await kv.get(LQNG_KV_KEYS.config), null))
}

/** 追跡表だけを読む（日次スイープが、判定表など大きいキーを読む前に済んだ日を確かめる） */
export async function loadTracking(kv: KvLike, now: string): Promise<LqngTracking> {
  return normalizeTracking(parseJson<unknown>(await kv.get(LQNG_KV_KEYS.tracking), null), now)
}

/** 先に読んだ設定・追跡表（渡したキーは読み直さない） */
export interface PreloadedState {
  config?: LqngConfig
  tracking?: LqngTracking
}

export async function loadState(kv: KvLike, now: string, preloaded: PreloadedState = {}): Promise<LoadedState> {
  const [config, verdicts, tracking, events] = await Promise.all([
    preloaded.config ? null : kv.get(LQNG_KV_KEYS.config),
    kv.get(LQNG_KV_KEYS.verdicts),
    preloaded.tracking ? null : kv.get(LQNG_KV_KEYS.tracking),
    kv.get(LQNG_KV_KEYS.events),
  ])
  // 判定表はここで 1 回だけパースする（読めるかの判定にも同じ結果を使う）
  const verdictsParsed = parseJson<unknown>(verdicts, null)
  return {
    config: preloaded.config ?? normalizeLqngConfig(parseJson<unknown>(config, null)),
    verdicts: normalizeLqngVerdicts(verdictsParsed),
    verdictsReadable: verdicts === null || isLqngVerdictsShape(verdictsParsed),
    verdictsRaw: verdicts,
    tracking: preloaded.tracking ?? normalizeTracking(parseJson<unknown>(tracking, null), now),
    events: normalizeEvents(parseJson<unknown>(events, null)),
  }
}

/**
 * 判定表の JSON のうち updatedAt より前の部分。JSON.stringify(verdicts) の先頭と同じ文字列で、保存時はこれに
 * updatedAt を足して書く（比較に使った文字列を書き込みにも使い、判定表の文字列化を 1 回にする）
 */
export function verdictsHead(verdicts: Pick<LqngVerdicts, 'authors' | 'videos'>): string {
  return `{"version":1,"authors":${JSON.stringify(verdicts.authors)},"videos":${JSON.stringify(verdicts.videos)}`
}

const verdictsTail = (updatedAt: string): string => `,"updatedAt":${JSON.stringify(updatedAt)}}`

/**
 * KV から読んだ判定表の文字列の、verdictsHead にあたる部分。この Worker が書いた形（キーが version・authors・
 * videos・updatedAt の順）でなければ null を返し、内容が同じでも次の保存で書き直す。キーが無ければ空の判定表
 */
function headOfStoredVerdicts(raw: string | null, updatedAt: string): string | null {
  if (raw === null) return verdictsHead({ authors: {}, videos: {} })
  const tail = verdictsTail(updatedAt)
  return raw.startsWith('{"version":1,"authors":') && raw.endsWith(tail) ? raw.slice(0, raw.length - tail.length) : null
}

/** 読み込み直後の状態。保存時にこれと比べて、変わったキーだけを書く */
export interface StateBaseline {
  /** 読み込んだ判定表の verdictsHead にあたる部分（書き直しが要る形なら null） */
  verdictsHead: string | null
  /** 読み込み時の履歴の先頭と件数（履歴は pushEvent で先頭に積むだけなので、先頭が替われば変わった） */
  eventsTop: LqngEvent | null
  eventsLength: number
  /** 読み込み時の投稿者 NG の数（書き込みで減らさない） */
  authorCount: number
}

/** verdictsRaw を省いたとき（テストなど）は、読み込んだ判定表を文字列化して比べる */
export function captureBaseline(state: Pick<LoadedState, 'verdicts' | 'events'> & { verdictsRaw?: string | null }): StateBaseline {
  return {
    verdictsHead: state.verdictsRaw === undefined ? verdictsHead(state.verdicts) : headOfStoredVerdicts(state.verdictsRaw, state.verdicts.updatedAt),
    eventsTop: state.events.items[0] ?? null,
    eventsLength: state.events.items.length,
    authorCount: Object.keys(state.verdicts.authors).length,
  }
}

/**
 * 判定表を書いてよいか。投稿者 NG は恒久で、この Worker が減らすことは無いので、読み込み時より減る
 * 書き込みは壊れた判定表・同時実行などの異常として拒否する。問題が無ければ null
 */
export function verdictsWriteProblem(baseline: StateBaseline, verdicts: LqngVerdicts): string | null {
  const count = Object.keys(verdicts.authors).length
  return count < baseline.authorCount ? `verdicts_shrank: ${baseline.authorCount}>${count}` : null
}

/**
 * 内容（updatedAt を除く）が変わったキーだけを書き、updatedAt もそのときだけ進める。追跡表は直近の実行の要約が
 * 毎回変わるので毎回書く（比べるための文字列化はしない）。
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
  const head = verdictsHead(state.verdicts)
  const verdictsChanged = head !== baseline.verdictsHead
  const eventsChanged = (state.events.items[0] ?? null) !== baseline.eventsTop || state.events.items.length !== baseline.eventsLength
  const summary: LqngRunSummary = { ...run, kvWrites: 0 }
  state.tracking.lastRun = summary
  state.tracking.recentRuns = [{ at: run.at, mode: run.mode, ...(run.note ? { note: run.note } : {}) }, ...state.tracking.recentRuns].slice(0, RECENT_RUNS_MAX)
  state.tracking.updatedAt = run.at
  summary.kvWrites = (verdictsChanged ? 1 : 0) + (eventsChanged ? 1 : 0) + inboxKeys.length + 1
  if (verdictsChanged) state.verdicts.updatedAt = run.at
  if (eventsChanged) state.events.lastRun = summary
  if (verdictsChanged) await kv.put(LQNG_KV_KEYS.verdicts, head + verdictsTail(run.at))
  if (eventsChanged) await kv.put(LQNG_KV_KEYS.events, JSON.stringify(state.events))
  for (const key of inboxKeys) await kv.delete(key)
  await kv.put(LQNG_KV_KEYS.tracking, JSON.stringify(state.tracking))
  return summary.kvWrites
}

export function pushEvent(events: LqngEvents, event: LqngEvent): void {
  events.items.unshift(event)
  if (events.items.length > EVENTS_MAX) events.items.length = EVENTS_MAX
}
