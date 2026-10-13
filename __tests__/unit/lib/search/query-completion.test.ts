import { describe, expect, it } from 'vitest'
import { queryCompletion, completeQuery } from '@/lib/search/query-completion'

describe('search term completion', () => {
  it.each([
    ['初音', 2, '初音ミク', '初音ミク'],
    ['ゲーム OR 初音', 9, '初音ミク', 'ゲーム OR 初音ミク'],
    ['初音 -実況', 6, '実況プレイ', '初音 -実況プレイ'],
    ['初音 OR ゲーム', 2, '初音ミク', '初音ミク OR ゲーム'],
    ['"初音 ミ" OR ゲーム', 5, '初音 ミク', '"初音 ミク" OR ゲーム'],
    ['-"初音 ミ', 6, '初音 ミク', '-"初音 ミク"'],
    ['東方', 2, '東方 project', '"東方 project"'],
    ['初音　ゲーム', 2, '初音ミク', '初音ミク　ゲーム'],
  ])(
    'completes %s without losing other terms',
    (value, caret, tag, expected) => {
      const context = queryCompletion(value, caret)
      expect(context).not.toBeNull()
      const result = completeQuery(value, context!, tag)
      expect(result?.value).toBe(expected)
      expect(result?.value.slice(0, result.caret)).toContain(tag)
    },
  )
  it.each(['', '初音 ', '初音 OR', '-', '"'])(
    'does not suggest for blank/operator %s',
    (value) => {
      expect(queryCompletion(value, value.length)).toBeNull()
    },
  )
  it('does not overwrite a selection spanning terms', () => {
    expect(queryCompletion('初音 OR 東方', 0, 8)).toBeNull()
  })
  it('refuses literal quotes which would change expression semantics', () => {
    expect(
      completeQuery('初音', queryCompletion('初音', 2)!, '初音" OR ゲーム'),
    ).toBeNull()
  })
})
