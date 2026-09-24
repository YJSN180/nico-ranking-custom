// ポーリング本体（差分取得 → 補完 → 投稿者確認 → 判定 → 保留の期限処理 → 保存）
// 判定はすべて lib/lqng の純粋関数に委ね、ここでは追跡状態の更新と外部呼び出しの予算管理を行う。
// 1 回の実行で: 外部呼び出し ≤ subrequestBudget。KV は内容が変わったキーだけ書く（定常は追跡表の 1 回）。
// ロックは使わない（KV の get → put は原子的でなく排他にならない）。判定表を書くのはこの実行だけにする。
import { decideHold, evaluateDeletion, evaluateVideo, isFrequent } from '../../../lib/lqng/rules'
import type { AuthorObservation, LqngConfig, LqngEvidence, LqngRuleId, VideoObservation } from '../../../lib/lqng/types'
import { AccessLimitedError, type PollDeps, type SourceVideo } from './sources'
import {
  captureBaseline,
  loadEnabled,
  loadState,
  pushEvent,
  saveState,
  type KvLike,
  type LoadedState,
  type TrackedAuthor,
  type TrackedPost,
} from './state'

export const LIMITS = {
  /** 1 回の実行で getthumbinfo を叩く上限 */
  thumbPerRun: 18,
  /** 1 回の実行でユーザー情報 API を叩く上限 */
  usersPerRun: 10,
  /** 外部呼び出しの総予算（無料プランの 50/実行 に KV 分の余裕を残す） */
  subrequestBudget: 40,
  /** 新着取得の予算。本家タグページはタグ 3 × 種別 2（動画/ショート）× 最大 2 ページ = 12 とみなす（予備の nvapi は 3） */
  nvapiCost: 12,
  /** 現存投稿者を再確認する間隔 */
  userRecheckHours: 6,
  /** 補完に失敗した動画を諦めるまでの試行回数 */
  pendingMaxAttempts: 3,
  /**
   * 差分取得の重なり。nvapi の検索インデックスには投稿から数十分以上の反映遅れがあり、
   * 10 分の重なりでは新着を取りこぼした（実測 2026-09-22）。既知の動画は isKnownVideo で
   * 除外されるので、6 時間まで広げても取得ページ数（最大 3）は変わらない
   */
  sinceOverlapMinutes: 6 * 60,
  /** 初回実行で遡る時間 */
  // 初回（lastPollAt 無し）だけ直近 1 日を対象にする。取得は新しい順で最大 3 ページ（300 件）なので
  // 予算は変わらず、投入直後から当日分の連投（HK / C 系）を拾える
  firstPollLookbackMinutes: 24 * 60,
  /** 動画単位の判定を保持する日数（投稿者 NG は恒久） */
  videoVerdictRetentionDays: 90,
  releasedRetentionDays: 7,
  evidenceMax: 10,
} as const

export type RunMode = 'poll' | 'sweep'

export interface RunResult {
  mode: RunMode
  skipped: string | null
  newVideos: number
  enriched: number
  usersChecked: number
  subrequests: number
  kvWrites: number
  note?: string
}

const HOUR_MS = 3600_000
const DAY_MS = 24 * HOUR_MS
const MINUTE_MS = 60_000

const isUserId = (authorId: string): boolean => /^\d{1,12}$/.test(authorId)

function toObservation(author: TrackedAuthor | undefined): AuthorObservation | null {
  if (!author) return null
  return {
    authorId: author.authorId,
    status: author.status,
    followerCount: author.followerCount,
    visibility: author.visibility,
    postTimes: author.posts.map((p) => p.at),
    deletedObservedAt: author.deletedObservedAt,
  }
}

function postToVideo(post: TrackedPost, authorId: string | null): VideoObservation {
  return {
    id: post.id,
    title: post.title,
    authorId,
    registeredAt: post.at,
    tagDetails: post.tagDetails,
    ownerVisibility: post.ownerVisibility,
  }
}

function mergeReasons(a: readonly LqngRuleId[], b: readonly LqngRuleId[]): LqngRuleId[] {
  return Array.from(new Set([...a, ...b]))
}

