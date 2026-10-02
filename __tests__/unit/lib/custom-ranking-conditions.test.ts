import { describe, expect, it } from 'vitest'
import {
  EMPTY_CUSTOM_CONDITIONS,
  type TagScope,
  describeCustomConditions,
  fromTagConditions,
  normalizeTagWord,
  scopeOf,
  toTagConditions,
  withConditions,
  withScope,
} from '@/lib/custom-ranking-conditions'
import { applyCustomFilters } from '@/lib/custom-ranking-filter'
import type { TagCondition } from '@/types/custom-ranking'
import type { RankingItem } from '@/types/ranking'

// タグ名はすべて合成値
const state = (all: string[], any: string[], not: string[], scopes: Record<string, TagScope> = {}) => ({
  conditions: { all, any, not },
  scopes: new Map(Object.entries(scopes)),
})

describe('カスタムランキングのタグ条件と 3 つの欄', () => {
  it('保存形式から欄へ、欄から保存形式へ（順序・種別を保つ）', () => {
    const saved: TagCondition[] = [
      { tag: 'A', operator: 'AND', tagType: 'lock' },
      { tag: 'X', operator: 'NOT', tagType: 'both' },
      { tag: 'B', operator: 'OR', tagType: 'user' },
      { tag: 'C', operator: 'OR', tagType: 'both' },
    ]
    const loaded = fromTagConditions(saved)
    expect(loaded.conditions).toEqual({ all: ['A'], any: ['B', 'C'], not: ['X'] })
    expect(scopeOf(loaded.scopes, 'A')).toBe('lock')
    expect(scopeOf(loaded.scopes, 'B')).toBe('user')
    expect(toTagConditions(loaded)).toEqual([
      { tag: 'A', operator: 'AND', tagType: 'lock' },
      { tag: 'B', operator: 'OR', tagType: 'user' },
      { tag: 'C', operator: 'OR', tagType: 'both' },
      { tag: 'X', operator: 'NOT', tagType: 'both' },
    ])
  })

  it('端末に残った壊れた項目は飛ばし、同じタグ（大文字・小文字の違いを含む）は最初の 1 つだけ残す', () => {
    const loaded = fromTagConditions([
      { tag: 'Tag', operator: 'AND', tagType: 'lock' },
      { tag: 'tag', operator: 'NOT', tagType: 'user' },
      { tag: '  ', operator: 'OR', tagType: 'both' },
      { tag: 'Y', operator: 'XOR', tagType: 'both' },
      { tag: 'Z', operator: 'OR', tagType: 'unknown' },
      null,
      'broken',
    ])
    expect(loaded.conditions).toEqual({ all: ['Tag'], any: ['Z'], not: [] })
    expect(scopeOf(loaded.scopes, 'Tag')).toBe('lock')
    expect(scopeOf(loaded.scopes, 'Z')).toBe('both')
    expect(fromTagConditions(undefined)).toEqual(EMPTY_CUSTOM_CONDITIONS)
  })

  it('欄から消したタグの種別は捨てる（加え直したら全タグから）', () => {
    const start = withScope(state(['A'], [], []), 'A', 'lock')
    expect(scopeOf(start.scopes, 'a')).toBe('lock')
    const removed = withConditions(start, { all: [], any: [], not: [] })
    expect(removed.scopes.size).toBe(0)
    const readded = withConditions(removed, { all: ['A'], any: [], not: [] })
    expect(scopeOf(readded.scopes, 'A')).toBe('both')
  })

  it('「constructor」「__proto__」のようなタグ名でも、種別はそのタグに選んだ値だけになる', () => {
    const loaded = fromTagConditions([
      { tag: '__proto__', operator: 'AND', tagType: 'lock' },
      { tag: 'Constructor', operator: 'OR', tagType: 'both' },
    ])
    expect(scopeOf(loaded.scopes, '__proto__')).toBe('lock')
    expect(scopeOf(loaded.scopes, 'Constructor')).toBe('both')
    const added = withConditions(EMPTY_CUSTOM_CONDITIONS, { all: ['合成A'], any: ['CONSTRUCTOR', 'toString'], not: ['__proto__'] })
    expect(toTagConditions(added).map((c) => c.tagType)).toEqual(['both', 'both', 'both', 'both'])
    expect(describeCustomConditions(added).text).not.toContain('undefined')
    expect(() => structuredClone(toTagConditions(added))).not.toThrow()
  })

  it('タグ名は空白だけ整え、引用符などは残す（検索式向けの整え方と違う）', () => {
    expect(normalizeTagWord('  "合成"   タグ  ')).toBe('"合成" タグ')
    expect(normalizeTagWord('あ'.repeat(120))).toHaveLength(100)
  })
})

describe('カスタムランキングの条件の説明（すべて含む・いずれかを含むは「または」）', () => {
  it('2 つの欄は「または」でつなぎ、除くタグはただし書きにする', () => {
    expect(describeCustomConditions(state(['初音ミク'], ['歌ってみた', '演奏してみた'], ['切り抜き'])).text).toBe(
      '「初音ミク」が付いた動画、または「歌ってみた」か「演奏してみた」のどちらかが付いた動画が対象です。ただし、「切り抜き」が付いた動画は除きます。',
    )
  })

  it('数に応じて「両方」「すべて」「どちらか」「どれか」を使い分け、全タグ以外は種別を添える', () => {
    expect(describeCustomConditions(state(['A', 'B'], [], [], { a: 'lock' })).text).toBe(
      '「A」（ロックタグ）と「B」が両方付いた動画が対象です。',
    )
    expect(describeCustomConditions(state(['A', 'B', 'C'], [], [])).text).toBe('「A」「B」「C」がすべて付いた動画が対象です。')
    expect(describeCustomConditions(state([], ['A', 'B', 'C'], [], { c: 'user' })).text).toBe(
      '「A」「B」「C」（ユーザータグ）のどれかが付いた動画が対象です。',
    )
  })

  it('除くタグだけなら、ジャンル内の動画から除いたものが対象（検索と違い、これだけでも成り立つ）', () => {
    expect(describeCustomConditions(state([], [], ['X', 'Y'])).text).toBe(
      'ジャンル内の動画から、「X」か「Y」のどちらかが付いた動画を除いたものが対象です。',
    )
  })

  it('空なら加え方を示す', () => {
    expect(describeCustomConditions(EMPTY_CUSTOM_CONDITIONS)).toEqual({ text: 'タグを1つ以上加えてください。', warning: false })
  })

  it('説明は実際の判定（lib/custom-ranking-filter.ts）と一致する', () => {
    const item = (id: string, tags: string[]): RankingItem => ({
      rank: 1,
      id,
      title: id,
      thumbURL: '',
      views: 0,
      tags,
      tagDetails: tags.map((name) => ({ name, isLocked: false })),
    })
    const items = [
      item('sm1', ['初音ミク']),
      item('sm2', ['歌ってみた']),
      item('sm3', ['初音ミク', '演奏してみた']),
      item('sm4', ['初音ミク', '切り抜き']),
      item('sm5', ['その他']),
    ]
    const conditions = toTagConditions(state(['初音ミク'], ['歌ってみた', '演奏してみた'], ['切り抜き']))
    // 「初音ミク」が付いた動画、または「歌ってみた」「演奏してみた」のどちらかが付いた動画。ただし「切り抜き」付きは除く
    expect(applyCustomFilters(items, conditions).map((it) => it.id)).toEqual(['sm1', 'sm2', 'sm3'])
  })
})
