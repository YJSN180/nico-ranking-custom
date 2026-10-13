import { SEARCH_MAX_QUERY_LENGTH } from '@/lib/search/snapshot-search'

/**
 * 検索欄の式（q）と「すべて含む／いずれかを含む／含めない」の 3 欄を相互に変換する。
 *
 * 意味は Snapshot 検索 API の実測（2026-10-02）に合わせる: スペースは AND、`OR` は隣り合う語だけを束ね、
 * `-語` は式全体から除く。つまり `A B OR C -D` = A かつ (B または C)、ただし D を除く。
 * カスタムランキングと詳細条件のタグ条件（(AND 群) または (OR 群)）とは意味が違う。
 */
export type KeywordGroup = 'all' | 'any' | 'not'

export interface KeywordConditions {
  all: string[]
  any: string[]
  not: string[]
}

export const KEYWORD_GROUPS: readonly KeywordGroup[] = ['all', 'any', 'not']

export const KEYWORD_GROUP_LABELS: Record<KeywordGroup, string> = {
  all: 'すべて含む',
  any: 'いずれかを含む',
  not: '含めない',
}

export const EMPTY_KEYWORD_CONDITIONS: KeywordConditions = {
  all: [],
  any: [],
  not: [],
}

const MAX_KEYWORD_LENGTH = 100
const OPERATOR = /^(OR|AND|NOT)$/