class Session {
  subrequests = 0
  newVideos = 0
  enriched = 0
  usersChecked = 0
  note: string | undefined

  constructor(
    readonly state: LoadedState,
    readonly deps: PollDeps,
    readonly now: Date
  ) {}

  get nowIso(): string {
    return this.now.toISOString()
  }

  get config(): LqngConfig {
    return this.state.config
  }

  budgetLeft(cost = 1): boolean {
    return this.subrequests + cost <= LIMITS.subrequestBudget
  }

  spend(cost = 1): void {
    this.subrequests += cost
  }

  isKnownVideo(id: string): boolean {
    if (this.state.verdicts.videos[id]) return true
    if (this.state.tracking.pending.some((p) => p.id === id)) return true
    for (const author of Object.values(this.state.tracking.authors)) if (author.posts.some((p) => p.id === id)) return true
    return false
  }

  ensureAuthor(authorId: string): TrackedAuthor {
    const existing = this.state.tracking.authors[authorId]
    if (existing) return existing
    const created: TrackedAuthor = {
      authorId,
      firstSeenAt: this.nowIso,
      lastPostAt: this.nowIso,
      posts: [],
      status: 'unknown',
      lastCheckedAt: null,
      followerCount: null,
      nickname: null,
      visibility: null,
      deletedObservedAt: null,
    }
    this.state.tracking.authors[authorId] = created
    return created
  }

  setAuthorNg(authorId: string, reasons: LqngRuleId[], evidence: LqngEvidence | null): void {
    if (this.config.allowlist.authorIds.includes(authorId)) return
    const tracked = this.state.tracking.authors[authorId]
    const current = this.state.verdicts.authors[authorId]
    const evidenceList = current?.evidence ?? []
    if (evidence && !evidenceList.some((e) => e.videoId === evidence.videoId)) {
      evidenceList.unshift(evidence)
      if (evidenceList.length > LIMITS.evidenceMax) evidenceList.length = LIMITS.evidenceMax
    }
    const merged = current ? mergeReasons(current.reasons, reasons) : reasons
    const isNew = !current
    this.state.verdicts.authors[authorId] = {
      status: 'ng',
      reasons: merged,
      since: current?.since ?? this.nowIso,
      evidence: evidenceList,
      nickname: tracked?.nickname ?? current?.nickname ?? null,
      followerCount: tracked?.followerCount ?? current?.followerCount ?? null,
      visibility: tracked?.visibility ?? current?.visibility ?? null,
      deletedObservedAt: tracked?.deletedObservedAt ?? current?.deletedObservedAt ?? null,
    }
    if (isNew || merged.length !== (current?.reasons.length ?? 0)) {
      pushEvent(this.state.events, { at: this.nowIso, kind: 'author_ng', authorId, reasons: merged, id: evidence?.videoId })
    }
  }

  /** 動画 1 件を評価して判定テーブルを更新する（何度呼んでも同じ結果になる） */
  applyVideo(video: VideoObservation): void {
    const author = video.authorId ? this.state.tracking.authors[video.authorId] : undefined
    const evaluation = evaluateVideo(video, toObservation(author), this.config)
    const current = this.state.verdicts.videos[video.id]
    if (evaluation.ng) {
      const changed = !current || current.status !== 'ng' || current.reasons.join() !== evaluation.reasons.join()
      this.state.verdicts.videos[video.id] = {
        status: 'ng',
        reasons: evaluation.reasons,
        authorId: video.authorId,
        title: video.title,
        registeredAt: video.registeredAt,
        since: current?.status === 'ng' ? current.since : this.nowIso,
      }
      if (changed) pushEvent(this.state.events, { at: this.nowIso, kind: 'video_ng', id: video.id, authorId: video.authorId, reasons: evaluation.reasons })
      if (evaluation.escalate && video.authorId) {
        this.setAuthorNg(video.authorId, evaluation.escalateReasons, { videoId: video.id, title: video.title, registeredAt: video.registeredAt, rules: evaluation.reasons })
      }
      return
    }
    if (current?.status === 'ng') return // 一度 NG になった動画は解放しない（許可リストは合流時に効く）
    const hold = decideHold(video, toObservation(author), this.config, this.now)
    if (hold.hold) {
      if (current?.status !== 'hold') pushEvent(this.state.events, { at: this.nowIso, kind: 'hold', id: video.id, authorId: video.authorId, note: hold.signals.join(',') })
      this.state.verdicts.videos[video.id] = {
        status: 'hold',
        reasons: [],
        holdSignals: hold.signals,
        authorId: video.authorId,
        title: video.title,
        registeredAt: video.registeredAt,
        since: current?.status === 'hold' ? current.since : this.nowIso,
        holdUntil: hold.until,
      }
      return
    }
    if (current?.status === 'hold') {
      this.state.verdicts.videos[video.id] = { ...current, status: 'released', holdUntil: null }
      pushEvent(this.state.events, { at: this.nowIso, kind: 'released', id: video.id, authorId: video.authorId })
    }
  }

