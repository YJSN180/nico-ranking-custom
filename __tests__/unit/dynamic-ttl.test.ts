/**
 * 動的TTL計算関数のユニットテスト
 * t-wada式TDD: RED → GREEN → REFACTOR
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { calculateDynamicTTL } from '../../lib/cache-utils'

describe('calculateDynamicTTL', () => {
  beforeEach(() => {
    // タイムゾーンに依存しないようにUTCで固定
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  describe('次の更新時刻の計算', () => {
    it('現在時刻が毎時0-4分の場合、次の更新は5分', () => {
      // 2025-01-01 10:03:30 UTC
      const testDate = new Date('2025-01-01T10:03:30.000Z')
      vi.setSystemTime(testDate)

      const result = calculateDynamicTTL()

      // 10:05:00までの秒数 = 90秒
      expect(result.secondsUntilUpdate).toBe(90)
    })

    it('現在時刻が毎時5-24分の場合、次の更新は25分', () => {
      // 2025-01-01 10:10:00 UTC
      const testDate = new Date('2025-01-01T10:10:00.000Z')
      vi.setSystemTime(testDate)

      const result = calculateDynamicTTL()

      // 10:25:00までの秒数 = 15分 = 900秒
      expect(result.secondsUntilUpdate).toBe(900)
    })

    it('現在時刻が毎時25分以降の場合、次の更新は翌時の5分', () => {
      // 2025-01-01 10:30:00 UTC
      const testDate = new Date('2025-01-01T10:30:00.000Z')
      vi.setSystemTime(testDate)

      const result = calculateDynamicTTL()

      // 11:05:00までの秒数 = 35分 = 2100秒
      expect(result.secondsUntilUpdate).toBe(2100)
    })

    it('現在時刻が23:30の場合、次の更新は翌日0:05', () => {
      // 2025-01-01 23:30:00 UTC
      const testDate = new Date('2025-01-01T23:30:00.000Z')
      vi.setSystemTime(testDate)

      const result = calculateDynamicTTL()

      // 翌日0:05:00までの秒数 = 35分 = 2100秒
      expect(result.secondsUntilUpdate).toBe(2100)
    })
  })

  describe('TTL値の計算', () => {
    it('WorkersのTTLは次の更新時刻まで、最低60秒', () => {
      // 更新直前のケース: 10:04:30
      const testDate = new Date('2025-01-01T10:04:30.000Z')
      vi.setSystemTime(testDate)

      const result = calculateDynamicTTL()

      // 10:05:00までの30秒 → 最低60秒
      expect(result.workersTTL).toBe(60)
      expect(result.secondsUntilUpdate).toBe(30)
    })

    it('CDN EdgeのTTLはWorkersより1分短い、最低60秒', () => {
      // 10:10:00 → 10:25:00まで900秒
      const testDate = new Date('2025-01-01T10:10:00.000Z')
      vi.setSystemTime(testDate)

      const result = calculateDynamicTTL()

      expect(result.workersTTL).toBe(900)
      expect(result.cdnTTL).toBe(840) // 900 - 60
    })

    it('BrowserのTTLはWorkersより2分短い、最低60秒', () => {
      // 10:10:00 → 10:25:00まで900秒
      const testDate = new Date('2025-01-01T10:10:00.000Z')
      vi.setSystemTime(testDate)

      const result = calculateDynamicTTL()

      expect(result.workersTTL).toBe(900)
      expect(result.browserTTL).toBe(780) // 900 - 120
    })

    it('TTL値が最低値を下回らない', () => {
      // 更新1分前: 10:24:00
      const testDate = new Date('2025-01-01T10:24:00.000Z')
      vi.setSystemTime(testDate)

      const result = calculateDynamicTTL()

      expect(result.secondsUntilUpdate).toBe(60)
      expect(result.workersTTL).toBe(60)    // 最低60秒
      expect(result.cdnTTL).toBe(60)        // 60 - 60 = 0 → 最低60秒
      expect(result.browserTTL).toBe(60)    // 60 - 120 = -60 → 最低60秒
    })
  })

  describe('Cache-Controlヘッダーの生成', () => {
    it('適切なCache-Controlヘッダー文字列を生成する', () => {
      const testDate = new Date('2025-01-01T10:10:00.000Z')
      vi.setSystemTime(testDate)

      const result = calculateDynamicTTL()

      expect(result.cacheControl).toBe('public, max-age=780, s-maxage=840, stale-while-revalidate=86400')
      expect(result.cdnCacheControl).toBe('public, max-age=840')
    })
  })

  describe('エッジケース', () => {
    it('更新時刻ちょうどの場合', () => {
      // 10:05:00ちょうど
      const testDate = new Date('2025-01-01T10:05:00.000Z')
      vi.setSystemTime(testDate)

      const result = calculateDynamicTTL()

      // 次は10:25:00 → 20分 = 1200秒
      expect(result.secondsUntilUpdate).toBe(1200)
      expect(result.workersTTL).toBe(1200)
    })

    it('秒単位の精度を正しく扱う', () => {
      // 10:04:59.999
      const testDate = new Date('2025-01-01T10:04:59.999Z')
      vi.setSystemTime(testDate)

      const result = calculateDynamicTTL()

      // 10:05:00まで0.001秒 → 切り捨てで0秒 → 最低60秒
      expect(result.workersTTL).toBe(60)
    })
  })
})