// @vitest-environment node
import { describe, expect, it } from 'vitest'
import {
  isSameTagName,
  tagNameForms,
  tagNameFormsIgnoringCase,
  tagNameIncludes,
} from '@/lib/tag-name-match'

const same = (saved: string, tag: string): boolean =>
  isSameTagName(tagNameFormsIgnoringCase(saved), tagNameFormsIgnoringCase(tag))
const includes = (tag: string, saved: string): boolean =>
  tagNameIncludes(
    tagNameFormsIgnoringCase(tag),
    tagNameFormsIgnoringCase(saved),
  )

describe('tag-name-match', () => {
  it('matches a saved escaped name with the decoded video tag and the reverse', () => {
    expect(same('DAM&amp;JOY配信中', 'DAM&JOY配信中')).toBe(true)
    expect(same('DAM&JOY配信中', 'DAM&amp;JOY配信中')).toBe(true)
    expect(same('Let&apos;s', "Let's")).toBe(true)
    expect(same("Let's", 'Let&#39;s')).toBe(true)
    expect(same('&gt;&gt;突然の死&lt;&lt;', '>>突然の死<<')).toBe(true)
  })

  it('keeps plain names exactly as before (case-insensitive equality only)', () => {
    expect(same('VOCALOID', 'vocaloid')).toBe(true)
    expect(same('ゲーム', 'ゲーム実況')).toBe(false)
    expect(same('ゲーム', 'ゲーム')).toBe(true)
    expect(includes('ゲーム実況', 'ゲーム')).toBe(true)
    expect(includes('BGM素材', 'bgm')).toBe(true)
    expect(includes('ゲーム', '実況')).toBe(false)
  })

  it('keeps real names that contain & or entity-like text matchable', () => {
    // 本当の名前に & を含むタグ
    expect(same('Tom&Jerry', 'Tom&Jerry')).toBe(true)
    expect(same('R & B', 'R & B')).toBe(true)
    // 本当の名前が chage&amp;aska のタグ。修正後の動画は 1 回戻した形、修正前の保存値は XML のまま
    expect(same('chage&amp;aska', 'chage&amp;aska')).toBe(true)
    expect(same('chage&amp;amp;aska', 'chage&amp;aska')).toBe(true)
    expect(same('chage&amp;aska', 'chage&amp;amp;aska')).toBe(true)
  })

  it('does not decode more than one level apart', () => {
    expect(same('a&amp;amp;b', 'a&b')).toBe(false)
    expect(same('a&b', 'a&amp;amp;b')).toBe(false)
  })

  it('decodes before folding case so &AMP; stays literal', () => {
    expect(same('A&AMP;B', 'a&b')).toBe(false)
    expect(same('A&AMP;B', 'a&amp;b')).toBe(true)
  })

  it('matches partial words written at either escaping level', () => {
    expect(includes('DAM&JOY配信中', 'DAM&amp;JOY')).toBe(true)
    expect(includes('DAM&amp;JOY配信中', 'DAM&JOY')).toBe(true)
    expect(includes('DAM&JOY配信中', '&amp;')).toBe(true)
    expect(includes('DAM&amp;JOY配信中', 'amp')).toBe(true)
    expect(includes('DAM&JOY配信中', 'amp')).toBe(false)
  })

  it('is case-sensitive with tagNameForms', () => {
    const forms = (name: string) => tagNameForms(name)
    expect(isSameTagName(forms('DAM&amp;JOY'), forms('DAM&JOY'))).toBe(true)
    expect(isSameTagName(forms('dam&amp;joy'), forms('DAM&JOY'))).toBe(false)
  })
})