  /** 新着を追跡に取り込み、タイトルと可視性だけで先に判定する */
  ingest(videos: SourceVideo[]): void {
    for (const v of videos) {
      if (this.isKnownVideo(v.id)) continue
      this.newVideos++
      const observation: VideoObservation = { id: v.id, title: v.title, authorId: v.authorId, registeredAt: v.registeredAt, tagDetails: null, ownerVisibility: v.ownerVisibility }
      if (v.authorId) {
        const author = this.ensureAuthor(v.authorId)
        author.posts.push({ id: v.id, title: v.title, at: v.registeredAt, tagDetails: null, ownerVisibility: v.ownerVisibility })
        if (v.registeredAt > author.lastPostAt) author.lastPostAt = v.registeredAt
        if (v.ownerVisibility && !author.visibility) author.visibility = v.ownerVisibility
        this.state.tracking.pending.push({ id: v.id, authorId: v.authorId, attempts: 0 })
      }
      this.applyVideo(observation)
    }
  }

  /** 投稿頻度 C に当たっている投稿者か（待ち行列の優先順位に使う） */
  isFrequentAuthor(authorId: string | null): boolean {
    const author = authorId ? this.state.tracking.authors[authorId] : undefined
    return !!author && isFrequent(author.posts.map((p) => p.at), this.config.freq)
  }

  /** getthumbinfo でロック状態を補完し、再判定する。連投中の投稿者の動画を先に処理する */
  async enrichPending(): Promise<void> {
    const pending = this.state.tracking.pending
      .map((item, index) => ({ item, index, priority: this.isFrequentAuthor(item.authorId) ? 0 : 1 }))
      .sort((a, b) => a.priority - b.priority || a.index - b.index)
      .map((x) => x.item)
    const keep: typeof pending = []
    let processed = 0
    for (let i = 0; i < pending.length; i++) {
      const item = pending[i]!
      if (processed >= LIMITS.thumbPerRun || !this.budgetLeft()) {
        keep.push(...pending.slice(i))
        break
      }
      const author = item.authorId ? this.state.tracking.authors[item.authorId] : undefined
      const post = author?.posts.find((p) => p.id === item.id)
      if (!author || !post) continue // 追跡から外れた（期限切れなど）
      processed++
      this.spend()
      let result
      try {
        result = await this.deps.fetchThumbInfo(item.id)
      } catch (error) {
        if (error instanceof AccessLimitedError) {
          pushEvent(this.state.events, { at: this.nowIso, kind: 'access_limited', note: error.message })
          this.note = error.message
          keep.push(...pending.slice(i))
          break
        }
        result = { ok: false as const, reason: 'error' as const }
      }
      if (result.ok) {
        post.tagDetails = result.info.tagDetails
        post.ownerVisibility = result.info.ownerVisibility
        author.visibility = result.info.ownerVisibility
        if (result.info.nickname && !author.nickname) author.nickname = result.info.nickname
        this.enriched++
        this.applyVideo(postToVideo(post, author.authorId))
        continue
      }
      if (result.reason === 'deleted') continue // 動画自体が消えた
      if (item.attempts + 1 < LIMITS.pendingMaxAttempts) keep.push({ ...item, attempts: item.attempts + 1 })
    }
    this.state.tracking.pending = keep
  }

