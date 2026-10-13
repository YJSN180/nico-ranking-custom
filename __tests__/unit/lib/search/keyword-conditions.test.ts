import { describe, expect, it } from 'vitest'
import {
  EMPTY_KEYWORD_CONDITIONS,
  addKeyword,
  buildKeywordQuery,
  commitKeywordDrafts,
  describeKeywordConditions,
  normalizeKeyword,
  parseKeywordQuery,
  removeKeyword,
} from '@/lib/search/keyword-conditions'

describe('keyword-conditions', () => {
  describe('式と 3 つの欄の変換（Snapshot の実測: OR は隣の語だけを束ねる）', () => {
    it('A B OR C -D を すべて[A] いずれか[B, C] 含めない[D] に分ける', () => {
      expect(parseKeywordQuery('A B OR C -D')).toEqual({ all: ['A'], any: ['B', 'C'], not: ['D'] })
    })

    it('OR の連なりは前後どこにあっても 1 つなら分けられる', () => {
      expect(parseKeywordQuery('B OR C A')).toEqual({ all: ['A'], any: ['B', 'C'], not: [] })
      expect(parseKeywordQuery('A B OR C OR D')).toEqual({ all: ['A'], any: ['B', 'C', 'D'], not: [] })
    })

    it('全角スペースも区切りとして読む', () => {
      expect(parseKeywordQuery('初音ミク　歌ってみた')).toEqual({ all: ['初音ミク', '歌ってみた'], any: [], not: [] })
    })

    it('引用符の語・除外の引用符の語を保つ', () => {
      expect(parseKeywordQuery('"初音 ミク" -"切り 抜き"')).toEqual({ all: ['初音 ミク'], any: [], not: ['切り 抜き'] })
    })

    it.each([
      ['A OR B C OR D', 'OR の連なりが 2 つ'],
      ['A OR -B', '除外語を含む OR'],
      ['-A OR B', '除外語から始まる OR'],
      ['A AND B', 'AND'],
      ['NOT A', 'NOT'],
      ['OR A', '先頭の OR'],
      ['A OR', '末尾の OR'],
      ['A OR OR B', '連続した OR'],
      ['"A B', '閉じていない引用符'],
      ['a"b c"d', '語の途中の引用符'],
    ])('%s（%s）は分けられないので null', (query) => {
      expect(parseKeywordQuery(query)).toBeNull()
    })

    it('空の式は空の条件', () => {
      expect(parseKeywordQuery('')).toEqual(EMPTY_KEYWORD_CONDITIONS)
    })

    it('すべて含む → いずれか（OR でつなぐ）→ 含めない の順の式にする', () => {
      expect(buildKeywordQuery({ all: ['A', 'B'], any: ['C', 'D'], not: ['E'] })).toBe('A B C OR D -E')
    })

    it('空白・先頭の - ・OR/AND/NOT の語は引用符で囲む', () => {
      expect(buildKeywordQuery({ all: ['初音 ミク', '-x', 'OR'], any: [], not: ['切り 抜き'] })).toBe('"初音 ミク" "-x" "OR" -"切り 抜き"')
    })

    it('分けて組み直しても同じ意味の式に戻る', () => {
      for (const query of ['A B OR C -D', '"初音 ミク" 歌ってみた OR 踊ってみた -切り抜き', 'A -B -C']) {
        const parsed = parseKeywordQuery(query)
        expect(parsed).not.toBeNull()
        expect(parseKeywordQuery(buildKeywordQuery(parsed ?? EMPTY_KEYWORD_CONDITIONS))).toEqual(parsed)
      }
    })
  })

  describe('語の追加・削除', () => {
    it('語を整える（引用符を除き、空白をまとめ、100 文字まで）', () => {
      expect(normalizeKeyword('  "初音"   ミク ')).toBe('初音 ミク')
      expect(normalizeKeyword('あ'.repeat(120))).toHaveLength(100)
    })

    it('どこかの欄に同じ語があれば加えず、その欄を返す', () => {
      const start = { all: ['A'], any: [], not: [] }
      expect(addKeyword(start, 'not', 'A')).toEqual({ conditions: start, duplicate: { group: 'all', word: 'A' } })
      expect(addKeyword(start, 'any', ' B ')).toEqual({ conditions: { all: ['A'], any: ['B'], not: [] }, duplicate: null })
      // 大文字・小文字の違いだけの語は同じ語として、すでにある語を返す
      expect(addKeyword(start, 'any', 'a').duplicate).toEqual({ group: 'all', word: 'A' })
    })

    it('空の語では何も変えない（同じオブジェクトを返す）', () => {
      const start = { all: ['A'], any: [], not: [] }
      expect(addKeyword(start, 'all', '   ').conditions).toBe(start)
      expect(commitKeywordDrafts(start, { all: '', any: ' ', not: '' })).toBe(start)
    })

    it('整え方を差し替えられる（カスタムランキングのタグ名は引用符を残す）', () => {
      const keep = (raw: string): string => raw.trim()
      const start = { all: [], any: [], not: [] }
      expect(addKeyword(start, 'all', ' "x" ', keep).conditions.all).toEqual(['"x"'])
      expect(addKeyword(start, 'all', ' "x" ').conditions.all).toEqual(['x'])
      expect(commitKeywordDrafts(start, { all: '"y"', any: '', not: '' }, keep).all).toEqual(['"y"'])
    })

    it('打ちかけの語を各欄に加える', () => {
      expect(commitKeywordDrafts({ all: ['A'], any: [], not: [] }, { all: 'B', any: 'C', not: 'D' })).toEqual({ all: ['A', 'B'], any: ['C'], not: ['D'] })
    })

    it('語を欄から外す', () => {
      expect(removeKeyword({ all: ['A', 'B'], any: [], not: [] }, 'all', 'A')).toEqual({ all: ['B'], any: [], not: [] })
    })
  })

  describe('説明文', () => {
    it('すべて含む かつ いずれか（検索 API の実際の意味）として説明する', () => {
      expect(describeKeywordConditions({ all: ['初音ミク'], any: ['歌ってみた', '演奏してみた'], not: ['切り抜き'] }, 'keyword')).toEqual({
        text: '「初音ミク」を含み、「歌ってみた」か「演奏してみた」のどちらかも含む動画を探します。「切り抜き」を含む動画は除きます。',
        warning: false,
      })
    })

    it('タグ検索では「付いた」で説明する', () => {
      expect(describeKeywordConditions({ all: ['A', 'B'], any: [], not: ['X', 'Y', 'Z'] }, 'tag').text).toBe(
        'タグ「A」と「B」が両方付いた動画を探します。タグ「X」「Y」「Z」のどれかが付いた動画は除きます。',
      )
    })

    it('語の数に合わせて「両方・すべて・どちらか・どれか」を変える', () => {
      expect(describeKeywordConditions({ all: ['A', 'B', 'C'], any: [], not: [] }, 'keyword').text).toBe('「A」「B」「C」をすべて含む動画を探します。')
      expect(describeKeywordConditions({ all: [], any: ['A', 'B', 'C'], not: [] }, 'keyword').text).toBe('「A」「B」「C」のどれかを含む動画を探します。')
      expect(describeKeywordConditions({ all: [], any: ['A'], not: [] }, 'keyword').text).toBe('「A」を含む動画を探します。')
    })

    it('空なら何も出さず、含めないだけなら見つからないことを知らせる', () => {
      expect(describeKeywordConditions(EMPTY_KEYWORD_CONDITIONS, 'keyword')).toEqual({ text: '', warning: false })
      expect(describeKeywordConditions({ all: [], any: [], not: ['A'] }, 'keyword').warning).toBe(true)
    })

    it('200 文字を超える条件は、切り捨てずに減らすよう知らせる', () => {
      const long = Array.from({ length: 30 }, (_, i) => `ことばことば${i}`)
      const result = describeKeywordConditions({ all: long, any: [], not: [] }, 'keyword')
      expect(result.warning).toBe(true)
      expect(result.text).toContain('200文字まで')
    })
  })
})
