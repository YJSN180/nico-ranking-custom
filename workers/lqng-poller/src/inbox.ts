// 判定表への差分の受け箱（lqng:inbox:<runId>:<seq>）
// 判定表（lqng:verdicts）を書くのはポーリング（runPoll）だけにする。バックフィルの確定
// （/trigger?mode=backfill-commit）は判定表を読み書きせず、差分を一意なキーに 1 回で置く。
// 次のポーリングが受け箱を読んで冪等に合流し、判定表を保存してから合流したキーを消す。
// 同じ差分を何度合流しても結果は変わらない（投稿者は理由と根拠の和集合、動画は未登録のときだけ足す）。
import { LQNG_KV_KEYS } from '../../../lib/lqng/config'
import type { AuthorVerdict, LqngConfig, LqngEvidence, LqngRuleId, LqngVerdicts, VideoVerdict } from '../../../lib/lqng/types'
import type { KvLike } from './state'

/** バックフィルが見つけた判定の差分（投稿者 NG と動画 NG） */
export interface BackfillDeltas {
  authors: Record<string, AuthorVerdict>
  videos: Record<string, VideoVerdict>
}

export interface InboxItem {
  key: string
  /** 読めなかった・形が壊れていたときは null（合流せずに消す） */
  deltas: BackfillDeltas | null
}

export interface InboxMergeResult {
  authorsAdded: number
  /** 既存の投稿者 NG に理由を足した数 */
  reasonsAdded: number
  videosAdded: number
}

export class InvalidInboxRefError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'InvalidInboxRefError'
  }
}

export const INBOX_EVIDENCE_MAX = 10

const RULE_IDS: ReadonlySet<string> = new Set<LqngRuleId>(['A_C', 'B', 'D', 'C_D', 'HK'])
const AUTHOR_ID_PATTERN = /^(?:\d{1,12}|channel\/ch\d{1,12})$/
const VIDEO_ID_PATTERN = /^[a-z]{2}\d{1,12}$/
const RUN_ID_PATTERN = /^[A-Za-z0-9_-]{1,64}$/
const SEQ_MAX = 999_999

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v)

export function emptyDeltas(): BackfillDeltas {
  return { authors: {}, videos: {} }
}

/** 受け箱のキー。runId は実行ごと（例: GitHub Actions の run id）、seq はその実行内の確定の連番 */
export function inboxKey(runId: string, seq: number): string {
  if (!RUN_ID_PATTERN.test(runId)) throw new InvalidInboxRefError('invalid runId')
  if (!Number.isInteger(seq) || seq < 0 || seq > SEQ_MAX) throw new InvalidInboxRefError('invalid seq')
  return `${LQNG_KV_KEYS.inboxPrefix}${runId}:${String(seq).padStart(6, '0')}`
}

function normalizeReasons(raw: unknown): LqngRuleId[] {
  if (!Array.isArray(raw)) return []
  return Array.from(new Set(raw.filter((r): r is LqngRuleId => typeof r === 'string' && RULE_IDS.has(r))))
}

function normalizeEvidence(raw: unknown): LqngEvidence[] {
  if (!Array.isArray(raw)) return []
  const out: LqngEvidence[] = []
  for (const e of raw) {
    if (!isRecord(e) || typeof e.videoId !== 'string' || typeof e.title !== 'string' || typeof e.registeredAt !== 'string') continue
    if (out.some((x) => x.videoId === e.videoId)) continue
    out.push({ videoId: e.videoId, title: e.title, registeredAt: e.registeredAt, rules: normalizeReasons(e.rules) })
    if (out.length >= INBOX_EVIDENCE_MAX) break
  }
  return out
}

const nullableString = (v: unknown): string | null => (typeof v === 'string' ? v : null)
const nullableNumber = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null)