  /** ユーザー情報 API で存在・フォロワー数を確認し、削除なら A∧C を判定する */
  async checkAuthors(): Promise<void> {
    const recheckBefore = this.now.getTime() - LIMITS.userRecheckHours * HOUR_MS
    // 連投中（C 該当）の投稿者を最優先にする。初回取り込みで待ち行列が長いときに、
    // 新しい連投の A∧C 判定が数時間後回しになるのを防ぐ
    const candidates = Object.values(this.state.tracking.authors)
      .filter((a) => isUserId(a.authorId) && a.status !== 'deleted')
      .filter((a) => a.lastCheckedAt === null || new Date(a.lastCheckedAt).getTime() <= recheckBefore)
      .map((a) => ({ a, priority: this.isFrequentAuthor(a.authorId) ? 0 : 1 }))
      .sort((x, y) => x.priority - y.priority || (x.a.lastCheckedAt ?? '').localeCompare(y.a.lastCheckedAt ?? '') || x.a.firstSeenAt.localeCompare(y.a.firstSeenAt))
      .map((x) => x.a)
      .slice(0, LIMITS.usersPerRun)
    for (const author of candidates) {
      if (!this.budgetLeft()) break
      this.spend()
      let info
      try {
        info = await this.deps.fetchUserInfo(author.authorId)
      } catch (error) {
        if (error instanceof AccessLimitedError) {
          pushEvent(this.state.events, { at: this.nowIso, kind: 'access_limited', note: error.message })
          this.note = error.message
          break
        }
        continue
      }
      this.usersChecked++
      author.lastCheckedAt = this.nowIso
      if (info.status === 'error') continue
      if (info.status === 'existing') {
        author.status = 'existing'
        author.followerCount = info.followerCount
        if (info.nickname) author.nickname = info.nickname
      } else {
        author.status = 'deleted'
        author.deletedObservedAt = author.deletedObservedAt ?? this.nowIso
        pushEvent(this.state.events, { at: this.nowIso, kind: 'author_deleted', authorId: author.authorId })
        const deletion = evaluateDeletion(toObservation(author)!, this.config)
        if (deletion.ng) this.setAuthorNg(author.authorId, ['A_C'], null)
      }
      // フォロワー数・状態が分かったので、この投稿者の動画を判定し直す（昇格条件・保留信号）
      for (const post of author.posts) this.applyVideo(postToVideo(post, author.authorId))
    }
  }

  /** 保留の期限切れを解放し、古い項目を刈り込む */
  expireAndPrune(): void {
    const nowMs = this.now.getTime()
    for (const [id, verdict] of Object.entries(this.state.verdicts.videos)) {
      if (verdict.status === 'hold' && verdict.holdUntil && new Date(verdict.holdUntil).getTime() <= nowMs) {
        const author = verdict.authorId ? this.state.tracking.authors[verdict.authorId] : undefined
        const post = author?.posts.find((p) => p.id === id)
        if (post && author) {
          this.applyVideo(postToVideo(post, author.authorId)) // ルール該当なら NG、無ければ released
        } else {
          this.state.verdicts.videos[id] = { ...verdict, status: 'released', holdUntil: null }
          pushEvent(this.state.events, { at: this.nowIso, kind: 'released', id, authorId: verdict.authorId })
        }
      }
    }
    const trackMs = this.config.trackDays * DAY_MS
    for (const [authorId, author] of Object.entries(this.state.tracking.authors)) {
      author.posts = author.posts.filter((p) => nowMs - new Date(p.at).getTime() <= trackMs)
      const stale = nowMs - new Date(author.lastPostAt).getTime() > trackMs
      if (stale && author.posts.length === 0) delete this.state.tracking.authors[authorId]
    }
    this.state.tracking.pending = this.state.tracking.pending.filter((p) => p.authorId && this.state.tracking.authors[p.authorId])
    for (const [id, verdict] of Object.entries(this.state.verdicts.videos)) {
      const ageMs = nowMs - new Date(verdict.since).getTime()
      const retention = verdict.status === 'released' ? LIMITS.releasedRetentionDays : LIMITS.videoVerdictRetentionDays
      if (ageMs > retention * DAY_MS) delete this.state.verdicts.videos[id]
    }
  }
}

