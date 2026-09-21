// 過去分のバックフィル（Snapshot の全履歴を新しい順に走査して判定する）
// - 走査ステップ（runBackfillStep）は KV を読むだけで書かない。カーソルと判定差分は呼び出し側
//   （scripts/lqng-backfill-driver.ts）が持ち回り、まとめて commitBackfill で書き込む。
//   これで KV の書き込み枠（アカウント共通）をほとんど消費しない。
// - 1 回の呼び出しは Snapshot ページ ≤ pages、ユーザー確認 ≤ usersPerCall、getthumbinfo ≤ thumbsPerCall
//   に抑え、無料プランのサブリクエスト上限（50/実行）と CPU 時間に収める。
// - ルール: B（タイトル）と HK（キーワード ∧ 頻度）は取り込み時に即判定。頻度 C に当たる投稿者だけ
//   存在確認し、削除済みなら A∧C。ロックタグ群 D はタグ名の事前絞り込み（該当群のタグが閾値以上
//   含まれる）に通った候補だけ getthumbinfo で補完して判定する。
//   過去分は削除時刻が分からないため、A∧C の「投稿から 7 日以内の削除」は「現在削除済み」で代用する
//   （実データ検証と同じ評価）。
import { LQNG_KV_KEYS } from '../../../lib/lqng/config'
import { containsAnyNormalized } from '../../../lib/lqng/normalize'
import { evaluateVideo } from '../../../lib/lqng/rules'
import type { AuthorObservation, AuthorVerdict, LqngConfig, LqngEvidence, LqngRuleId, VideoObservation, VideoVerdict } from '../../../lib/lqng/types'
import {
  AccessLimitedError,
  SNAPSHOT_PAGE_SIZE,
  fetchSnapshotWindowPage,
  fetchThumbInfoFromExt,
  fetchUserInfoFromNvapi,
  type SnapshotPage,
  type SnapshotVideo,
  type ThumbResult,
  type UserInfo,
} from './sources'
import { acquireLock, loadState, pushEvent, releaseLock, type KvLike } from './state'
import { fetchNicoSearchPage, nicoPageOwnerId, NICO_PAGE_SIZE, type NicoPageResult } from '../../../lib/search/nico-page-search'

export const BACKFILL_LIMITS = {
  pagesDefault: 3,
  pagesMax: 8,
  usersPerCall: 15,
  thumbsPerCall: 12,
  /** 外部呼び出しの総予算（poll と同じ） */
  subrequestBudget: 40,
  /** Snapshot の 1 窓の幅（offset 上限 10 万件に収める） */
  windowDays: 30,
  /** 投稿頻度 C の判定に持ち越す時間幅 */
  carryHours: 24,
  carryPerAuthor: 12,
  pendingThumbsMax: 300,
  evidencePerAuthor: 3,
  /** これより前は走査しない（ニコニコ動画の開始以前） */
  floorDefault: '2007-03-01T00:00:00.000Z',
  /** pages ソースの既定の遡り日数（Snapshot の更新遅れと Worker 停止の隙間を埋める用途） */
  pagesDefaultDays: 2,
  lockTtlSeconds: 120,
} as const

const HOUR_MS = 3600_000
const DAY_MS = 24 * HOUR_MS
const isUserId = (authorId: string | null): authorId is string => authorId !== null && /^\d{1,12}$/.test(authorId)

export type BackfillSource = 'snapshot' | 'pages'

export interface BackfillDeps {
  now: () => Date
  fetchWindowPage: (tags: string[], startIso: string, endIso: string, offset: number) => Promise<SnapshotPage>
  /** 本家タグページ（投稿日時が新しい順）。Snapshot の索引に未反映の直近数日を補完するときに使う */
  fetchTagPage: (tag: string, page: number) => Promise<NicoPageResult>
  fetchUserInfo: (userId: string) => Promise<UserInfo>
  fetchThumbInfo: (videoId: string) => Promise<ThumbResult>
}

