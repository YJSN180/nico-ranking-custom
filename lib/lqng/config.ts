// KV に置く設定の検証と正規化（管理画面の入力と Worker の読み取りで共用）
import { DEFAULT_LQNG_CONFIG, type LqngConfig, type LqngVerdicts, EMPTY_LQNG_VERDICTS } from './types'

/** KV のキー名（接頭辞 lqng: で既存キーと分離する） */
export const LQNG_KV_KEYS = {
  config: 'lqng:config',
  verdicts: 'lqng:verdicts',
  tracking: 'lqng:tracking',
  events: 'lqng:events',
  /** バックフィルの判定差分の受け箱（lqng:inbox:<runId>:<seq>）。判定表へはポーリングが合流する */
  inboxPrefix: 'lqng:inbox:',
} as const

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v)

function stringArray(v: unknown, fallback: string[]): string[] {
  if (!Array.isArray(v)) return fallback
  return Array.from(new Set(v.filter((x): x is string => typeof x === 'string').map((x) => x.trim()).filter((x) => x.length > 0)))
}

function stringMatrix(v: unknown, fallback: string[][]): string[][] {
  if (!Array.isArray(v)) return fallback
  return v.map((g) => stringArray(g, [])).filter((g) => g.length > 0)
}

function positiveInt(v: unknown, fallback: number): number {
  return typeof v === 'number' && Number.isFinite(v) && v >= 0 ? Math.floor(v) : fallback
}

/** 不正な形を既定値で補い、常に完全な LqngConfig を返す */
export function normalizeLqngConfig(raw: unknown): LqngConfig {
  const d = DEFAULT_LQNG_CONFIG
  if (!isRecord(raw)) return { ...d, allowlist: { authorIds: [], videoIds: [] }, freq: { ...d.freq } }
  const freq = isRecord(raw.freq) ? raw.freq : {}
  const allow = isRecord(raw.allowlist) ? raw.allowlist : {}
  const notes = isRecord(allow.notes)
    ? Object.fromEntries(Object.entries(allow.notes).filter((e): e is [string, string] => typeof e[1] === 'string'))
    : undefined
  return {
    version: 1,
    enabled: raw.enabled === true,
    pollTags: stringArray(raw.pollTags, d.pollTags),
    sweepGenre: typeof raw.sweepGenre === 'string' && raw.sweepGenre.trim() ? raw.sweepGenre.trim() : null,
    titleNeedles: stringArray(raw.titleNeedles, d.titleNeedles),
    keywordNeedles: stringArray(raw.keywordNeedles, d.keywordNeedles),
    tagGroups: stringMatrix(raw.tagGroups, d.tagGroups),
    lockGroupsMin: Math.max(1, positiveInt(raw.lockGroupsMin, d.lockGroupsMin)),
    freq: {
      dayCount: Math.max(1, positiveInt(freq.dayCount, d.freq.dayCount)),
      burstCount: Math.max(1, positiveInt(freq.burstCount, d.freq.burstCount)),
      burstMinutes: Math.max(1, positiveInt(freq.burstMinutes, d.freq.burstMinutes)),
    },
    followerMax: positiveInt(raw.followerMax, d.followerMax),
    holdHours: positiveInt(raw.holdHours, d.holdHours),
    trackDays: Math.max(1, positiveInt(raw.trackDays, d.trackDays)),
    deletionWindowDays: Math.max(1, positiveInt(raw.deletionWindowDays, d.deletionWindowDays)),
    allowlist: {
      authorIds: stringArray(allow.authorIds, []),
      videoIds: stringArray(allow.videoIds, []),
      ...(notes ? { notes } : {}),
    },
    updatedAt: typeof raw.updatedAt === 'string' ? raw.updatedAt : d.updatedAt,
  }
}

/** 判定テーブルの形を検証し、壊れていれば空を返す（サービスを落とさない） */
export function normalizeLqngVerdicts(raw: unknown): LqngVerdicts {
  if (!isRecord(raw) || !isRecord(raw.authors) || !isRecord(raw.videos)) return { ...EMPTY_LQNG_VERDICTS, authors: {}, videos: {} }
  return {
    version: 1,
    authors: raw.authors as LqngVerdicts['authors'],
    videos: raw.videos as LqngVerdicts['videos'],
    updatedAt: typeof raw.updatedAt === 'string' ? raw.updatedAt : EMPTY_LQNG_VERDICTS.updatedAt,
  }
}