function yesterdayJst(now: Date): string {
  const jst = new Date(now.getTime() + 9 * HOUR_MS)
  jst.setUTCDate(jst.getUTCDate() - 1)
  return jst.toISOString().slice(0, 10)
}

export async function runPoll(kv: KvLike, deps: PollDeps, mode: RunMode): Promise<RunResult> {
  const now = deps.now()
  const nowIso = now.toISOString()
  const base: RunResult = { mode, skipped: null, newVideos: 0, enriched: 0, usersChecked: 0, subrequests: 0, kvWrites: 0 }
  // 無効時は設定だけ読んで抜ける（KV は書かない）
  if (!(await loadEnabled(kv))) return { ...base, skipped: 'disabled' }
  const state = await loadState(kv, nowIso)
  if (!state.config.enabled) return { ...base, skipped: 'disabled' }
  const sweepDate = yesterdayJst(now)
  if (mode === 'sweep') {
    if (!state.config.sweepGenre) return { ...base, skipped: 'no_sweep_genre' }
    if (state.tracking.lastSweepDate === sweepDate) return { ...base, skipped: 'already_swept' }
  }
  const baseline = captureBaseline(state)
  const session = new Session(state, deps, now)

  if (mode === 'sweep' && state.config.sweepGenre) {
    session.spend(LIMITS.nvapiCost)
    const videos = await deps.fetchSweepVideos(state.config.sweepGenre, sweepDate)
    // 前日分をポーリングと同じく追跡に取り込む（差分取得の取りこぼしに対する日次の安全網）。
    // 取り込み済みの動画は除外されるので、通常は少数だけが新たに追跡される
    session.ingest(videos)
    await session.enrichPending()
    await session.checkAuthors()
    session.expireAndPrune()
    state.tracking.lastSweepDate = sweepDate
  } else {
    const since = state.tracking.lastPollAt
      ? new Date(new Date(state.tracking.lastPollAt).getTime() - LIMITS.sinceOverlapMinutes * MINUTE_MS)
      : new Date(now.getTime() - LIMITS.firstPollLookbackMinutes * MINUTE_MS)
    if (state.config.pollTags.length > 0) {
      session.spend(LIMITS.nvapiCost)
      try {
        session.ingest(await deps.fetchNewVideos(state.config.pollTags, since.toISOString()))
      } catch (error) {
        if (error instanceof AccessLimitedError) {
          pushEvent(state.events, { at: nowIso, kind: 'access_limited', note: error.message })
          session.note = error.message
        } else if (deps.fetchNewVideosFallback) {
          // 主経路（本家タグページ）が壊れたら予備（nvapi）で続ける。原因は履歴に残す
          const reason = error instanceof Error ? error.message : 'error'
          pushEvent(state.events, { at: nowIso, kind: 'error', note: `new_videos_primary_failed: ${reason}` })
          session.note = `fallback: ${reason}`
          try {
            session.ingest(await deps.fetchNewVideosFallback(state.config.pollTags, since.toISOString()))
          } catch (fallbackError) {
            if (!(fallbackError instanceof AccessLimitedError)) throw fallbackError
            pushEvent(state.events, { at: nowIso, kind: 'access_limited', note: fallbackError.message })
            session.note = fallbackError.message
          }
        } else {
          throw error
        }
      }
    }
    await session.enrichPending()
    await session.checkAuthors()
    session.expireAndPrune()
    state.tracking.lastPollAt = nowIso
  }

  // 定常の poll の要約は履歴に積まない（追跡表の lastRun に置く）。日次スイープは 1 日 1 件だけ残す
  if (mode === 'sweep') pushEvent(state.events, { at: nowIso, kind: 'sweep', note: `new=${session.newVideos} enriched=${session.enriched} users=${session.usersChecked}` })
  const summary = {
    newVideos: session.newVideos,
    enriched: session.enriched,
    usersChecked: session.usersChecked,
    subrequests: session.subrequests,
    ...(session.note ? { note: session.note } : {}),
  }
  const kvWrites = await saveState(kv, baseline, state, { at: nowIso, mode, ...summary })
  return { ...base, ...summary, kvWrites }
}
