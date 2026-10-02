// カスタムランキングのタグ条件と、条件入力欄（3 つの欄）との相互変換・説明文。
// 判定（lib/custom-ranking-filter.ts）は「すべて含む」群と「いずれかを含む」群のどちらかに当たれば対象（または）。
// 検索の「すべて含む かつ いずれかを含む」とは意味が違うので、説明文もそれに合わせる。保存形式（TagCondition[]）は変えない。
import {
  KEYWORD_GROUPS,
  addKeyword,
  type KeywordConditions,
  type KeywordDescription,
  type KeywordGroup,
} from '@/lib/search/keyword-conditions'
import type { TagCondition, TagOperator } from '@/types/custom-ranking'

export type TagScope = TagCondition['tagType']

export const TAG_SCOPES: readonly TagScope[] = ['both', 'lock', 'user']

export const TAG_SCOPE_LABELS: Record<TagScope, string> = {
  both: '全タグ',
  lock: 'ロックタグ',
  user: 'ユーザータグ',
}

export const isTagScope = (value: unknown): value is TagScope =>
  value === 'both' || value === 'lock' || value === 'user'

const isTagOperator = (value: unknown): value is TagOperator =>
  value === 'AND' || value === 'OR' || value === 'NOT'

const GROUP_OF: Record<TagOperator, KeywordGroup> = {
  AND: 'all',
  OR: 'any',
  NOT: 'not',
}
const OPERATOR_OF: Record<KeywordGroup, TagOperator> = {
  all: 'AND',
  any: 'OR',
  not: 'NOT',
}

const MAX_TAG_LENGTH = 100

/** 欄に入力されたタグ名を整える。空白だけをまとめ、引用符などは残す（タグ名はそのまま照合する） */
export function normalizeTagWord(raw: string): string {
  return raw.replace(/\s+/gu, ' ').trim().slice(0, MAX_TAG_LENGTH).trim()
}

/**
 * タグごとの種別。タグは欄をまたいで重複しない（大文字・小文字の違いも同じタグ）ので、小文字のタグ名で引く。
 * Map にするのは、「constructor」などのタグ名がオブジェクトの組み込みの値を拾わないようにするため
 */
export type TagScopes = ReadonlyMap<string, TagScope>

const scopeKey = (word: string): string => word.toLowerCase()

export function scopeOf(scopes: TagScopes, word: string): TagScope {
  return scopes.get(scopeKey(word)) ?? 'both'
}

export interface CustomConditionState {
  conditions: KeywordConditions
  scopes: TagScopes
}

export const EMPTY_CUSTOM_CONDITIONS: CustomConditionState = {
  conditions: { all: [], any: [], not: [] },
  scopes: new Map(),
}

export function withScope(
  state: CustomConditionState,
  word: string,
  scope: TagScope,
): CustomConditionState {
  return { ...state, scopes: new Map(state.scopes).set(scopeKey(word), scope) }
}

/** 欄の語を入れ替える。欄から消えたタグの種別は捨てる（同じタグを加え直したら全タグから） */
export function withConditions(
  state: CustomConditionState,
  conditions: KeywordConditions,
): CustomConditionState {
  const scopes = new Map<string, TagScope>()
  for (const group of KEYWORD_GROUPS) {
    for (const word of conditions[group]) {
      const scope = state.scopes.get(scopeKey(word))
      if (scope) scopes.set(scopeKey(word), scope)
    }
  }
  return { conditions, scopes }
}

export const hasCustomConditions = (conditions: KeywordConditions): boolean =>
  KEYWORD_GROUPS.some((group) => conditions[group].length > 0)

/** 端末に保存された条件（壊れている可能性がある）のうち、使える形のもの */
const isStoredCondition = (
  value: unknown,
): value is { tag: string; operator: TagOperator; tagType?: unknown } =>
  typeof value === 'object' &&
  value !== null &&
  'tag' in value &&
  typeof value.tag === 'string' &&
  'operator' in value &&
  isTagOperator(value.operator)

/**
 * 保存済みの条件を欄に並べる。壊れた項目は飛ばし、同じタグ（大文字・小文字の違いを含む）は最初の 1 つだけ残す。
 * 保存済みのタグ名は前後の空白だけ除いてそのまま使う（作り直しで照合の結果を変えない）
 */
export function fromTagConditions(
  list: readonly unknown[] | undefined,
): CustomConditionState {
  let conditions: KeywordConditions = { all: [], any: [], not: [] }
  const scopes = new Map<string, TagScope>()
  for (const item of list ?? []) {
    if (!isStoredCondition(item)) continue
    const group = GROUP_OF[item.operator]
    const result = addKeyword(conditions, group, item.tag, (raw) => raw.trim())
    if (result.duplicate || result.conditions === conditions) continue
    conditions = result.conditions
    const added = conditions[group][conditions[group].length - 1]
    if (added !== undefined) {
      scopes.set(
        scopeKey(added),
        isTagScope(item.tagType) ? item.tagType : 'both',
      )
    }
  }
  return { conditions, scopes }
}

/** 欄の内容を保存形式に戻す（すべて含む → いずれかを含む → 含めないの順） */
export function toTagConditions(state: CustomConditionState): TagCondition[] {
  return KEYWORD_GROUPS.flatMap((group) =>
    state.conditions[group].map((tag) => ({
      tag,
      operator: OPERATOR_OF[group],
      tagType: scopeOf(state.scopes, tag),
    })),
  )
}

const term = (word: string, scopes: TagScopes): string => {
  const scope = scopeOf(scopes, word)
  return `「${word}」${scope === 'both' ? '' : `（${TAG_SCOPE_LABELS[scope]}）`}`
}

/** 検索の説明と同じ並べ方: 2 つは「と」「か」でつなぎ、3 つ以上は並べる */
const listTerms = (terms: string[], joiner: string): string =>
  terms.length === 2 ? terms.join(joiner) : terms.join('')

const which = (count: number): string =>
  count === 2 ? 'のどちらか' : count > 2 ? 'のどれか' : ''

/** 条件の意味を文で表す（追加・削除・タグ種別の変更に追従する） */
export function describeCustomConditions(
  state: CustomConditionState,
): KeywordDescription {
  const { all, any, not } = state.conditions
  const terms = (words: string[]): string[] =>
    words.map((word) => term(word, state.scopes))
  const allPart =
    all.length === 0
      ? ''
      : `${listTerms(terms(all), 'と')}が${all.length === 2 ? '両方' : all.length > 2 ? 'すべて' : ''}付いた動画`
  const anyPart =
    any.length === 0
      ? ''
      : `${listTerms(terms(any), 'か')}${which(any.length)}が付いた動画`
  const notPart =
    not.length === 0
      ? ''
      : `${listTerms(terms(not), 'か')}${which(not.length)}が付いた動画`
  const positive = [allPart, anyPart].filter(Boolean).join('、または')
  if (positive) {
    return {
      text: `${positive}が対象です。${notPart ? `ただし、${notPart}は除きます。` : ''}`,
      warning: false,
    }
  }
  if (notPart) {
    return {
      text: `ジャンル内の動画から、${notPart}を除いたものが対象です。`,
      warning: false,
    }
  }
  return { text: 'タグを1つ以上加えてください。', warning: false }
}