export function createLiveBackfillDeps(fetchImpl: typeof fetch = fetch): BackfillDeps {
  return {
    now: () => new Date(),
    fetchWindowPage: (tags, startIso, endIso, offset) => fetchSnapshotWindowPage(tags, startIso, endIso, offset, fetchImpl),
    fetchTagPage: (tag, page) => fetchNicoSearchPage('tag', tag, page, fetchImpl),
    fetchUserInfo: (id) => fetchUserInfoFromNvapi(id, fetchImpl),
    fetchThumbInfo: (id) => fetchThumbInfoFromExt(id, fetchImpl),
  }
}

export interface BackfillCheckedAuthor {
  status: 'existing' | 'deleted'
  followerCount: number | null
  nickname: string | null
}

export interface BackfillPendingThumb {
  id: string
  authorId: string
  title: string
  registeredAt: string
  /** 投稿頻度の再評価用に、取り込み時点の投稿時刻を写しておく */
  times: string[]
}

export interface BackfillStats {
  calls: number
  pages: number
  videos: number
  usersChecked: number
  thumbs: number
  authorsNg: number
  videosNg: number
}

/** 呼び出しの間で持ち回る走査状態（KV には置かない） */
export interface BackfillCursor {
  version: 1
  /** 取得元。snapshot は全履歴（30 日窓）、pages は本家タグページ（直近数日の取りこぼし補完） */
  source: BackfillSource
  /** pages 用: 何番目のタグの何ページ目か */
  tagIndex: number
  page: number
  /** 走査中の窓 [windowStart, windowEnd)（UTC ISO） */
  windowEnd: string
  windowStart: string
  offset: number
  /** これより前は走査しない */
  floor: string
  /** 直近 carryHours 分の投稿者 → 投稿時刻（C の判定用） */
  carry: Record<string, string[]>
  /** 存在確認済みの投稿者 */
  checked: Record<string, BackfillCheckedAuthor>
  pendingUsers: string[]
  pendingThumbs: BackfillPendingThumb[]
  /** 存在確認待ちの投稿者の根拠（A∧C になったときに付ける） */
  evidence: Record<string, LqngEvidence[]>
  stats: BackfillStats
}

export interface BackfillDeltas {
  authors: Record<string, AuthorVerdict>
  videos: Record<string, VideoVerdict>
}

export interface BackfillStepOptions {
  pages?: number
  /** 遡る日数。null/未指定で全履歴（pages ソースでは 2 日） */
  days?: number | null
  source?: BackfillSource
}

export interface BackfillStepResult {
  skipped: string | null
  cursor: BackfillCursor
  done: boolean
  deltas: BackfillDeltas
  subrequests: number
  note?: string
}

export interface BackfillCommitResult {
  skipped: string | null
  authorsAdded: number
  videosAdded: number
  kvWrites: number
}

export function emptyDeltas(): BackfillDeltas {
  return { authors: {}, videos: {} }
}

export function createBackfillCursor(now: Date, days: number | null | undefined, source: BackfillSource = 'snapshot'): BackfillCursor {
  const end = now.getTime()
  const effectiveDays = days && days > 0 ? days : source === 'pages' ? BACKFILL_LIMITS.pagesDefaultDays : null
  const floorMs = effectiveDays ? end - effectiveDays * DAY_MS : new Date(BACKFILL_LIMITS.floorDefault).getTime()
  const start = Math.max(floorMs, end - BACKFILL_LIMITS.windowDays * DAY_MS)
  return {
    version: 1,
    source,
    tagIndex: 0,
    page: 1,
    windowEnd: new Date(end).toISOString(),
    windowStart: new Date(start).toISOString(),
    offset: 0,
    floor: new Date(floorMs).toISOString(),
    carry: {},
    checked: {},
    pendingUsers: [],
    pendingThumbs: [],
    evidence: {},
    stats: { calls: 0, pages: 0, videos: 0, usersChecked: 0, thumbs: 0, authorsNg: 0, videosNg: 0 },
  }
}

function windowsExhausted(cursor: BackfillCursor, tagCount = 0): boolean {
  if (cursor.source === 'pages') return cursor.tagIndex >= tagCount
  return new Date(cursor.windowEnd).getTime() <= new Date(cursor.floor).getTime()
}

function advanceWindow(cursor: BackfillCursor): void {
  const end = new Date(cursor.windowStart).getTime()
  const floor = new Date(cursor.floor).getTime()
  cursor.windowEnd = new Date(end).toISOString()
  cursor.windowStart = new Date(Math.max(floor, end - BACKFILL_LIMITS.windowDays * DAY_MS)).toISOString()
  cursor.offset = 0
}

