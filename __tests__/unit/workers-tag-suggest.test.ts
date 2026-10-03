// @vitest-environment node
import { describe, expect, it } from 'vitest'

import {
  TAG_POPULARITY_MAX_LEVEL,
  TAG_SUGGEST_MAX_QUERY,
  TAG_SUGGEST_MIN_QUERY,
  buildTagIndex,
  decodeTagPopularity,
  encodeTagPopularity,
  normalizeTagQuery,
  suggestTags,
  type TagIndex,
} from '../../workers/utils/tag-suggest'

describe('normalizeTagQuery', () => {
  it('trims, applies NFKC and lowercases', () => {
    expect(normalizeTagQuery('  ＳＹＮ合成　')).toBe('syn合成')
    expect(normalizeTagQuery('ｹﾞｰﾑ')).toBe('ゲーム')
  })

  it('exposes the query length bounds shared with the site route', () => {
    expect(TAG_SUGGEST_MIN_QUERY).toBe(2)
    expect(TAG_SUGGEST_MAX_QUERY).toBe(100)
  })
})

describe('buildTagIndex', () => {
  it('keeps string tags in dictionary order and skips everything else', () => {
    const index = buildTagIndex(['合成B', 1, null, '', { tag: 'x' }, 'SynA', ['nested'], '合成A'])

    expect(index.tags).toEqual(['合成B', 'SynA', '合成A'])
    expect(index.keys).toEqual(['合成b', 'syna', '合成a'])
  })

  it.each([null, undefined, 'tags', { tags: ['syn'] }])('answers an empty index for %o', (value) => {
    expect(buildTagIndex(value)).toEqual({ tags: [], keys: [] })
  })
})

describe('suggestTags', () => {
  const index = buildTagIndex(['xsyn1', 'syn-b', 'asyn2', 'SYN-A', 'other', 'syn-c'])

  it('puts prefix matches first and fills with substring matches, each in dictionary order', () => {
    expect(suggestTags(index, 'syn', 10)).toEqual(['syn-b', 'SYN-A', 'syn-c', 'xsyn1', 'asyn2'])
  })

  it('cuts the result at the limit', () => {
    expect(suggestTags(index, 'syn', 4)).toEqual(['syn-b', 'SYN-A', 'syn-c', 'xsyn1'])
    expect(suggestTags(index, 'syn', 2)).toEqual(['syn-b', 'SYN-A'])
    expect(suggestTags(index, 'syn', 0)).toEqual([])
  })

  it('matches regardless of case and returns the original spelling', () => {
    expect(suggestTags(index, 'Syn-a', 10)).toEqual(['SYN-A'])
  })

  it('matches full-width and half-width input through NFKC', () => {
    const japanese = buildTagIndex(['ｹﾞｰﾑ実況', 'ＶＯＣＡＬＯＩＤ', '実況ゲーム'])

    expect(suggestTags(japanese, 'ゲーム', 10)).toEqual(['ｹﾞｰﾑ実況', '実況ゲーム'])
    expect(suggestTags(japanese, 'ｖｏｃａ', 10)).toEqual(['ＶＯＣＡＬＯＩＤ'])
    expect(suggestTags(japanese, '　vocaloid ', 10)).toEqual(['ＶＯＣＡＬＯＩＤ'])
  })

  it('answers nothing for a blank query', () => {
    expect(suggestTags(index, '   ', 10)).toEqual([])
  })

  it('stops scanning once the prefix matches fill the limit', () => {
    const tags = ['syn1', 'syn2', 'syn3', ...Array.from({ length: 1000 }, (_, i) => `later-syn${i}`)]
    const built = buildTagIndex(tags)
    let highestRead = -1
    const keys = new Proxy(built.keys as string[], {
      get(target, property, receiver) {
        if (typeof property === 'string' && /^\d+$/.test(property)) highestRead = Math.max(highestRead, Number(property))
        return Reflect.get(target, property, receiver)
      },
    })
    const counted: TagIndex = { tags: built.tags, keys }

    expect(suggestTags(counted, 'syn', 3)).toEqual(['syn1', 'syn2', 'syn3'])
    expect(highestRead).toBe(2)
  })

  it('keeps scanning for prefix matches after the substring slots are full', () => {
    const late = buildTagIndex(['a-syn', 'b-syn', 'c-syn', 'syn-late'])

    expect(suggestTags(late, 'syn', 2)).toEqual(['syn-late', 'a-syn'])
  })
})