/** 欄に入力された語を整える。引用符は式で表せないので除き、空白は 1 つにまとめる */
export function normalizeKeyword(raw: string): string {
  return raw
    .replace(/"/g, '')
    .replace(/\s+/gu, ' ')
    .trim()
    .slice(0, MAX_KEYWORD_LENGTH)
    .trim()
}

const quote = (word: string): string =>
  /\s/u.test(word) || word.startsWith('-') || OPERATOR.test(word)
    ? `"${word}"`
    : word

export function buildKeywordQuery(conditions: KeywordConditions): string {
  const parts = conditions.all.map(quote)
  if (conditions.any.length > 0)
    parts.push(conditions.any.map(quote).join(' OR '))
  parts.push(...conditions.not.map((word) => `-${quote(word)}`))
  return parts.join(' ')
}

/**
 * 3 欄に分けられる式だけを分ける。分けられない式（OR の連なりが 2 つ以上、除外語を含む OR、AND/NOT、
 * 閉じていない引用符、語の途中の引用符）は null を返し、呼び出し側は通常入力のまま原文を保つ
 */
export function parseKeywordQuery(query: string): KeywordConditions | null {
  if ((query.match(/"/g) ?? []).length % 2 !== 0) return null
  const tokens = query.match(/-?"[^"]*"|\S+/gu) ?? []
  const word = (token: string): string | null => {
    const body = token.startsWith('"') ? token.slice(1, -1) : token
    if (body.includes('"')) return null
    const normalized = body.replace(/\s+/gu, ' ').trim()
    return normalized || null
  }
  const result: KeywordConditions = { all: [], any: [], not: [] }
  let chains = 0
  for (let i = 0; i < tokens.length; i++) {
    const token = tokens[i]
    if (OPERATOR.test(token)) return null
    const negative = token.length > 1 && token.startsWith('-')
    const current = word(negative ? token.slice(1) : token)
    if (current === null) return null
    if (tokens[i + 1] !== 'OR') {
      ;(negative ? result.not : result.all).push(current)
      continue
    }
    if (negative) return null
    const members = [current]
    let j = i
    while (tokens[j + 1] === 'OR') {
      const next = tokens[j + 2]
      if (
        next === undefined ||
        OPERATOR.test(next) ||
        (next.length > 1 && next.startsWith('-'))
      )
        return null
      const member = word(next)
      if (member === null) return null
      members.push(member)
      j += 2
    }
    chains += 1
    if (chains > 1) return null
    result.any.push(...members)
    i = j
  }
  return result
}

export function isKeywordQueryTooLong(conditions: KeywordConditions): boolean {
  return buildKeywordQuery(conditions).length > SEARCH_MAX_QUERY_LENGTH
}

export interface KeywordDescription {
  text: string
  /** 検索しても見つからない・送れない条件。説明の代わりに直し方を示す */
  warning: boolean
}

const quoted = (words: string[], joiner: 'と' | 'か'): string =>
  words.length === 2
    ? `「${words[0]}」${joiner}「${words[1]}」`
    : words.map((w) => `「${w}」`).join('')

const which = (count: number): string =>
  count === 2 ? 'のどちらか' : count > 2 ? 'のどれか' : ''

/** 条件の意味を 1 つの文で表す（追加・削除・キーワード/タグの切替に追従する） */
export function describeKeywordConditions(
  conditions: KeywordConditions,
  targets: 'keyword' | 'tag',
): KeywordDescription {
  const { all, any, not } = conditions
  if (isKeywordQueryTooLong(conditions)) {
    return {
      text: `条件が長すぎます（${SEARCH_MAX_QUERY_LENGTH}文字まで）。語を減らしてください。`,
      warning: true,
    }
  }
  if (all.length === 0 && any.length === 0) {
    if (not.length === 0) return { text: '', warning: false }
    return {
      text: '「含めない」だけでは動画が見つかりません。含む語も追加してください。',
      warning: true,
    }
  }
  const tag = targets === 'tag'
  const [particle, join, end] = tag
    ? ['が', '付き、', '付いた']
    : ['を', '含み、', '含む']
  const clauses: string[] = []
  if (all.length > 0) {
    clauses.push(
      `${quoted(all, 'と')}${particle}${all.length === 2 ? '両方' : all.length > 2 ? 'すべて' : ''}`,
    )
  }
  if (any.length > 0) {
    clauses.push(
      `${quoted(any, 'か')}${which(any.length)}${all.length > 0 ? 'も' : particle}`,
    )
  }
  let text = `${tag ? 'タグ' : ''}${clauses.join(join)}${end}動画を探します。`
  if (not.length > 0) {
    text += `${tag ? 'タグ' : ''}${quoted(not, 'か')}${which(not.length)}${tag ? 'が付いた' : 'を含む'}動画は除きます。`
  }
  return { text, warning: false }
}

/** すでにある同じ語（大文字・小文字の違いは同じ語とみなす）と、その欄 */
export interface KeywordDuplicate {
  group: KeywordGroup
  word: string
}

/**
 * 語を欄に加える。どこかの欄に同じ語があれば加えず、その語を返す（呼び出し側で知らせる）。
 * normalize は欄の用途に合わせて差し替える（カスタムランキングのタグ名は引用符も残す）
 */
export function addKeyword(
  conditions: KeywordConditions,
  group: KeywordGroup,
  raw: string,
  normalize: (raw: string) => string = normalizeKeyword,
): { conditions: KeywordConditions; duplicate: KeywordDuplicate | null } {
  const word = normalize(raw)
  if (!word) return { conditions, duplicate: null }
  const key = word.toLowerCase()
  for (const g of KEYWORD_GROUPS) {
    const existing = conditions[g].find((w) => w.toLowerCase() === key)
    if (existing !== undefined) {
      return { conditions, duplicate: { group: g, word: existing } }
    }
  }
  return {
    conditions: { ...conditions, [group]: [...conditions[group], word] },
    duplicate: null,
  }
}

export function removeKeyword(
  conditions: KeywordConditions,
  group: KeywordGroup,
  word: string,
): KeywordConditions {
  return { ...conditions, [group]: conditions[group].filter((w) => w !== word) }
}

export type KeywordDrafts = Record<KeywordGroup, string>

export const EMPTY_KEYWORD_DRAFTS: KeywordDrafts = { all: '', any: '', not: '' }

/** 欄に打ちかけの語も条件に加える（検索や入力方法の切替で取りこぼさない） */
export function commitKeywordDrafts(
  conditions: KeywordConditions,
  drafts: KeywordDrafts,
  normalize: (raw: string) => string = normalizeKeyword,
): KeywordConditions {
  return KEYWORD_GROUPS.reduce(
    (next, group) =>
      addKeyword(next, group, drafts[group], normalize).conditions,
    conditions,
  )
}