/** 外から来た差分（HTTP の本文・KV の値）を検証し、形の正しい NG 判定だけを残す */
export function normalizeDeltas(raw: unknown): BackfillDeltas {
  const out = emptyDeltas()
  if (!isRecord(raw)) return out
  if (isRecord(raw.authors)) {
    for (const [id, v] of Object.entries(raw.authors)) {
      if (!AUTHOR_ID_PATTERN.test(id) || !isRecord(v) || v.status !== 'ng') continue
      const reasons = normalizeReasons(v.reasons)
      if (reasons.length === 0) continue
      out.authors[id] = {
        status: 'ng',
        reasons,
        since: typeof v.since === 'string' ? v.since : '',
        evidence: normalizeEvidence(v.evidence),
        nickname: nullableString(v.nickname),
        followerCount: nullableNumber(v.followerCount),
        visibility: v.visibility === 'visible' || v.visibility === 'hidden' ? v.visibility : null,
        deletedObservedAt: nullableString(v.deletedObservedAt),
      }
    }
  }
  if (isRecord(raw.videos)) {
    for (const [id, v] of Object.entries(raw.videos)) {
      if (!VIDEO_ID_PATTERN.test(id) || !isRecord(v) || v.status !== 'ng') continue
      const reasons = normalizeReasons(v.reasons)
      if (reasons.length === 0 || typeof v.title !== 'string' || typeof v.registeredAt !== 'string') continue
      const authorId = typeof v.authorId === 'string' && AUTHOR_ID_PATTERN.test(v.authorId) ? v.authorId : null
      out.videos[id] = { status: 'ng', reasons, authorId, title: v.title, registeredAt: v.registeredAt, since: typeof v.since === 'string' ? v.since : '' }
    }
  }
  return out
}

/** 差分を受け箱に 1 キーで置く（書き込み 1 回）。同じ runId・seq の再送は同じキーの上書きになる */
export async function writeInboxItem(kv: KvLike, runId: string, seq: number, at: string, deltas: BackfillDeltas): Promise<string> {
  const key = inboxKey(runId, seq)
  await kv.put(key, JSON.stringify({ version: 1, runId, seq, at, deltas }))
  return key
}

/** 受け箱を古い順（キー順）に最大 limit 件読む。list は結果整合なので、消えていたキーは飛ばす */
export async function readInbox(kv: KvLike, limit: number): Promise<InboxItem[]> {
  const listed = await kv.list({ prefix: LQNG_KV_KEYS.inboxPrefix, limit })
  const names = listed.keys.map((k) => k.name).slice(0, limit)
  const values = await Promise.all(names.map((name) => kv.get(name)))
  const items: InboxItem[] = []
  names.forEach((key, i) => {
    const raw = values[i]
    if (raw === null || raw === undefined) return
    let parsed: unknown
    try {
      parsed = JSON.parse(raw)
    } catch {
      items.push({ key, deltas: null })
      return
    }
    items.push({ key, deltas: isRecord(parsed) && isRecord(parsed.deltas) ? normalizeDeltas(parsed.deltas) : null })
  })
  return items
}

/**
 * 差分を判定表へ冪等に合流する（何度呼んでも同じ結果）。
 * - 投稿者: 許可リストは除外。未登録なら追加（since は合流時刻）、登録済みなら理由と根拠の和集合
 * - 動画: 未登録で、許可リスト（動画・投稿者）に無く、投稿者が NG でないものだけ追加
 */
export function mergeDeltasIntoVerdicts(verdicts: LqngVerdicts, deltas: BackfillDeltas, config: LqngConfig, nowIso: string): InboxMergeResult {
  const result: InboxMergeResult = { authorsAdded: 0, reasonsAdded: 0, videosAdded: 0 }
  const allowAuthors = new Set(config.allowlist.authorIds)
  const allowVideos = new Set(config.allowlist.videoIds)
  for (const [authorId, verdict] of Object.entries(deltas.authors)) {
    if (allowAuthors.has(authorId)) continue
    const current = Object.hasOwn(verdicts.authors, authorId) ? verdicts.authors[authorId] : undefined
    if (!current) {
      verdicts.authors[authorId] = { ...verdict, evidence: verdict.evidence.slice(0, INBOX_EVIDENCE_MAX), since: nowIso }
      result.authorsAdded++
      continue
    }
    const reasons = Array.from(new Set([...current.reasons, ...verdict.reasons]))
    if (reasons.length !== current.reasons.length) {
      current.reasons = reasons
      result.reasonsAdded++
    }
    for (const e of verdict.evidence) {
      if (current.evidence.length >= INBOX_EVIDENCE_MAX) break
      if (!current.evidence.some((x) => x.videoId === e.videoId)) current.evidence.push(e)
    }
  }
  for (const [videoId, verdict] of Object.entries(deltas.videos)) {
    if (Object.hasOwn(verdicts.videos, videoId) || allowVideos.has(videoId)) continue
    if (verdict.authorId !== null && (allowAuthors.has(verdict.authorId) || Object.hasOwn(verdicts.authors, verdict.authorId))) continue
    verdicts.videos[videoId] = { ...verdict, since: nowIso }
    result.videosAdded++
  }
  return result
}
