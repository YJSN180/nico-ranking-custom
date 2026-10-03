import { GENRE_LABELS, type RankingGenre } from '@/types/ranking-config'
import type { CustomRankingConditionIndexedDB, TagOperator } from './types'

/**
 * 取り込めるカスタムランキング（検証済み）
 */
export interface ImportableCustomRanking {
  title: string
  baseGenre: RankingGenre
  conditions: Omit<CustomRankingConditionIndexedDB, 'id' | 'rankingId'>[]
}

export const INVALID_CUSTOM_RANKING_MESSAGE = '無効なカスタムランキングデータが含まれています'

const OPERATORS: readonly string[] = ['AND', 'OR', 'NOT'] satisfies readonly TagOperator[]
const TAG_TYPES: readonly string[] = ['lock', 'user', 'both'] satisfies readonly CustomRankingConditionIndexedDB['tagType'][]

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

export function isNonBlankString(value: unknown): value is string {
  return typeof value === 'string' && value.trim() !== ''
}

export function isBaseGenre(value: unknown): value is RankingGenre {
  return typeof value === 'string' && value !== 'custom' && Object.prototype.hasOwnProperty.call(GENRE_LABELS, value)
}

function isOperator(value: unknown): value is TagOperator {
  return typeof value === 'string' && OPERATORS.includes(value)
}

function isTagType(value: unknown): value is CustomRankingConditionIndexedDB['tagType'] {
  return typeof value === 'string' && TAG_TYPES.includes(value)
}

export type StorableCondition = Omit<CustomRankingConditionIndexedDB, 'id' | 'rankingId'>

/**
 * 保存する条件を確かめ、保存する値だけを持つ新しいオブジェクトにする（余分な値や複製できない値を持ち込まない）。
 * 文字列でない・空白だけのタグ、未知の演算子・タグ種別が 1 件でもあれば null。順番は並び順どおりに振り直す
 */
export function sanitizeConditionsForStorage(value: unknown): StorableCondition[] | null {
  if (!Array.isArray(value)) return null
  const conditions: StorableCondition[] = []
  for (const [index, condition] of value.entries()) {
    if (
      !isRecord(condition) ||
      !isNonBlankString(condition.tag) ||
      !isOperator(condition.operator) ||
      !isTagType(condition.tagType)
    ) {
      return null
    }
    conditions.push({ tag: condition.tag, operator: condition.operator, tagType: condition.tagType, orderIndex: index })
  }
  return conditions
}

/**
 * 取り込むカスタムランキングを検証する。そのまま保存すると表示時に落ちる・効かない値
 * （文字列でない・空白だけのタグ、未知の演算子・タグ種別・ジャンル）が 1 件でもあれば null。
 * 条件の順番は並び順どおりの番号に振り直す
 */
export function parseCustomRankingsForImport(value: unknown): ImportableCustomRanking[] | null {
  if (!Array.isArray(value)) return null

  const rankings: ImportableCustomRanking[] = []
  for (const raw of value) {
    if (
      !isRecord(raw) ||
      !raw.id ||
      !isNonBlankString(raw.title) ||
      !isBaseGenre(raw.baseGenre) ||
      !Array.isArray(raw.conditions)
    ) {
      return null
    }

    const conditions = sanitizeConditionsForStorage(raw.conditions)
    if (!conditions) return null

    rankings.push({ title: raw.title, baseGenre: raw.baseGenre, conditions })
  }
  return rankings
}
