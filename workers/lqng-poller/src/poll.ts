// ポーリング本体（受け箱の合流 → 刈り込み・保留の期限処理 → 差分取得 → 補完 → 投稿者確認 → 保存）
// 判定はすべて lib/lqng の純粋関数に委ね、ここでは追跡状態の更新と外部呼び出しの予算管理を行う。
// 1 回の実行で: 外部呼び出し ≤ subrequestBudget。KV は内容が変わったキーだけ書く（定常は追跡表の 1 回）。
// ロックは使わない（KV の get → put は原子的でなく排他にならない）。判定表を書くのはこの実行だけにする。
import { LQNG_ISSUE_CONTROL_NOT_FOUND, LQNG_KV_KEYS, LQNG_POLL_TAGS_MAX, isLqngControlNotFound } from '../../../lib/lqng/config'
import { decideHold, evaluateDeletion, evaluateVideo, isFrequent } from '../../../lib/lqng/rules'
import type { AuthorObservation, LqngConfig, LqngEvidence, LqngRuleId, VideoObservation } from '../../../lib/lqng/types'
import { mergeDeltasIntoVerdicts, readInbox, type InboxItem } from './inbox'
import {
  AccessLimitedError,
  formatPageFailure,
  MAX_PAGES,
  NICO_PAGE_KINDS,
  NICO_PAGES_PER_TAG,
  type NewVideosResult,
  type PollDeps,
  type SourceVideo,
  type ThumbResult,
  type UserInfo,
} from './sources'
import {
  captureBaseline,
  EVENTS_MAX,
  loadEnabled,
  loadState,
  pushEvent,
  saveState,
  verdictsWriteProblem,
  type KvLike,
  type LoadedState,
  type LqngEvent,
  type LqngEventKind,
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
  /** 新着取得に使うタグの上限。本家タグページは タグ × 種別 2（動画/ショート）× 最大 2 ページ = 最大 12 リクエスト */
  pollTagsMax: LQNG_POLL_TAGS_MAX,
  /** 予備（nvapi）・日次スイープ（Snapshot）は送ったページ数を返さないので、最大ページ数で見積もる */
  fallbackCost: MAX_PAGES,
  sweepCost: MAX_PAGES,
  /** 現存投稿者を再確認する間隔 */
  userRecheckHours: 6,
  /** 退会の確定に要る、1 回目の 404 から 2 回目の確認までの間隔 */
  deletionConfirmMinutes: 60,
  /** 404 が出た回の対照に使う「最近存在を確認した投稿者」の範囲（時間） */
  controlFreshHours: 24,
  /** 退会扱いの投稿者を再確認するまでの日数（存在すれば退会扱いを外す） */
  deletedRecheckDays: 7,
  /** 補完に失敗した動画を諦めるまでの試行回数（5xx・通信失敗などの一時的な不調は数えない） */
  pendingMaxAttempts: 3,
  /** getthumbinfo の一時的な不調がこの回数続いたら、上流の障害とみなしてその回の補完を打ち切る */
  thumbUnavailableAbort: 3,
  /** 一時的な不調で補完できなかった回数の上限（待ち行列の後ろに回しながら数え、上限で諦める） */
  pendingMaxTransient: 8,
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
  /** 1 回の実行で合流するバックフィルの受け箱の上限（残りは次回） */
  inboxPerRun: 20,
  /** 続いている問題を解消とみなすまでの、続けて問題なく終わった回数 */
  issueResolveAfterOk: 3,
  /** 同じ問題を監視（reportError）へ出す間隔 */
  issueReportIntervalHours: 6,
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
const messageOf = (error: unknown): string => (error instanceof Error ? error.message : 'error')

function toObservation(author: TrackedAuthor | undefined): AuthorObservation | null {
  if (!author) return null
  return {
    authorId: author.authorId,
    status: author.status,
    followerCount: author.followerCount,
    visibility: author.visibility,
    posts: author.posts.map((p) => ({ id: p.id, at: p.at })),
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
  private readonly notes: string[] = []

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

  /** 直近の実行の要約に残す注記（アクセス制限・縮退・失敗など） */
  get note(): string | undefined {
    return this.notes.length > 0 ? this.notes.join('; ') : undefined
  }

  addNote(note: string): void {
    if (!this.notes.includes(note)) this.notes.push(note)
  }

  recordAccessLimited(error: AccessLimitedError): void {
    pushEvent(this.state.events, { at: this.nowIso, kind: 'access_limited', note: error.message })
    this.addNote(error.message)
  }

  /**
   * 続きうる問題を記録する。注記には毎回出す。履歴には内容（signature）が前回と変わったとき
   * （解消後の再発を含む）だけ積み、監視（reportError）へは内容が変わったときと、同じ内容なら
   * issueReportIntervalHours に 1 回だけ出す（同じ失敗や出たり消えたりが続いても履歴と監視を埋めない）
   */
  recordIssue(category: string, signature: string, note: string, kind: LqngEventKind, error?: unknown): void {
    this.addNote(note)
    const current = Object.hasOwn(this.state.tracking.issues, category) ? this.state.tracking.issues[category] : undefined
    const changed = current?.signature !== signature
    if (changed) pushEvent(this.state.events, { at: this.nowIso, kind, note })
    const lastReportMs = current?.reportedAt ? new Date(current.reportedAt).getTime() : Number.NEGATIVE_INFINITY
    const reportDue = error !== undefined && (changed || this.now.getTime() - lastReportMs >= LIMITS.issueReportIntervalHours * HOUR_MS)
    this.state.tracking.issues[category] = { signature, okStreak: 0, reportedAt: reportDue ? this.nowIso : (current?.reportedAt ?? null) }
    if (reportDue) this.deps.reportError?.(error, category)
  }

  /** 問題が起きずに終わった。issueResolveAfterOk 回続いたら解消とみなす（次に起きたらまた履歴に積む） */
  resolveIssue(category: string): void {
    const current = Object.hasOwn(this.state.tracking.issues, category) ? this.state.tracking.issues[category] : undefined
    if (!current) return
    if (current.okStreak + 1 >= LIMITS.issueResolveAfterOk) delete this.state.tracking.issues[category]
    else this.state.tracking.issues[category] = { ...current, okStreak: current.okStreak + 1 }
  }

  budgetLeft(cost = 1): boolean {
    return this.subrequests + cost <= LIMITS.subrequestBudget
  }

  spend(cost = 1): void {
    this.subrequests += cost
  }

  /**
   * 追跡している動画か（投稿・補完待ち・投稿者 ID の無い動画）。判定表は見ない: 判定表を書けて追跡表の前で
   * 落ちた回の動画や、バックフィルで判定だけ入った動画を、新着に出たときに追跡へ戻すため
   */
  isKnownVideo(id: string): boolean {
    if (this.state.tracking.pending.some((p) => p.id === id)) return true
    if (this.state.tracking.unattributed.some((u) => u.id === id)) return true
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

  /** バックフィルの受け箱を判定表へ合流する（冪等。判定表を書くのはこの実行だけ） */
  mergeInbox(items: readonly InboxItem[]): void {
    let authorsAdded = 0
    let reasonsAdded = 0
    let videosAdded = 0
    let invalid = 0
    for (const item of items) {
      if (!item.deltas) {
        invalid++
        continue
      }
      const r = mergeDeltasIntoVerdicts(this.state.verdicts, item.deltas, this.config, this.nowIso)
      authorsAdded += r.authorsAdded
      reasonsAdded += r.reasonsAdded
      videosAdded += r.videosAdded
    }
    if (invalid > 0) pushEvent(this.state.events, { at: this.nowIso, kind: 'error', note: `inbox_invalid: ${invalid}` })
    if (authorsAdded + reasonsAdded + videosAdded > 0) {
      pushEvent(this.state.events, { at: this.nowIso, kind: 'backfill', note: `投稿者 +${authorsAdded} / 動画 +${videosAdded}${reasonsAdded > 0 ? ` / 理由追加 ${reasonsAdded}` : ''}` })
    }
  }

  /**
   * 新着を取得して取り込む。本家タグページの失敗はタグ×種別ごとに扱い、通常動画のページが取れなかった
   * タグは予備（nvapi）で補う。ショートは nvapi に無いので補えない。
   * 全タグ×種別を取れた（通常動画は予備で補えた）ときだけ true。false の回は最終取得時刻を進めず、
   * 次の回に同じ区間を取り直す。取れなかったページは履歴（内容が変わったとき）・注記・監視に出す。
   */
  async ingestNewVideos(sinceIso: string): Promise<boolean> {
    if (this.config.pollTags.length === 0) return true
    // タグ数を抑えて、新着取得のリクエスト数（予算）に上限を設ける
    const tags = this.config.pollTags.slice(0, LIMITS.pollTagsMax)
    if (this.config.pollTags.length > tags.length) this.addNote(`poll_tags_capped: ${this.config.pollTags.length}>${LIMITS.pollTagsMax}`)
    let result: NewVideosResult
    try {
      result = await this.deps.fetchNewVideos(tags, sinceIso)
    } catch (error) {
      // 想定外の例外は、全タグ×種別が取れなかったものとして扱う（送ったページ数は最大で見積もる）
      const reason = messageOf(error)
      result = {
        videos: [],
        failures: tags.flatMap((_, tagIndex) => NICO_PAGE_KINDS.map((kind) => ({ tagIndex, kind, page: 1, reason }))),
        requests: tags.length * NICO_PAGE_KINDS.length * NICO_PAGES_PER_TAG,
      }
    }
    this.spend(result.requests)
    this.ingest(result.videos)
    if (result.failures.length === 0) {
      this.resolveIssue('new_videos')
      return true
    }
    let complete = !result.failures.some((f) => f.kind !== 'tag')
    const parts = result.failures.map(formatPageFailure)
    let fallbackFailure: unknown
    // 通常動画のページが取れなかったタグは予備（nvapi）で補う
    const regularFailed = Array.from(new Set(result.failures.filter((f) => f.kind === 'tag').map((f) => f.tagIndex))).sort((a, b) => a - b)
    if (regularFailed.length > 0) {
      const label = `fallback(${regularFailed.map((i) => `t${i}`).join(',')})`
      const fallback = this.deps.fetchNewVideosFallback
      if (!fallback) {
        complete = false
        parts.push(`${label}: unavailable`)
      } else {
        this.spend(LIMITS.fallbackCost)
        try {
          this.ingest(await fallback(regularFailed.map((i) => tags[i]).filter((t): t is string => t !== undefined), sinceIso))
          parts.push(`${label}: ok`)
        } catch (error) {
          complete = false
          fallbackFailure = error
          if (error instanceof AccessLimitedError) this.recordAccessLimited(error)
          parts.push(`${label}: ${messageOf(error)}`)
        }
      }
    }
    // 同じ失敗かどうかは、失敗したタグ×種別と予備の成否で見る（理由の細かな違いでは履歴に積み直さない）
    const signature = [...new Set(result.failures.map((f) => `t${f.tagIndex}:${f.kind}`))].sort().join(',') + (fallbackFailure === undefined ? '' : '|fallback')
    const note = `new_videos_failed: ${parts.join('; ')}`
    this.recordIssue('new_videos', signature, note, 'error', fallbackFailure instanceof Error ? fallbackFailure : new Error(`new_videos_failed: ${signature}`))
    return complete
  }

  /** 新着を追跡に取り込み、タイトルと可視性だけで先に判定する */
  ingest(videos: SourceVideo[]): void {
    const nowMs = this.now.getTime()
    const trackMs = this.config.trackDays * DAY_MS
    for (const v of videos) {
      // 追跡期間より古い動画は取り込まない（取り込んでも次の刈り込みで消え、取り込み直すたびに
      // 古い連投を投稿頻度に数えてしまう）
      if (nowMs - new Date(v.registeredAt).getTime() > trackMs) continue
      if (this.isKnownVideo(v.id)) continue
      this.newVideos++
      const observation: VideoObservation = { id: v.id, title: v.title, authorId: v.authorId, registeredAt: v.registeredAt, tagDetails: null, ownerVisibility: v.ownerVisibility }
      if (v.authorId) {
        const author = this.ensureAuthor(v.authorId)
        author.posts.push({ id: v.id, title: v.title, at: v.registeredAt, tagDetails: null, ownerVisibility: v.ownerVisibility })
        if (v.registeredAt > author.lastPostAt) author.lastPostAt = v.registeredAt
        if (v.ownerVisibility && !author.visibility) author.visibility = v.ownerVisibility
        this.state.tracking.pending.push({ id: v.id, authorId: v.authorId, attempts: 0 })
      } else {
        this.state.tracking.unattributed.push({ id: v.id, at: v.registeredAt })
      }
      this.applyVideo(observation)
    }
  }

  /** 投稿頻度 C に当たっている投稿者か（待ち行列の優先順位に使う） */
  isFrequentAuthor(authorId: string | null): boolean {
    const author = authorId ? this.state.tracking.authors[authorId] : undefined
    return !!author && isFrequent(author.posts, this.config.freq)
  }

  /**
   * getthumbinfo でロック状態を補完し、再判定する。連投中の投稿者の動画を先に、一時的な不調で
   * 補完できなかった動画を後に処理する（同じ動画が失敗し続けて待ち行列の先頭に居座らないように）
   */
  async enrichPending(): Promise<void> {
    const pending = this.state.tracking.pending
      .map((item, index) => ({ item, index, priority: this.isFrequentAuthor(item.authorId) ? 0 : 1 }))
      .sort((a, b) => a.priority - b.priority || (a.item.transient ?? 0) - (b.item.transient ?? 0) || a.index - b.index)
      .map((x) => x.item)
    const keep: typeof pending = []
    /** 一時的な不調で補完できなかった動画（待ち行列の末尾に回す） */
    const retryLater: typeof pending = []
    let processed = 0
    let unavailableInRow = 0
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
      let result: ThumbResult
      try {
        result = await this.deps.fetchThumbInfo(item.id)
      } catch (error) {
        if (error instanceof AccessLimitedError) {
          this.recordAccessLimited(error)
          keep.push(...pending.slice(i))
          break
        }
        result = { ok: false, reason: 'unavailable' } // 通信失敗・タイムアウト
      }
      if (!result.ok && result.reason === 'unavailable') {
        // 上流の一時的な不調は試行回数に数えず、末尾に回して持ち越す（上限を超えたら諦める）。
        // 続くようなら障害とみなして打ち切る
        const transient = (item.transient ?? 0) + 1
        if (transient < LIMITS.pendingMaxTransient) retryLater.push({ ...item, transient })
        if (++unavailableInRow >= LIMITS.thumbUnavailableAbort) {
          keep.push(...pending.slice(i + 1))
          this.addNote('getthumbinfo_unavailable')
          break
        }
        continue
      }
      unavailableInRow = 0
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
    this.state.tracking.pending = [...keep, ...retryLater]
  }

  /** 確認の順番（小さいほど先）。確認しない投稿者は null */
  private checkPriority(author: TrackedAuthor, nowMs: number): number | null {
    if (!isUserId(author.authorId)) return null
    const sinceChecked = author.lastCheckedAt ? nowMs - new Date(author.lastCheckedAt).getTime() : Number.POSITIVE_INFINITY
    // 退会扱い: 一定期間後に 1 回だけ存在を確かめ直す（存在すれば退会扱いを外す）。
    // 定期確認と同じ順位に置き、最後の確認が古い順で先に来るので、定期確認に押されて止まらない
    if (author.status === 'deleted') return sinceChecked >= LIMITS.deletedRecheckDays * DAY_MS ? 2 : null
    // 退会の疑い: 1 回目の 404 から時間を置いて最優先で確かめ、確定させる
    if (author.deletionSuspectedAt) {
      const confirmMs = LIMITS.deletionConfirmMinutes * MINUTE_MS
      return nowMs - new Date(author.deletionSuspectedAt).getTime() >= confirmMs && sinceChecked >= confirmMs ? 0 : null
    }
    if (sinceChecked < LIMITS.userRecheckHours * HOUR_MS) return null
    // 連投中（C 該当）の投稿者を先にする。初回取り込みで待ち行列が長いときに、
    // 新しい連投の A∧C 判定が数時間後回しになるのを防ぐ
    return this.isFrequentAuthor(author.authorId) ? 1 : 2
  }

  /**
   * ユーザー情報 API で存在・フォロワー数を確認する。退会（NOT_FOUND の 404）は 1 回目を疑いとし、
   * 時間を置いた 2 回目で確定して A∧C を判定する。404 が出た回は、API が存在するユーザーに 200 を
   * 返しているかを対照で確かめ、確かめられなければその回の 404 をすべて保留する（次の回に確かめ直す）。
   */
  async checkAuthors(): Promise<void> {
    const nowMs = this.now.getTime()
    const candidates = Object.values(this.state.tracking.authors)
      .map((a) => ({ a, priority: this.checkPriority(a, nowMs) }))
      .filter((x): x is { a: TrackedAuthor; priority: number } => x.priority !== null)
      .sort((x, y) => x.priority - y.priority || (x.a.lastCheckedAt ?? '').localeCompare(y.a.lastCheckedAt ?? '') || x.a.firstSeenAt.localeCompare(y.a.firstSeenAt))
      .map((x) => x.a)
      .slice(0, LIMITS.usersPerRun)
    const results: Array<{ author: TrackedAuthor; info: UserInfo }> = []
    // 404 が出たときの対照の確認に 1 回分を残す。設定の対照が見つからないと分かっている間は、
    // 追跡中の候補で確かめ直す分も残す
    const controlReserve = isLqngControlNotFound(this.config.controlUserId, this.state.tracking.issues) ? 2 : 1
    for (const author of candidates) {
      if (!this.budgetLeft(1 + controlReserve)) break
      this.spend()
      try {
        results.push({ author, info: await this.deps.fetchUserInfo(author.authorId) })
      } catch (error) {
        if (error instanceof AccessLimitedError) {
          this.recordAccessLimited(error)
          break
        }
        // 通信の失敗などは次回に確かめ直す
      }
    }
    // 退会扱いの再確認は 404 が当然なので、対照の確認の対象にしない
    const notFound = results.filter((r) => r.author.status !== 'deleted' && r.info.status === 'deleted').length
    const hold = notFound > 0 ? await this.verifyUserApi(results) : null
    if (hold !== null) {
      // 対照が見つからない・確かめられない状態が続くと退会を確定できないので、理由を問わず監視に出す（間引きは recordIssue）
      this.recordIssue('deletion_held', hold, `deletion_held: ${hold} (404 ${notFound}/${results.length})`, 'deletion_held', new Error(`deletion_held: ${hold}`))
    } else if (notFound > 0) {
      this.resolveIssue('deletion_held')
    }
    for (const { author, info } of results) {
      this.usersChecked++
      // 保留した 404 は確かめなかったものとして扱い、lastCheckedAt を進めずに次の回に確かめ直す
      const held = hold !== null && info.status === 'deleted' && author.status !== 'deleted'
      if (held) continue
      author.lastCheckedAt = this.nowIso
      if (info.status === 'error') continue
      if (info.status === 'existing') this.markExisting(author, info)
      else this.markNotFound(author, nowMs)
      // フォロワー数・状態が分かったので、この投稿者の動画を判定し直す（昇格条件・保留信号）
      for (const post of author.posts) this.applyVideo(postToVideo(post, author.authorId))
    }
  }

  /**
   * 404 が出た回に、ユーザー情報 API が存在するユーザーに 200 を返しているかを確かめる。
   * 同じ回に存在の確認が取れていればそれで足りる。無ければ存在が分かっている対照を確かめる
   * （API の変更で全員が 404 になったときに、実在の連投者を A∧C で恒久 NG にしないため）。
   * 設定の対照を先に使い、それが 404・失敗なら追跡中の候補で確かめ直す（打ち間違いや退会した ID の
   * せいで、退会をずっと確定できなくならないように）。設定の対照が 404 だったことは続く問題として
   * 記録し、管理画面の概要と監視に出す。問題が無ければ null、保留するならその理由を返す。
   */
  private async verifyUserApi(results: ReadonlyArray<{ author: TrackedAuthor; info: UserInfo }>): Promise<string | null> {
    if (results.some((r) => r.info.status === 'existing')) return null
    const exclude = new Set(results.map((r) => r.author.authorId))
    const configured = this.config.controlUserId
    if (!configured) {
      const control = this.pickControl(exclude)
      return control === null ? 'no_control' : this.checkControl(control)
    }
    const hold = await this.checkControl(configured)
    if (hold === null) {
      this.resolveIssue(LQNG_ISSUE_CONTROL_NOT_FOUND)
      return null
    }
    if (hold === 'control_404') {
      // 対照の ID は記録の signature にだけ置き、履歴の注記と監視には出さない
      this.recordIssue(LQNG_ISSUE_CONTROL_NOT_FOUND, configured, LQNG_ISSUE_CONTROL_NOT_FOUND, 'control_not_found', new Error('control_not_found: the configured control user returned 404'))
    }
    // アクセス制限なら同じ回にほかの対照を確かめても通らない。予算切れも次の回に回す
    if (hold === 'control_access_limited' || hold === 'no_budget') return hold
    exclude.add(configured)
    const fallback = this.pickControl(exclude)
    return fallback === null ? hold : this.checkControl(fallback)
  }

  /** 対照を 1 件確かめる。存在すれば null、そうでなければ保留の理由を返す */
  private async checkControl(control: string): Promise<string | null> {
    if (!this.budgetLeft()) return 'no_budget'
    this.spend()
    let info: UserInfo
    try {
      info = await this.deps.fetchUserInfo(control)
    } catch (error) {
      if (error instanceof AccessLimitedError) {
        this.recordAccessLimited(error)
        return 'control_access_limited'
      }
      return 'control_error'
    }
    this.usersChecked++
    if (info.status !== 'existing') return info.status === 'deleted' ? 'control_404' : 'control_error'
    const tracked = Object.hasOwn(this.state.tracking.authors, control) ? this.state.tracking.authors[control] : undefined
    if (tracked) {
      tracked.lastCheckedAt = this.nowIso
      tracked.followerCount = info.followerCount
    }
    return null
  }

  /**
   * 追跡中の対照の候補: 最近存在を確認した投稿者のうち、連投しておらず、フォロワーが followerMax より
   * 多い人（フォロワーの多い順）。同じ波で退会しうる連投アカウントや、捨てアカウントらしい投稿者を
   * 対照にしないため。設定の対照が無いとき、または設定の対照が 404・失敗だったときに使う
   */
  private pickControl(exclude: ReadonlySet<string>): string | null {
    const nowMs = this.now.getTime()
    const checkedMs = (a: TrackedAuthor): number => (a.lastCheckedAt ? new Date(a.lastCheckedAt).getTime() : Number.NEGATIVE_INFINITY)
    const tracked = Object.values(this.state.tracking.authors)
      .filter((a) => a.status === 'existing' && !a.deletionSuspectedAt && isUserId(a.authorId) && !exclude.has(a.authorId))
      .filter((a) => nowMs - checkedMs(a) <= LIMITS.controlFreshHours * HOUR_MS && (a.followerCount ?? 0) > this.config.followerMax && !this.isFrequentAuthor(a.authorId))
      .sort((x, y) => (y.followerCount ?? -1) - (x.followerCount ?? -1) || checkedMs(y) - checkedMs(x))
    return tracked[0]?.authorId ?? null
  }

  private markExisting(author: TrackedAuthor, info: UserInfo): void {
    const wasDeleted = author.status === 'deleted'
    author.status = 'existing'
    author.followerCount = info.followerCount
    if (info.nickname) author.nickname = info.nickname
    author.deletionSuspectedAt = null
    if (!wasDeleted) return
    // 退会扱いを外す。投稿者 NG（恒久）は自動では外さず、管理画面で確かめられるよう履歴に残す
    author.deletedObservedAt = null
    const verdict = Object.hasOwn(this.state.verdicts.authors, author.authorId) ? this.state.verdicts.authors[author.authorId] : undefined
    if (verdict) {
      verdict.deletedObservedAt = null
      verdict.followerCount = info.followerCount
    }
    pushEvent(this.state.events, { at: this.nowIso, kind: 'author_restored', authorId: author.authorId, ...(verdict ? { reasons: verdict.reasons } : {}) })
  }

  private markNotFound(author: TrackedAuthor, nowMs: number): void {
    if (author.status === 'deleted') return // 再確認でも 404: 退会のまま
    const suspectedAt = author.deletionSuspectedAt
    if (!suspectedAt) {
      author.deletionSuspectedAt = this.nowIso // 1 回目: 疑いにとどめる
      return
    }
    if (nowMs - new Date(suspectedAt).getTime() < LIMITS.deletionConfirmMinutes * MINUTE_MS) return
    author.status = 'deleted'
    author.deletedObservedAt = suspectedAt // 最初に 404 を観測した時刻
    author.deletionSuspectedAt = null
    pushEvent(this.state.events, { at: this.nowIso, kind: 'author_deleted', authorId: author.authorId })
    const observation = toObservation(author)
    if (observation && evaluateDeletion(observation, this.config).ng) this.setAuthorNg(author.authorId, ['A_C'], null)
  }

  /**
   * 退会扱いなのに投稿者 NG が無い追跡中の投稿者に、A∧C の評価をかけ直す（外部呼び出しなし）。
   * 退会を確定した回の判定表の書き込みが、同時に走った別の実行に上書きされても、A∧C を失わないため。
   */
  reevaluateDeletedAuthors(): void {
    for (const author of Object.values(this.state.tracking.authors)) {
      if (author.status !== 'deleted' || Object.hasOwn(this.state.verdicts.authors, author.authorId)) continue
      const observation = toObservation(author)
      if (observation && evaluateDeletion(observation, this.config).ng) this.setAuthorNg(author.authorId, ['A_C'], null)
    }
  }

  /** 退会扱いのまま、まだ再確認していない（投稿が古くなっても追跡から外さない） */
  private awaitingDeletedRecheck(author: TrackedAuthor): boolean {
    if (author.status !== 'deleted' || !author.deletedObservedAt) return false
    if (!author.lastCheckedAt) return true
    return new Date(author.lastCheckedAt).getTime() - new Date(author.deletedObservedAt).getTime() < LIMITS.deletedRecheckDays * DAY_MS
  }

  /**
   * 判定表にあって追跡に無い動画（NG・保留）のうち追跡期間内のものを、追跡と補完待ちに戻す。
   * 判定表を書けて追跡表の前で落ちた回の動画が、投稿頻度にも補完（ロックタグ群）にも数えられなくなるのを防ぐ。
   */
  restoreUntrackedVerdicts(): void {
    const nowMs = this.now.getTime()
    const trackMs = this.config.trackDays * DAY_MS
    const tracked = new Set<string>()
    for (const author of Object.values(this.state.tracking.authors)) for (const post of author.posts) tracked.add(post.id)
    for (const item of this.state.tracking.pending) tracked.add(item.id)
    for (const item of this.state.tracking.unattributed) tracked.add(item.id)
    for (const [id, verdict] of Object.entries(this.state.verdicts.videos)) {
      if (tracked.has(id) || verdict.status === 'released') continue
      const atMs = new Date(verdict.registeredAt).getTime()
      if (!Number.isFinite(atMs) || nowMs - atMs > trackMs) continue
      if (verdict.authorId === null) {
        this.state.tracking.unattributed.push({ id, at: verdict.registeredAt })
        continue
      }
      const author = this.ensureAuthor(verdict.authorId)
      author.posts.push({ id, title: verdict.title, at: verdict.registeredAt, tagDetails: null, ownerVisibility: null })
      if (verdict.registeredAt > author.lastPostAt) author.lastPostAt = verdict.registeredAt
      this.state.tracking.pending.push({ id, authorId: verdict.authorId, attempts: 0 })
    }
  }

  /**
   * 追跡期間を過ぎた投稿・投稿者を刈り込み、保留の期限切れを解放する。
   * 実行の最初に呼ぶ（停止明けなどに、追跡期間外の古い連投で C / A∧C を判定しないため）
   */
  expireAndPrune(): void {
    const nowMs = this.now.getTime()
    const trackMs = this.config.trackDays * DAY_MS
    for (const [authorId, author] of Object.entries(this.state.tracking.authors)) {
      author.posts = author.posts.filter((p) => nowMs - new Date(p.at).getTime() <= trackMs)
      const stale = nowMs - new Date(author.lastPostAt).getTime() > trackMs
      if (stale && author.posts.length === 0 && !this.awaitingDeletedRecheck(author)) delete this.state.tracking.authors[authorId]
    }
    this.state.tracking.pending = this.state.tracking.pending.filter((p) => p.authorId && this.state.tracking.authors[p.authorId])
    this.state.tracking.unattributed = this.state.tracking.unattributed.filter((u) => nowMs - new Date(u.at).getTime() <= trackMs)
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
    for (const [id, verdict] of Object.entries(this.state.verdicts.videos)) {
      const ageMs = nowMs - new Date(verdict.since).getTime()
      const retention = verdict.status === 'released' ? LIMITS.releasedRetentionDays : LIMITS.videoVerdictRetentionDays
      if (ageMs > retention * DAY_MS) delete this.state.verdicts.videos[id]
    }
  }
}

/**
 * 判定表を書けない回（読めない・投稿者 NG が減る）: 判定表・追跡表・受け箱には触れず、エラーだけを
 * 履歴に残して監視に出す。追跡表を進めないので、直ったあとの回が同じ区間と受け箱を取り直す。
 * 同じエラーが続く間は履歴に積み直さない（書き込みなし）
 */
async function refuseSave(kv: KvLike, deps: PollDeps, loadedEvents: readonly LqngEvent[], lastRun: LoadedState['events']['lastRun'], at: string, note: string): Promise<number> {
  // 同じエラーを積んでから間もなければ、履歴にも監視にも出し直さない（追跡表を書かないので、履歴の時刻で間引く）
  const top = loadedEvents[0]
  if (top?.kind === 'error' && top.note === note && new Date(at).getTime() - new Date(top.at).getTime() < LIMITS.issueReportIntervalHours * HOUR_MS) return 0
  deps.reportError?.(new Error(note), 'verdicts')
  const event: LqngEvent = { at, kind: 'error', note }
  const items = [event, ...loadedEvents].slice(0, EVENTS_MAX)
  await kv.put(LQNG_KV_KEYS.events, JSON.stringify({ version: 1, items, lastRun }))
  return 1
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
  // 判定表が読めないときは空として扱わない（空で上書きすると投稿者 NG をすべて失う）
  if (!state.verdictsReadable) {
    const kvWrites = await refuseSave(kv, deps, state.events.items, state.events.lastRun, nowIso, 'verdicts_unreadable')
    return { ...base, skipped: 'verdicts_unreadable', kvWrites, note: 'verdicts_unreadable' }
  }
  const sweepDate = yesterdayJst(now)
  if (mode === 'sweep') {
    if (!state.config.sweepGenre) return { ...base, skipped: 'no_sweep_genre' }
    if (state.tracking.lastSweepDate === sweepDate) return { ...base, skipped: 'already_swept' }
  }
  const baseline = captureBaseline(state)
  /** 読み込み時の履歴（判定表を書けない回は、この回に積んだ出来事を捨ててエラーだけを残す） */
  const loadedEvents = state.events.items.slice()
  const session = new Session(state, deps, now)
  // バックフィルの確定分を先に合流する（以降の判定は合流後の判定表を見る）
  const inbox = await readInbox(kv, LIMITS.inboxPerRun)
  session.mergeInbox(inbox)
  // 判定表にだけある動画を追跡に戻し、判定に使う前に追跡期間を過ぎた投稿を刈り込む
  // （停止明けに古い連投で C / A∧C を成立させない）
  session.restoreUntrackedVerdicts()
  session.expireAndPrune()
  session.reevaluateDeletedAuthors()

  if (mode === 'sweep' && state.config.sweepGenre) {
    session.spend(LIMITS.sweepCost)
    const videos = await deps.fetchSweepVideos(state.config.sweepGenre, sweepDate)
    // 前日分をポーリングと同じく追跡に取り込む（差分取得の取りこぼしに対する日次の安全網）。
    // 取り込み済みの動画は除外されるので、通常は少数だけが新たに追跡される
    session.ingest(videos)
    await session.enrichPending()
    await session.checkAuthors()
    state.tracking.lastSweepDate = sweepDate
  } else {
    const fromLastPoll = state.tracking.lastPollAt
      ? new Date(state.tracking.lastPollAt).getTime() - LIMITS.sinceOverlapMinutes * MINUTE_MS
      : now.getTime() - LIMITS.firstPollLookbackMinutes * MINUTE_MS
    // 最終取得時刻が止まったままでも（ショートが取れない状態が続くなど）、追跡期間より前は取りに行かない
    const since = new Date(Math.max(fromLastPoll, now.getTime() - state.config.trackDays * DAY_MS))
    const fetched = await session.ingestNewVideos(since.toISOString())
    await session.enrichPending()
    await session.checkAuthors()
    // 新着を取れなかった回は進めない（取れなかった区間を次回の重なりで取り直す）
    if (fetched) state.tracking.lastPollAt = nowIso
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
  const problem = verdictsWriteProblem(baseline, state.verdicts)
  if (problem !== null) {
    const kvWrites = await refuseSave(kv, deps, loadedEvents, state.events.lastRun, nowIso, problem)
    return { ...base, ...summary, skipped: 'verdicts_shrank', kvWrites, note: problem }
  }
  const kvWrites = await saveState(
    kv,
    baseline,
    state,
    { at: nowIso, mode, ...summary },
    inbox.map((item) => item.key)
  )
  return { ...base, ...summary, kvWrites }
}