/** 判定差分をもう一方へ足し込む（投稿者は理由の和集合、動画は未登録のものだけ） */
export function mergeDeltas(into: BackfillDeltas, from: BackfillDeltas): void {
  for (const [id, verdict] of Object.entries(from.authors)) {
    const current = into.authors[id]
    if (!current) {
      into.authors[id] = verdict
      continue
    }
    current.reasons = Array.from(new Set([...current.reasons, ...verdict.reasons]))
    for (const e of verdict.evidence) {
      if (current.evidence.length >= BACKFILL_LIMITS.evidencePerAuthor) break
      if (!current.evidence.some((x) => x.videoId === e.videoId)) current.evidence.push(e)
    }
  }
  for (const [id, verdict] of Object.entries(from.videos)) {
    if (!into.videos[id] && !into.authors[verdict.authorId ?? '']) into.videos[id] = verdict
  }
}

class BackfillSession {
  subrequests = 0
  note: string | undefined
  readonly deltas = emptyDeltas()

  constructor(
    readonly config: LqngConfig,
    readonly knownAuthorNg: (authorId: string) => boolean,
    readonly knownVideoNg: (videoId: string) => boolean,
    readonly cursor: BackfillCursor,
    readonly nowIso: string
  ) {}

  budgetLeft(): boolean {
    return this.subrequests < BACKFILL_LIMITS.subrequestBudget
  }

  isAuthorNg(authorId: string | null): boolean {
    return authorId !== null && (this.knownAuthorNg(authorId) || !!this.deltas.authors[authorId])
  }

  isAllowlisted(video: { id: string; authorId: string | null }): boolean {
    if (this.config.allowlist.videoIds.includes(video.id)) return true
    return video.authorId !== null && this.config.allowlist.authorIds.includes(video.authorId)
  }

  authorObservation(authorId: string | null, times: string[]): AuthorObservation | null {
    if (authorId === null) return null
    const checked = this.cursor.checked[authorId]
    return {
      authorId,
      status: checked?.status ?? 'unknown',
      followerCount: checked?.followerCount ?? null,
      visibility: null,
      postTimes: times,
      deletedObservedAt: checked?.status === 'deleted' ? this.nowIso : null,
    }
  }

  addVideoNg(video: { id: string; title: string; authorId: string | null; registeredAt: string }, reasons: LqngRuleId[]): void {
    if (this.isAuthorNg(video.authorId) || this.deltas.videos[video.id]) return
    this.deltas.videos[video.id] = { status: 'ng', reasons, authorId: video.authorId, title: video.title, registeredAt: video.registeredAt, since: this.nowIso }
    this.cursor.stats.videosNg++
  }

  addAuthorNg(authorId: string, reasons: LqngRuleId[], evidence: LqngEvidence[]): void {
    if (this.config.allowlist.authorIds.includes(authorId) || this.knownAuthorNg(authorId)) return
    const checked = this.cursor.checked[authorId]
    const current = this.deltas.authors[authorId]
    if (current) {
      current.reasons = Array.from(new Set([...current.reasons, ...reasons]))
      for (const e of evidence) {
        if (current.evidence.length >= BACKFILL_LIMITS.evidencePerAuthor) break
        if (!current.evidence.some((x) => x.videoId === e.videoId)) current.evidence.push(e)
      }
      return
    }
    this.deltas.authors[authorId] = {
      status: 'ng',
      reasons: Array.from(new Set(reasons)),
      since: this.nowIso,
      evidence: evidence.slice(0, BACKFILL_LIMITS.evidencePerAuthor),
      nickname: checked?.nickname ?? null,
      followerCount: checked?.followerCount ?? null,
      visibility: null,
      deletedObservedAt: checked?.status === 'deleted' ? this.nowIso : null,
    }
    this.cursor.stats.authorsNg++
    // 投稿者 NG で全動画が落ちるので、動画単位の差分と待ち行列は不要になる
    for (const [id, v] of Object.entries(this.deltas.videos)) if (v.authorId === authorId) delete this.deltas.videos[id]
    this.cursor.pendingThumbs = this.cursor.pendingThumbs.filter((t) => t.authorId !== authorId)
    this.cursor.pendingUsers = this.cursor.pendingUsers.filter((id) => id !== authorId)
    delete this.cursor.evidence[authorId]
  }

