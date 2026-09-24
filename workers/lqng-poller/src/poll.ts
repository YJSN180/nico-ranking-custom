// ポーリング本体（受け箱の合流 → 刈り込み・保留の期限処理 → 差分取得 → 補完 → 投稿者確認 → 保存）
// 判定はすべて lib/lqng の純粋関数に委ね、ここでは追跡状態の更新と外部呼び出しの予算管理を行う。
// 1 回の実行で: 外部呼び出し ≤ subrequestBudget。KV は内容が変わったキーだけ書く（定常は追跡表の 1 回）。
// ロックは使わない（KV の get → put は原子的でなく排他にならない）。判定表を書くのはこの実行だけにする。
import { decideHold, evaluateDeletion, evaluateVideo, isFrequent } from '../../../lib/lqng/rules'
import type { AuthorObservation, LqngConfig, LqngEvidence, LqngRuleId, VideoObservation } from '../../../lib/lqng/types'
import { mergeDeltasIntoVerdicts, readInbox, type InboxItem } from './inbox'
import { AccessLimitedError, MAX_PAGES, NicoPagesFailedError, NICO_PAGE_KINDS, NICO_PAGES_PER_TAG, type PollDeps, type SourceVideo, type ThumbResult, type UserInfo } from './sources'
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
  /** 新着取得に使うタグの上限。本家タグページは タグ × 種別 2（動画/ショート）× 最大 2 ページ = 最大 12 リクエスト */
  pollTagsMax: 3,
  /** 予備（nvapi）・日次スイープ（Snapshot）は送ったページ数を返さないので、最大ページ数で見積もる */
  fallbackCost: MAX_PAGES,
  sweepCost: MAX_PAGES,
  /** 現存投稿者を再確認する間隔 */
  userRecheckHours: 6,
  /** 退会の確定に要る、1 回目の 404 から 2 回目の確認までの間隔 */
  deletionConfirmMinutes: 60,
  /** 1 回の確認でこの人数以上を見て、404 がこの割合以上なら退会判定をすべて保留する（API 側の異常対策） */
  deletionAnomalyMinChecks: 5,
  deletionAnomalyRatio: 0.8,
  /** 退会扱いの投稿者を再確認するまでの日数（存在すれば退会扱いを外す） */
  deletedRecheckDays: 7,
  /** 補完に失敗した動画を諦めるまでの試行回数（5xx・通信失敗などの一時的な不調は数えない） */
  pendingMaxAttempts: 3,
  /** getthumbinfo の一時的な不調がこの回数続いたら、上流の障害とみなしてその回の補完を打ち切る */
  thumbUnavailableAbort: 3,
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

  budgetLeft(cost = 1): boolean {
    return this.subrequests + cost <= LIMITS.subrequestBudget
  }

  spend(cost = 1): void {
    this.subrequests += cost
  }

  isKnownVideo(id: string): boolean {
    if (Object.hasOwn(this.state.verdicts.videos, id)) return true
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
   * 新着を取得して取り込む。主経路（本家タグページ）が壊れたら予備（nvapi）で続ける。
   * 取得できたときだけ true（false の回は最終取得時刻を進めず、次回に同じ区間を取り直す）
   */
  async ingestNewVideos(sinceIso: string): Promise<boolean> {
    if (this.config.pollTags.length === 0) return true
    // タグ数を抑えて、新着取得のリクエスト数（予算）に上限を設ける
    const tags = this.config.pollTags.slice(0, LIMITS.pollTagsMax)
    if (this.config.pollTags.length > tags.length) this.addNote(`poll_tags_capped: ${this.config.pollTags.length}>${LIMITS.pollTagsMax}`)
    let primaryError: unknown
    try {
      const result = await this.deps.fetchNewVideos(tags, sinceIso)
      this.spend(result.requests)
      this.ingest(result.videos)
      // 一部のページだけ取れなかった回は、取れた分を使う（予備には縮退しない）。
      // 取れなかったページの動画は次回以降の重なり（sinceOverlapMinutes）で取り直す
      if (result.failures.length > 0) this.addNote(`new_videos_partial: ${result.failures.join('; ')}`)
      return true
    } catch (error) {
      // 送ったページ数が分からない失敗は最大で見積もる
      this.spend(error instanceof NicoPagesFailedError ? error.requests : tags.length * NICO_PAGE_KINDS.length * NICO_PAGES_PER_TAG)
      if (error instanceof AccessLimitedError) {
        this.recordAccessLimited(error)
        return false
      }
      primaryError = error
    }
    const reason = messageOf(primaryError)
    const fallback = this.deps.fetchNewVideosFallback
    if (fallback) {
      // 原因は履歴に残す
      pushEvent(this.state.events, { at: this.nowIso, kind: 'error', note: `new_videos_primary_failed: ${reason}` })
      this.addNote(`fallback: ${reason}`)
      this.spend(LIMITS.fallbackCost)
      try {
        this.ingest(await fallback(tags, sinceIso))
        return true
      } catch (fallbackError) {
        if (fallbackError instanceof AccessLimitedError) {
          this.recordAccessLimited(fallbackError)
          return false
        }
        this.failNewVideos(`fallback: ${messageOf(fallbackError)}`, fallbackError)
        return false
      }
    }
    this.failNewVideos(reason, primaryError)
    return false
  }

  /** 新着を取れなかった回の記録（実行は止めずに補完・投稿者確認・受け箱の合流を続ける） */
  private failNewVideos(reason: string, error: unknown): void {
    pushEvent(this.state.events, { at: this.nowIso, kind: 'error', note: `new_videos_failed: ${reason}` })
    this.addNote(`new_videos_failed: ${reason}`)
    this.deps.reportError?.(error, 'new_videos')
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

  /** getthumbinfo でロック状態を補完し、再判定する。連投中の投稿者の動画を先に処理する */
  async enrichPending(): Promise<void> {
    const pending = this.state.tracking.pending
      .map((item, index) => ({ item, index, priority: this.isFrequentAuthor(item.authorId) ? 0 : 1 }))
      .sort((a, b) => a.priority - b.priority || a.index - b.index)
      .map((x) => x.item)
    const keep: typeof pending = []
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
        // 上流の一時的な不調は試行回数に数えずに持ち越す。続くようなら障害とみなして打ち切る
        keep.push(item)
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
    this.state.tracking.pending = keep
  }

  /** 確認の順番（小さいほど先）。確認しない投稿者は null */
  private checkPriority(author: TrackedAuthor, nowMs: number): number | null {
    if (!isUserId(author.authorId)) return null
    const sinceChecked = author.lastCheckedAt ? nowMs - new Date(author.lastCheckedAt).getTime() : Number.POSITIVE_INFINITY
    // 退会扱い: 一定期間後に 1 回だけ存在を確かめ直す（存在すれば退会扱いを外す）
    if (author.status === 'deleted') return sinceChecked >= LIMITS.deletedRecheckDays * DAY_MS ? 3 : null
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
   * 時間を置いた 2 回目で確定して A∧C を判定する。1 回の確認で 404 の割合が異常に高いときは、
   * その回の退会判定をすべて保留して記録する。
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
    for (const author of candidates) {
      if (!this.budgetLeft()) break
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
    // 退会扱いの再確認は 404 が当然なので割合に数えない
    const judged = results.filter((r) => r.author.status !== 'deleted' && r.info.status !== 'error')
    const notFound = judged.filter((r) => r.info.status === 'deleted').length
    const holdDeletions = judged.length >= LIMITS.deletionAnomalyMinChecks && notFound >= judged.length * LIMITS.deletionAnomalyRatio
    if (holdDeletions) {
      pushEvent(this.state.events, { at: this.nowIso, kind: 'deletion_held', note: `404 ${notFound}/${judged.length}` })
      this.addNote(`deletion_held: 404 ${notFound}/${judged.length}`)
    }
    for (const { author, info } of results) {
      this.usersChecked++
      author.lastCheckedAt = this.nowIso
      if (info.status === 'error') continue
      if (info.status === 'existing') this.markExisting(author, info)
      else if (!holdDeletions) this.markNotFound(author, nowMs)
      // フォロワー数・状態が分かったので、この投稿者の動画を判定し直す（昇格条件・保留信号）
      for (const post of author.posts) this.applyVideo(postToVideo(post, author.authorId))
    }
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

  /** 退会扱いのまま、まだ再確認していない（投稿が古くなっても追跡から外さない） */
  private awaitingDeletedRecheck(author: TrackedAuthor): boolean {
    if (author.status !== 'deleted' || !author.deletedObservedAt) return false
    if (!author.lastCheckedAt) return true
    return new Date(author.lastCheckedAt).getTime() - new Date(author.deletedObservedAt).getTime() < LIMITS.deletedRecheckDays * DAY_MS
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
  // バックフィルの確定分を先に合流する（以降の判定は合流後の判定表を見る）
  const inbox = await readInbox(kv, LIMITS.inboxPerRun)
  session.mergeInbox(inbox)
  // 判定に使う前に、追跡期間を過ぎた投稿を刈り込む（停止明けに古い連投で C / A∧C を成立させない）
  session.expireAndPrune()

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
    const since = state.tracking.lastPollAt
      ? new Date(new Date(state.tracking.lastPollAt).getTime() - LIMITS.sinceOverlapMinutes * MINUTE_MS)
      : new Date(now.getTime() - LIMITS.firstPollLookbackMinutes * MINUTE_MS)
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
  const kvWrites = await saveState(
    kv,
    baseline,
    state,
    { at: nowIso, mode, ...summary },
    inbox.map((item) => item.key)
  )
  return { ...base, ...summary, kvWrites }
}
