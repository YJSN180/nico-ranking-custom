// 粗悪コンテンツ自動NGのルール評価（純粋関数）
// 方針文書「粗悪コンテンツ自動NG方針（確定版）」のルール A∧C / B / D / C∧D / HK と保留を実装する。
// すべて現在時刻を引数で受け取り、外部 I/O を持たない。
import type { TagDetail } from '../../types/ranking'
import { containsAnyNormalized, matchesAnySubsequenceNeedle } from './normalize'
import type {
  AuthorObservation,
  DeletionEvaluation,
  HoldDecision,
  HoldSignal,
  LqngConfig,
  LqngFrequencyConfig,
  LqngRuleId,
  VideoEvaluation,
  VideoObservation,
} from './types'

const HOUR_MS = 60 * 60 * 1000
const DAY_MS = 24 * HOUR_MS

function toMs(iso: string): number {
  const t = new Date(iso).getTime()
  return Number.isFinite(t) ? t : Number.NaN
}

/** ロック済みタグの集合が、グループのうちいくつに触れているか（グループ内は OR） */
export function countLockedGroups(tagDetails: readonly TagDetail[] | null | undefined, groups: readonly (readonly string[])[]): number {
  if (!tagDetails || tagDetails.length === 0 || groups.length === 0) return 0
  const locked = new Set(tagDetails.filter((t) => t.isLocked).map((t) => t.name))
  let n = 0
  for (const group of groups) if (group.some((name) => locked.has(name))) n++
  return n
}

/** 幅 windowMs の任意の窓に count 件以上あるか */
function hasWindowWithCount(sortedMs: readonly number[], windowMs: number, count: number): boolean {
  if (count <= 0) return true
  if (sortedMs.length < count) return false
  for (let i = 0; i + count - 1 < sortedMs.length; i++) {
    if (sortedMs[i + count - 1]! - sortedMs[i]! <= windowMs) return true
  }
  return false
}

/** 投稿頻度 C: 24 時間以内に dayCount 本以上、または burstMinutes 以内に burstCount 本以上 */
export function isFrequent(postTimes: readonly string[], freq: LqngFrequencyConfig): boolean {
  const sorted = Array.from(new Set(postTimes.map(toMs).filter((t) => Number.isFinite(t)))).sort((a, b) => a - b)
  return hasWindowWithCount(sorted, DAY_MS, freq.dayCount) || hasWindowWithCount(sorted, freq.burstMinutes * 60 * 1000, freq.burstCount)
}

function isAllowlisted(video: VideoObservation, config: LqngConfig): boolean {
  if (config.allowlist.videoIds.includes(video.id)) return true
  return video.authorId !== null && config.allowlist.authorIds.includes(video.authorId)
}

/**
 * D の投稿者昇格に課すフォロワー条件。
 * - 現存: フォロワー ≤ followerMax のときだけ
 * - 削除済み: フォロワー数が取れないため無条件
 * - 未確認（unknown）・追跡なし: まだ判断できないので昇格しない（ユーザー確認後に再評価される）
 */
function followerAllowsEscalation(author: AuthorObservation | null, config: LqngConfig): boolean {
  if (!author) return false
  if (author.status === 'deleted') return true
  if (author.status !== 'existing') return false
  if (author.followerCount === null || author.followerCount === undefined) return false
  return author.followerCount <= config.followerMax
}

/**
 * 動画 1 件の判定。
 * - B: タイトル照合語の部分列一致 → 動画 NG、投稿者昇格（条件なし）
 * - D: ロックタグ群 ≥ lockGroupsMin → 動画 NG、昇格は現存ならフォロワー ≤ followerMax のときだけ
 * - C∧D: 投稿頻度 ∧ D → 動画 NG、昇格（条件なし）
 * - HK: キーワード ∧（投稿頻度 または D）→ 動画 NG、昇格（条件なし）
 * 許可リストの動画・投稿者は常に非該当。
 */
export function evaluateVideo(video: VideoObservation, author: AuthorObservation | null, config: LqngConfig): VideoEvaluation {
  const lockedGroups = countLockedGroups(video.tagDetails, config.tagGroups)
  const postTimes = author ? [...author.postTimes, video.registeredAt] : [video.registeredAt]
  const frequent = isFrequent(postTimes, config.freq)
  const empty: VideoEvaluation = { ng: false, reasons: [], escalate: false, escalateReasons: [], lockedGroups, frequent }
  if (!config.enabled || isAllowlisted(video, config)) return empty

  const reasons: LqngRuleId[] = []
  const escalateReasons: LqngRuleId[] = []

  if (config.titleNeedles.length > 0 && matchesAnySubsequenceNeedle(video.title, config.titleNeedles)) {
    reasons.push('B')
    escalateReasons.push('B')
  }
  const d = config.tagGroups.length > 0 && lockedGroups >= config.lockGroupsMin
  if (d) {
    reasons.push('D')
    if (followerAllowsEscalation(author, config)) escalateReasons.push('D')
  }
  if (frequent && d) {
    reasons.push('C_D')
    escalateReasons.push('C_D')
  }
  if (config.keywordNeedles.length > 0 && (frequent || d) && containsAnyNormalized(video.title, config.keywordNeedles)) {
    reasons.push('HK')
    escalateReasons.push('HK')
  }

  return {
    ng: reasons.length > 0,
    reasons,
    escalate: escalateReasons.length > 0,
    escalateReasons,
    lockedGroups,
    frequent,
  }
}

/**
 * A∧C: 追跡期間内の投稿から deletionWindowDays 以内にアカウント削除（404）を観測し、
 * かつその投稿者が投稿頻度 C に該当する → 投稿者 NG。
 */
export function evaluateDeletion(author: AuthorObservation, config: LqngConfig): DeletionEvaluation {
  const none: DeletionEvaluation = { ng: false, reason: null }
  if (!config.enabled || author.status !== 'deleted' || !author.deletedObservedAt) return none
  if (config.allowlist.authorIds.includes(author.authorId)) return none
  const deletedAt = toMs(author.deletedObservedAt)
  if (!Number.isFinite(deletedAt)) return none
  const windowMs = config.deletionWindowDays * DAY_MS
  const recentPost = author.postTimes.some((t) => {
    const ms = toMs(t)
    return Number.isFinite(ms) && deletedAt >= ms && deletedAt - ms <= windowMs
  })
  if (!recentPost) return none
  if (!isFrequent(author.postTimes, config.freq)) return none
  return { ng: true, reason: 'A_C' }
}

/**
 * 保留: ルールに当たらない新着でも「投稿者が非公開」または「フォロワー ≤ followerMax」なら
 * 投稿から holdHours の間は非表示にする（確定ではない）。
 */
export function decideHold(video: VideoObservation, author: AuthorObservation | null, config: LqngConfig, now: Date): HoldDecision {
  const none: HoldDecision = { hold: false, signals: [], until: null }
  if (!config.enabled || isAllowlisted(video, config)) return none
  const registered = toMs(video.registeredAt)
  if (!Number.isFinite(registered)) return none
  const until = registered + config.holdHours * HOUR_MS
  if (now.getTime() >= until) return none
  const signals: HoldSignal[] = []
  const visibility = video.ownerVisibility ?? author?.visibility ?? null
  if (visibility === 'hidden') signals.push('hidden_owner')
  if (author?.status === 'existing' && author.followerCount !== null && author.followerCount !== undefined && author.followerCount <= config.followerMax) {
    signals.push('low_followers')
  }
  if (signals.length === 0) return none
  return { hold: true, signals, until: new Date(until).toISOString() }
}