  /** 該当群のタグ名がいくつ含まれているか（ロック状態は不明なので候補絞り込みにだけ使う） */
  presentGroups(tags: readonly string[]): number {
    if (tags.length === 0 || this.config.tagGroups.length === 0) return 0
    const set = new Set(tags)
    let n = 0
    for (const group of this.config.tagGroups) if (group.some((name) => set.has(name))) n++
    return n
  }

  rememberEvidence(authorId: string, e: LqngEvidence): void {
    const list = (this.cursor.evidence[authorId] ??= [])
    if (list.length < BACKFILL_LIMITS.evidencePerAuthor && !list.some((x) => x.videoId === e.videoId)) list.push(e)
  }

  ingestPage(videos: readonly SnapshotVideo[]): void {
    let oldest: string | null = null
    for (const v of videos) {
      this.cursor.stats.videos++
      if (!oldest || v.registeredAt < oldest) oldest = v.registeredAt
      if (this.isAuthorNg(v.authorId) || this.knownVideoNg(v.id) || this.deltas.videos[v.id]) continue
      if (this.isAllowlisted(v)) continue

      let times: string[] = []
      if (v.authorId) {
        const list = (this.cursor.carry[v.authorId] ??= [])
        if (!list.includes(v.registeredAt)) list.push(v.registeredAt)
        if (list.length > BACKFILL_LIMITS.carryPerAuthor) list.splice(0, list.length - BACKFILL_LIMITS.carryPerAuthor)
        times = list.slice()
      }
      const observation: VideoObservation = { id: v.id, title: v.title, authorId: v.authorId, registeredAt: v.registeredAt, tagDetails: null, ownerVisibility: null }
      const evaluation = evaluateVideo(observation, this.authorObservation(v.authorId, times), this.config)
      const evidence: LqngEvidence = { videoId: v.id, title: v.title, registeredAt: v.registeredAt, rules: evaluation.reasons }
      if (evaluation.ng) {
        this.addVideoNg(v, evaluation.reasons)
        if (evaluation.escalate && v.authorId) this.addAuthorNg(v.authorId, evaluation.escalateReasons, [evidence])
        continue
      }
      if (!isUserId(v.authorId)) continue
      const checked = this.cursor.checked[v.authorId]
      if (evaluation.frequent) {
        if (checked?.status === 'deleted') {
          this.addAuthorNg(v.authorId, ['A_C'], [{ ...evidence, rules: ['A_C'] }])
          continue
        }
        if (!checked) {
          this.rememberEvidence(v.authorId, { ...evidence, rules: ['A_C'] })
          if (!this.cursor.pendingUsers.includes(v.authorId)) this.cursor.pendingUsers.push(v.authorId)
        }
      }
      const keyword = this.config.keywordNeedles.length > 0 && containsAnyNormalized(v.title, this.config.keywordNeedles)
      const groupsMayMatch = this.cursor.source === 'pages' ? true : this.presentGroups(v.tags) >= this.config.lockGroupsMin
      if ((evaluation.frequent || keyword) && groupsMayMatch && this.cursor.pendingThumbs.length < BACKFILL_LIMITS.pendingThumbsMax) {
        this.cursor.pendingThumbs.push({ id: v.id, authorId: v.authorId, title: v.title, registeredAt: v.registeredAt, times })
      }
    }
    if (oldest) this.pruneCarry(oldest)
  }

  /** 新しい順に進むので、現在位置より carryHours 以上新しい投稿時刻は二度と窓に入らない */
  pruneCarry(oldestIso: string): void {
    const limit = new Date(oldestIso).getTime() + BACKFILL_LIMITS.carryHours * HOUR_MS
    for (const [authorId, times] of Object.entries(this.cursor.carry)) {
      const kept = times.filter((t) => new Date(t).getTime() <= limit)
      if (kept.length === 0) delete this.cursor.carry[authorId]
      else this.cursor.carry[authorId] = kept
    }
  }

