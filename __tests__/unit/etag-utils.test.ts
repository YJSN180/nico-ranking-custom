/**
 * ETagユーティリティのユニットテスト
 * t-wada式TDD: RED → GREEN → REFACTOR
 */

import { describe, it, expect } from 'vitest'
import { generateETag, parseIfNoneMatch, isETagMatch } from '../../lib/cache-utils'

describe('ETag utilities', () => {
  describe('generateETag', () => {
    it('文字列からETagを生成する', () => {
      const content = JSON.stringify({ items: [], metadata: { version: 1 } })
      const etag = generateETag(content)
      
      expect(etag).toMatch(/^"[a-f0-9]{64}"$/) // SHA-256ハッシュの形式
    })

    it('同じ内容からは同じETagを生成する', () => {
      const content = JSON.stringify({ test: 'data' })
      const etag1 = generateETag(content)
      const etag2 = generateETag(content)
      
      expect(etag1).toBe(etag2)
    })

    it('異なる内容からは異なるETagを生成する', () => {
      const content1 = JSON.stringify({ test: 'data1' })
      const content2 = JSON.stringify({ test: 'data2' })
      const etag1 = generateETag(content1)
      const etag2 = generateETag(content2)
      
      expect(etag1).not.toBe(etag2)
    })

    it('Uint8Arrayからも生成できる', () => {
      const content = new TextEncoder().encode('test data')
      const etag = generateETag(content)
      
      expect(etag).toMatch(/^"[a-f0-9]{64}"$/)
    })

    it('weakフラグを付けることができる', () => {
      const content = 'test data'
      const etag = generateETag(content, { weak: true })
      
      expect(etag).toMatch(/^W\/"[a-f0-9]{64}"$/)
    })
  })

  describe('parseIfNoneMatch', () => {
    it('単一のETagをパースする', () => {
      const header = '"abc123"'
      const etags = parseIfNoneMatch(header)
      
      expect(etags).toEqual(['"abc123"'])
    })

    it('複数のETagをパースする', () => {
      const header = '"abc123", "def456", "ghi789"'
      const etags = parseIfNoneMatch(header)
      
      expect(etags).toEqual(['"abc123"', '"def456"', '"ghi789"'])
    })

    it('weak ETagをパースする', () => {
      const header = 'W/"abc123", "def456"'
      const etags = parseIfNoneMatch(header)
      
      expect(etags).toEqual(['W/"abc123"', '"def456"'])
    })

    it('ワイルドカードをパースする', () => {
      const header = '*'
      const etags = parseIfNoneMatch(header)
      
      expect(etags).toEqual(['*'])
    })

    it('空白を適切に処理する', () => {
      const header = '  "abc123"  ,  "def456"  '
      const etags = parseIfNoneMatch(header)
      
      expect(etags).toEqual(['"abc123"', '"def456"'])
    })

    it('nullやundefinedの場合は空配列を返す', () => {
      expect(parseIfNoneMatch(null)).toEqual([])
      expect(parseIfNoneMatch(undefined)).toEqual([])
      expect(parseIfNoneMatch('')).toEqual([])
    })
  })

  describe('isETagMatch', () => {
    it('完全一致する場合はtrueを返す', () => {
      const currentETag = '"abc123"'
      const ifNoneMatch = '"abc123"'
      
      expect(isETagMatch(currentETag, ifNoneMatch)).toBe(true)
    })

    it('一致しない場合はfalseを返す', () => {
      const currentETag = '"abc123"'
      const ifNoneMatch = '"def456"'
      
      expect(isETagMatch(currentETag, ifNoneMatch)).toBe(false)
    })

    it('複数のETagのうち1つでも一致すればtrueを返す', () => {
      const currentETag = '"abc123"'
      const ifNoneMatch = '"xyz789", "abc123", "def456"'
      
      expect(isETagMatch(currentETag, ifNoneMatch)).toBe(true)
    })

    it('ワイルドカードの場合は常にtrueを返す', () => {
      const currentETag = '"abc123"'
      const ifNoneMatch = '*'
      
      expect(isETagMatch(currentETag, ifNoneMatch)).toBe(true)
    })

    it('weak ETagの比較は弱い比較を行う', () => {
      const currentETag = 'W/"abc123"'
      const ifNoneMatch = '"abc123"'
      
      // RFC 7232に従い、weak比較では一致する
      expect(isETagMatch(currentETag, ifNoneMatch, { weak: true })).toBe(true)
    })

    it('strong比較ではweak ETagは一致しない', () => {
      const currentETag = 'W/"abc123"'
      const ifNoneMatch = '"abc123"'
      
      expect(isETagMatch(currentETag, ifNoneMatch, { weak: false })).toBe(false)
    })
  })
})