// 比較用: 全件を照合して並べ替える（キーが同じ・前方一致・部分一致の順に、人気度の高い順、同じなら辞書の順）
function sortAllByPopularity(tags: string[], scores: number[], query: string, limit: number): string[] {
  const needle = normalizeTagQuery(query)
  if (needle === '' || !(limit >= 1)) return []
  const kind = (key: string): number =>
    key === needle ? 0 : key.startsWith(needle) ? 1 : key.includes(needle) ? 2 : -1
  return tags
    .map((tag, i) => ({ tag, i, kind: kind(tag.normalize('NFKC').toLowerCase()) }))
    .filter((row) => row.kind >= 0)
    .sort((a, b) => a.kind - b.kind || scores[b.i] - scores[a.i] || a.i - b.i)
    .slice(0, limit)
    .map((row) => row.tag)
}

// 比較用: 人気度のない今までの並び（前方一致を辞書の順、足りない分を部分一致の辞書の順）
function dictionaryOrder(tags: string[], query: string, limit: number): string[] {
  const needle = normalizeTagQuery(query)
  if (needle === '' || !(limit >= 1)) return []
  const keys = tags.map((tag) => tag.normalize('NFKC').toLowerCase())
  const prefix = tags.filter((_, i) => keys[i].startsWith(needle))
  const substring = tags.filter((_, i) => !keys[i].startsWith(needle) && keys[i].includes(needle))
  return prefix.concat(substring).slice(0, limit)
}

function randomCorpus(seed: number, count: number): { tags: string[]; scores: number[]; queries: string[] } {
  let state = seed
  const random = (): number => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0
    return state / 4294967296
  }
  // 全角・半角・大文字で同じキーになる文字を混ぜ、同じ人気度も多くする
  const chars = ['a', 'b', 'A', 'Ａ', 'ア', 'ｱ', 'イ', 'ー']
  const word = (min: number, max: number): string => {
    let text = ''
    const length = min + Math.floor(random() * (max - min + 1))
    for (let i = 0; i < length; i++) text += chars[Math.floor(random() * chars.length)]
    return text
  }
  const tags = Array.from({ length: count }, () => word(1, 6))
  const scores = tags.map(() => (random() < 0.3 ? 0 : Math.floor(random() * 12)))
  const queries = Array.from({ length: 200 }, () => word(1, 3))
  return { tags, scores, queries }
}

describe('tag popularity codec', () => {
  it('round-trips levels as three base-36 characters per tag', () => {
    const levels = [0, 1, 35, 36, 1295, 1296, 20_000, TAG_POPULARITY_MAX_LEVEL]
    const encoded = encodeTagPopularity(levels)

    expect(encoded).toBe('000' + '001' + '00z' + '010' + '0zz' + '100' + 'ffk' + 'zzz')
    expect(Array.from(decodeTagPopularity(encoded, levels.length) ?? [])).toEqual(levels)
    expect(decodeTagPopularity('', 0)).toEqual(new Uint16Array(0))
  })

  it.each([
    ['a shorter string', '00100', 2],
    ['a longer string', '0010020', 2],
    ['upper-case digits', '00A001', 2],
    ['other characters', '00-001', 2],
    ['a number', 1, 1],
    ['an array', ['001'], 1],
  ])('cannot decode %s', (_label, value, count) => {
    expect(decodeTagPopularity(value, count)).toBeNull()
  })

  it('refuses to encode levels it cannot store', () => {
    for (const level of [-1, 1.5, TAG_POPULARITY_MAX_LEVEL + 1, Number.NaN]) {
      expect(() => encodeTagPopularity([level])).toThrow('popularity level')
    }
  })
})