  async checkUsers(deps: BackfillDeps): Promise<void> {
    let checked = 0
    while (this.cursor.pendingUsers.length > 0 && checked < BACKFILL_LIMITS.usersPerCall && this.budgetLeft()) {
      const authorId = this.cursor.pendingUsers.shift()!
      if (this.isAuthorNg(authorId) || this.cursor.checked[authorId]) continue
      this.subrequests++
      checked++
      let info: UserInfo
      try {
        info = await deps.fetchUserInfo(authorId)
      } catch (error) {
        if (error instanceof AccessLimitedError) {
          this.cursor.pendingUsers.unshift(authorId)
          this.note = error.message
          return
        }
        continue
      }
      if (info.status === 'error') continue
      this.cursor.stats.usersChecked++
      this.cursor.checked[authorId] = { status: info.status, followerCount: info.followerCount, nickname: info.nickname }
      if (info.status === 'deleted') {
        this.addAuthorNg(authorId, ['A_C'], this.cursor.evidence[authorId] ?? [])
      }
      delete this.cursor.evidence[authorId]
    }
  }

  async enrichThumbs(deps: BackfillDeps): Promise<void> {
    let processed = 0
    const deferred: BackfillPendingThumb[] = []
    while (this.cursor.pendingThumbs.length > 0 && processed < BACKFILL_LIMITS.thumbsPerCall && this.budgetLeft()) {
      const item = this.cursor.pendingThumbs.shift()!
      if (this.isAuthorNg(item.authorId) || this.deltas.videos[item.id]) continue
      // 存在確認待ちの投稿者は次回に回す（削除済みなら A∧C で片付くため補完しない）
      if (!this.cursor.checked[item.authorId] && this.cursor.pendingUsers.includes(item.authorId)) {
        deferred.push(item)
        continue
      }
      this.subrequests++
      processed++
      let result: ThumbResult
      try {
        result = await deps.fetchThumbInfo(item.id)
      } catch (error) {
        if (error instanceof AccessLimitedError) {
          this.cursor.pendingThumbs.unshift(item)
          this.note = error.message
          break
        }
        continue
      }
      this.cursor.stats.thumbs++
      if (!result.ok) continue
      const observation: VideoObservation = { id: item.id, title: item.title, authorId: item.authorId, registeredAt: item.registeredAt, tagDetails: result.info.tagDetails, ownerVisibility: result.info.ownerVisibility }
      const evaluation = evaluateVideo(observation, this.authorObservation(item.authorId, item.times), this.config)
      if (!evaluation.ng) continue
      this.addVideoNg(item, evaluation.reasons)
      if (evaluation.escalate) this.addAuthorNg(item.authorId, evaluation.escalateReasons, [{ videoId: item.id, title: item.title, registeredAt: item.registeredAt, rules: evaluation.reasons }])
    }
    this.cursor.pendingThumbs.push(...deferred)
  }
}

