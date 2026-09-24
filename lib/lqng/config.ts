// KV に置く設定の検証と正規化（管理画面の入力と Worker の読み取りで共用）
import { normalizeText } from './normalize'
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

/** ユーザー ID（数字 1〜12 桁） */
const USER_ID_PATTERN = /^\d{1,12}$/

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
    // 対照は設定されているときだけ持つ（無い設定の形は変えない）
    ...(typeof raw.controlUserId === 'string' && USER_ID_PATTERN.test(raw.controlUserId.trim()) ? { controlUserId: raw.controlUserId.trim() } : {}),
    allowlist: {
      authorIds: stringArray(allow.authorIds, []),
      videoIds: stringArray(allow.videoIds, []),
      ...(notes ? { notes } : {}),
    },
    updatedAt: typeof raw.updatedAt === 'string' ? raw.updatedAt : d.updatedAt,
  }
}

/** 照合語（B）の最小文字数（正規化後）。短い照合語は順序付き部分列一致で無関係なタイトルにも一致する */
export const LQNG_TITLE_NEEDLE_MIN_LENGTH = 3

/** 新着取得に使うタグの上限（Worker の外部呼び出しの予算から決まる。4 つ目からは取得しない） */
export const LQNG_POLL_TAGS_MAX = 3

interface NumberLimit {
  label: string
  min: number
  max: number
  read: (raw: Record<string, unknown>) => unknown
}

const readFreq = (raw: Record<string, unknown>, key: 'dayCount' | 'burstCount' | 'burstMinutes'): unknown =>
  isRecord(raw.freq) ? raw.freq[key] : undefined

/** 数値設定の下限・上限（ラベルは管理画面の表示に合わせる） */
const NUMBER_LIMITS: readonly NumberLimit[] = [
  { label: 'ロック群の閾値', min: 1, max: 20, read: (raw) => raw.lockGroupsMin },
  { label: '24 時間の本数', min: 1, max: 100, read: (raw) => readFreq(raw, 'dayCount') },
  { label: '短時間の本数', min: 1, max: 100, read: (raw) => readFreq(raw, 'burstCount') },
  { label: '短時間の幅', min: 1, max: 1440, read: (raw) => readFreq(raw, 'burstMinutes') },
  { label: 'フォロワー上限', min: 0, max: 1000, read: (raw) => raw.followerMax },
  { label: '保留時間', min: 0, max: 168, read: (raw) => raw.holdHours },
  { label: '投稿者の追跡日数', min: 1, max: 30, read: (raw) => raw.trackDays },
  { label: '削除とみなす日数', min: 1, max: 30, read: (raw) => raw.deletionWindowDays },
]

/**
 * 管理画面の入力（保存前の設定）を検証し、問題点を返す（空なら保存してよい）。
 * normalizeLqngConfig は不正な値を既定値で黙って補うため、保存の前にこちらで範囲外の値を弾く。
 * 省いた数値は既定値になるので問題にしない。画面と管理 API の両方で使う。
 */
export function validateLqngConfigInput(raw: unknown): string[] {
  if (!isRecord(raw)) return ['設定の形式が正しくありません']
  const problems: string[] = []
  for (const limit of NUMBER_LIMITS) {
    const value = limit.read(raw)
    if (value === undefined) continue
    if (typeof value !== 'number' || !Number.isInteger(value) || value < limit.min || value > limit.max) {
      problems.push(`${limit.label}は ${limit.min}〜${limit.max} の整数にしてください`)
    }
  }
  const config = normalizeLqngConfig(raw)
  for (const needle of config.titleNeedles) {
    const length = Array.from(normalizeText(needle)).length
    if (length < LQNG_TITLE_NEEDLE_MIN_LENGTH) {
      problems.push(`照合語「${needle}」は正規化すると ${length} 文字です。${LQNG_TITLE_NEEDLE_MIN_LENGTH} 文字以上にしてください`)
    }
  }
  if (config.enabled && config.pollTags.length === 0) problems.push('有効にするにはポーリング対象タグが 1 つ以上必要です')
  if (config.pollTags.length > LQNG_POLL_TAGS_MAX) problems.push(`対象タグは ${LQNG_POLL_TAGS_MAX} つまでにしてください（${LQNG_POLL_TAGS_MAX + 1} つ目からは新着を取得しません）`)
  if (config.tagGroups.length > 0 && config.lockGroupsMin > config.tagGroups.length) problems.push('ロック群の閾値がグループ数を超えています')
  const control = raw.controlUserId
  if (control !== undefined && control !== null && control !== '' && !(typeof control === 'string' && USER_ID_PATTERN.test(control.trim()))) {
    problems.push('退会確認の対照のユーザー ID は数字 1〜12 桁にしてください')
  }
  return problems
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
