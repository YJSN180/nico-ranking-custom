// @vitest-environment node
import { describe, expect, it } from 'vitest'
import { decodeHtmlEntities } from '@/lib/html-entities'

describe('decodeHtmlEntities', () => {
  it('decodes the five XML named entities', () => {
    expect(decodeHtmlEntities('&amp;&lt;&gt;&quot;&apos;')).toBe('&<>"\'')
    expect(decodeHtmlEntities('ゲーム&amp;ウオッチ')).toBe('ゲーム&ウオッチ')
    expect(decodeHtmlEntities('&gt;&gt;突然の死&lt;&lt;')).toBe('>>突然の死<<')
    expect(decodeHtmlEntities('&amp;&amp;&amp;')).toBe('&&&')
  })

  it('decodes decimal and hexadecimal references, including astral characters', () => {
    expect(decodeHtmlEntities('It&#39;s')).toBe("It's")
    expect(decodeHtmlEntities('It&#039;s')).toBe("It's")
    expect(decodeHtmlEntities('&#x27;&#X27;&#x2F;&#x2f;')).toBe("''//")
    expect(decodeHtmlEntities('&#x1F600;&#128512;')).toBe('😀😀')
    expect(decodeHtmlEntities('&#12354;&#x3042;')).toBe('ああ')
  })

  it('decodes exactly once, leaving double-encoded text one level down', () => {
    expect(decodeHtmlEntities('&amp;lt;')).toBe('&lt;')
    expect(decodeHtmlEntities('&amp;amp;')).toBe('&amp;')
    expect(decodeHtmlEntities('chage&amp;amp;aska')).toBe('chage&amp;aska')
    expect(decodeHtmlEntities('L&amp;#039;Arc～en～Ciel')).toBe(
      'L&#039;Arc～en～Ciel',
    )
    expect(decodeHtmlEntities('&amp;quot;')).toBe('&quot;')
  })

  it('leaves text that is not a known, terminated reference unchanged', () => {
    for (const text of [
      '',
      'ゲーム&ウオッチ',
      'A & B',
      '&',
      '&&&',
      '&23',
      '&u',
      '&amp',
      '&amp ;',
      '&AMP;',
      '&nbsp;',
      '&copy;',
      '&foo;',
      '&#;',
      '&#x;',
      '&#xZZ;',
      '&#12345678;',
      '&#x1234567;',
    ]) {
      expect(decodeHtmlEntities(text)).toBe(text)
    }
  })

  it('never produces control characters or lone surrogates', () => {
    for (const text of [
      '&#0;',
      '&#9;',
      '&#10;',
      '&#13;',
      '&#x1F;',
      '&#127;',
      '&#x7F;',
      '&#x80;',
      '&#159;',
      '&#x9F;',
      '&#xD800;',
      '&#xDFFF;',
      '&#55296;',
      '&#x110000;',
      '&#1114112;',
    ]) {
      expect(decodeHtmlEntities(`a${text}b`)).toBe(`a${text}b`)
    }
    expect(decodeHtmlEntities('&#32;&#xA0;&#x10FFFF;')).toBe(
      String.fromCodePoint(0x20, 0xa0, 0x10ffff),
    )
  })

  it('does not change names that are already decoded and contain no references', () => {
    for (const name of [
      'ゲーム&ウオッチ',
      '>>1000',
      "L'Arc～en～Ciel",
      '"引用"',
      'ミク＆flowerリンク',
      '<br>',
    ]) {
      expect(decodeHtmlEntities(name)).toBe(name)
    }
  })
})