/** 1 回分の走査。KV は読むだけ（設定・既存判定）で、書き込みは commitBackfill が行う */
export async function runBackfillStep(kv: KvLike, deps: BackfillDeps, cursorIn: BackfillCursor | null, options: BackfillStepOptions = {}): Promise<BackfillStepResult> {
  const now = deps.now()
  const nowIso = now.toISOString()
  const state = await loadState(kv, nowIso)
  const cursor = cursorIn ?? createBackfillCursor(now, options.days ?? null, options.source ?? 'snapshot')
  const empty: BackfillStepResult = { skipped: null, cursor, done: false, deltas: emptyDeltas(), subrequests: 0 }
  if (!state.config.enabled) return { ...empty, skipped: 'disabled' }
  if (state.config.pollTags.length === 0) return { ...empty, skipped: 'no_poll_tags' }

  const session = new BackfillSession(
    state.config,
    (authorId) => state.verdicts.authors[authorId]?.status === 'ng',
    (videoId) => state.verdicts.videos[videoId]?.status === 'ng',
    cursor,
    nowIso
  )
  cursor.stats.calls++
  const tags = state.config.pollTags
  const pages = Math.max(1, Math.min(BACKFILL_LIMITS.pagesMax, Math.floor(options.pages ?? BACKFILL_LIMITS.pagesDefault)))
  for (let i = 0; i < pages && !windowsExhausted(cursor, tags.length) && session.budgetLeft(); i++) {
    session.subrequests++
    if (cursor.source === 'pages') {
      // 本家タグページ: タグごとに新しい順にページを進め、floor より古い動画が出たら次のタグへ
      const tag = tags[cursor.tagIndex]!
      const result = await deps.fetchTagPage(tag, cursor.page)
      cursor.stats.pages++
      const floorMs = new Date(cursor.floor).getTime()
      const inRange = result.items.filter((v) => new Date(v.registeredAt).getTime() >= floorMs)
      session.ingestPage(
        inRange.map((v): SnapshotVideo => ({ id: v.id, title: v.title, authorId: nicoPageOwnerId(v), registeredAt: v.registeredAt, ownerVisibility: v.owner === null ? null : v.owner?.visibility === 'hidden' ? 'hidden' : 'visible', tags: [] }))
      )
      const reachedFloor = inRange.length < result.items.length
      if (reachedFloor || !result.hasNext || result.items.length < NICO_PAGE_SIZE) {
        cursor.tagIndex++
        cursor.page = 1
      } else {
        cursor.page++
      }
      continue
    }
    const page = await deps.fetchWindowPage(tags, cursor.windowStart, cursor.windowEnd, cursor.offset)
    cursor.stats.pages++
    session.ingestPage(page.videos)
    if (page.videos.length < SNAPSHOT_PAGE_SIZE || cursor.offset + SNAPSHOT_PAGE_SIZE >= page.totalCount) advanceWindow(cursor)
    else cursor.offset += SNAPSHOT_PAGE_SIZE
  }
  await session.checkUsers(deps)
  await session.enrichThumbs(deps)

  const done = windowsExhausted(cursor, tags.length) && cursor.pendingUsers.length === 0 && cursor.pendingThumbs.length === 0
  return { skipped: null, cursor, done, deltas: session.deltas, subrequests: session.subrequests, ...(session.note ? { note: session.note } : {}) }
}

/** 判定差分を KV の判定テーブルへ合流させる（書き込みは verdicts と events の 2 回） */
export async function commitBackfill(kv: KvLike, now: Date, deltas: BackfillDeltas): Promise<BackfillCommitResult> {
  const nowIso = now.toISOString()
  const none: BackfillCommitResult = { skipped: null, authorsAdded: 0, videosAdded: 0, kvWrites: 0 }
  if (!(await acquireLock(kv, nowIso, BACKFILL_LIMITS.lockTtlSeconds))) return { ...none, skipped: 'locked' }
  try {
    const state = await loadState(kv, nowIso)
    let authorsAdded = 0
    let videosAdded = 0
    for (const [authorId, verdict] of Object.entries(deltas.authors)) {
      if (state.config.allowlist.authorIds.includes(authorId)) continue
      const current = state.verdicts.authors[authorId]
      if (!current) {
        state.verdicts.authors[authorId] = { ...verdict, since: nowIso }
        authorsAdded++
        continue
      }
      const merged = Array.from(new Set([...current.reasons, ...verdict.reasons]))
      if (merged.length !== current.reasons.length) current.reasons = merged
    }
    for (const [videoId, verdict] of Object.entries(deltas.videos)) {
      if (state.verdicts.videos[videoId]) continue
      if (verdict.authorId && state.verdicts.authors[verdict.authorId]) continue
      if (state.config.allowlist.videoIds.includes(videoId)) continue
      state.verdicts.videos[videoId] = { ...verdict, since: nowIso }
      videosAdded++
    }
    if (authorsAdded === 0 && videosAdded === 0) return none
    state.verdicts.updatedAt = nowIso
    pushEvent(state.events, { at: nowIso, kind: 'backfill', note: `投稿者 +${authorsAdded} / 動画 +${videosAdded}` })
    await kv.put(LQNG_KV_KEYS.verdicts, JSON.stringify(state.verdicts))
    await kv.put(LQNG_KV_KEYS.events, JSON.stringify(state.events))
    return { skipped: null, authorsAdded, videosAdded, kvWrites: 2 }
  } finally {
    await releaseLock(kv)
  }
}
