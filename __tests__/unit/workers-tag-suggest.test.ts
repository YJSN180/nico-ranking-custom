// @vitest-environment node
import { describe, expect, it } from 'vitest'

import {
  TAG_SUGGEST_MAX_QUERY,
  TAG_SUGGEST_MIN_QUERY,
  buildTagIndex,
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