describe('buildTagIndex with popularity', () => {
  it('keeps scores aligned with the tags it keeps', () => {
    const index = buildTagIndex(['b', 1, '', 'a', null, 'c'], encodeTagPopularity([5, 9, 9, 7, 9, 3]))

    expect(index.tags).toEqual(['b', 'a', 'c'])
    expect(Array.from(index.scores ?? [])).toEqual([5, 7, 3])
  })

  it.each([
    ['too short', '001002'],
    ['too long', '001002003004'],
    ['not base 36', '001002-03'],
    ['not a string', [1, 2, 3]],
    ['missing', undefined],
  ])('builds the index without scores when popularity is %s', (_label, popularity) => {
    const index = buildTagIndex(['b', 'a', 'c'], popularity)

    expect(index).toEqual({ tags: ['b', 'a', 'c'], keys: ['b', 'a', 'c'] })
    expect(index.scores).toBeUndefined()
  })
})

describe('suggestTags with popularity', () => {
  const withScores = (tags: string[], scores: number[]): TagIndex => buildTagIndex(tags, encodeTagPopularity(scores))

  it('puts the exact match first, then prefix and substring matches by popularity', () => {
    const index = withScores(
      ['初音ミクV3', '初音ミク', 'ミク初音', '初音', '初音ミクNT', '初音ミク AI', '鏡音リン初音'],
      [5, 900, 40, 0, 120, 120, 300],
    )

    expect(suggestTags(index, '初音', 10)).toEqual([
      '初音',
      '初音ミク',
      '初音ミクNT',
      '初音ミク AI',
      '初音ミクV3',
      '鏡音リン初音',
      'ミク初音',
    ])
  })

  it('orders several tags with the same key by popularity, then dictionary order', () => {
    const index = withScores(['ＶＯＣＡＬＯＩＤ', 'VOCALOID', 'vocaloid', 'VOCALOID曲'], [3, 3, 8, 50])

    expect(suggestTags(index, 'vocaloid', 10)).toEqual(['vocaloid', 'ＶＯＣＡＬＯＩＤ', 'VOCALOID', 'VOCALOID曲'])
  })

  it('keeps dictionary order among tags with the same popularity', () => {
    const index = withScores(['syn-c', 'xsyn', 'syn-a', 'asyn', 'syn-b'], [0, 0, 0, 0, 0])

    expect(suggestTags(index, 'syn', 10)).toEqual(['syn-c', 'syn-a', 'syn-b', 'xsyn', 'asyn'])
  })

  it('cuts at the limit and finds a popular prefix match at the end of the dictionary', () => {
    const tags = ['syn1', 'syn2', 'syn3', ...Array.from({ length: 1000 }, (_, i) => `later-syn${i}`), 'syn-popular']
    const index = withScores(tags, tags.map((tag) => (tag === 'syn-popular' ? 10 : 1)))

    expect(suggestTags(index, 'syn', 2)).toEqual(['syn-popular', 'syn1'])
    expect(suggestTags(index, 'syn', 0)).toEqual([])
    expect(suggestTags(index, '  ', 10)).toEqual([])
  })

  it('fills with the most popular substring matches only after every prefix match', () => {
    const index = withScores(['a-syn', 'b-syn', 'c-syn', 'syn-late'], [1, 7, 7, 0])

    expect(suggestTags(index, 'syn', 3)).toEqual(['syn-late', 'b-syn', 'c-syn'])
  })

  it('matches a full sort on random data', () => {
    for (const seed of [1, 2, 3]) {
      const { tags, scores, queries } = randomCorpus(seed, 3000)
      const index = withScores(tags, scores)
      for (const query of queries) {
        for (const limit of [1, 3, 10, 50]) {
          expect(suggestTags(index, query, limit)).toEqual(sortAllByPopularity(tags, scores, query, limit))
        }
      }
    }
  })

  it('answers the previous dictionary order when the dictionary has no popularity', () => {
    for (const seed of [4, 5]) {
      const { tags, queries } = randomCorpus(seed, 3000)
      const index = buildTagIndex(tags)
      for (const query of queries) {
        for (const limit of [1, 3, 10, 50]) {
          expect(suggestTags(index, query, limit)).toEqual(dictionaryOrder(tags, query, limit))
        }
      }
    }
  })
})
