import { describe, it, expect } from 'vitest'
import { formatNumber, formatDuration, formatDate, formatTimeAgo } from '@/lib/format-utils'

describe('format-utils', () => {
  describe('formatNumber', () => {
    it('should format numbers less than 10000', () => {
      expect(formatNumber(0)).toBe('0')
      expect(formatNumber(999)).toBe('999')
      expect(formatNumber(9999)).toBe('9,999')
    })

    it('should format numbers in 万 units', () => {
      expect(formatNumber(10000)).toBe('1万')
      expect(formatNumber(15000)).toBe('1.5万')
      expect(formatNumber(99999)).toBe('10万')
      expect(formatNumber(100000)).toBe('10万')
      expect(formatNumber(999999)).toBe('100万')
    })

    it('should format numbers in 億 units', () => {
      expect(formatNumber(100000000)).toBe('1億')
      expect(formatNumber(150000000)).toBe('1.5億')
      expect(formatNumber(999999999)).toBe('10億')
    })

    it('should handle edge cases', () => {
      expect(formatNumber(-1000)).toBe('-1,000')
      expect(formatNumber(-10000)).toBe('-1万')
    })
  })

  describe('formatDuration', () => {
    it('should format seconds only', () => {
      expect(formatDuration(0)).toBe('0:00')
      expect(formatDuration(9)).toBe('0:09')
      expect(formatDuration(59)).toBe('0:59')
    })

    it('should format minutes and seconds', () => {
      expect(formatDuration(60)).toBe('1:00')
      expect(formatDuration(125)).toBe('2:05')
      expect(formatDuration(599)).toBe('9:59')
      expect(formatDuration(3599)).toBe('59:59')
    })

    it('should format hours, minutes and seconds', () => {
      expect(formatDuration(3600)).toBe('1:00:00')
      expect(formatDuration(3661)).toBe('1:01:01')
      expect(formatDuration(7325)).toBe('2:02:05')
      expect(formatDuration(86399)).toBe('23:59:59')
    })

    it('should handle edge cases', () => {
      expect(formatDuration(-10)).toBe('0:00')
      expect(formatDuration(86400)).toBe('24:00:00')
    })
  })

  describe('formatDate', () => {
    it('should format date in Japanese format', () => {
      const date = new Date('2024-01-15T10:30:00')
      expect(formatDate(date)).toMatch(/2024年1月15日/)
    })

    it('should format string dates', () => {
      expect(formatDate('2024-01-15T10:30:00')).toMatch(/2024年1月15日/)
    })

    it('should format with time when specified', () => {
      const date = new Date('2024-01-15T10:30:00')
      const formatted = formatDate(date, true)
      expect(formatted).toMatch(/2024年1月15日/)
      expect(formatted).toMatch(/10:30/)
    })

    it('should handle invalid dates', () => {
      expect(formatDate('invalid')).toBe('Invalid Date')
      expect(formatDate(null as any)).toBe('Invalid Date')
    })
  })

  describe('formatTimeAgo', () => {
    const now = new Date('2024-01-15T12:00:00')
    const originalNow = Date.now

    beforeEach(() => {
      Date.now = () => now.getTime()
    })

    afterEach(() => {
      Date.now = originalNow
    })

    it('should format seconds ago', () => {
      const date = new Date('2024-01-15T11:59:30')
      expect(formatTimeAgo(date)).toBe('30秒前')
      
      const date2 = new Date('2024-01-15T11:59:01')
      expect(formatTimeAgo(date2)).toBe('59秒前')
    })

    it('should format minutes ago', () => {
      const date = new Date('2024-01-15T11:30:00')
      expect(formatTimeAgo(date)).toBe('30分前')
      
      const date2 = new Date('2024-01-15T11:01:00')
      expect(formatTimeAgo(date2)).toBe('59分前')
    })

    it('should format hours ago', () => {
      const date = new Date('2024-01-15T10:00:00')
      expect(formatTimeAgo(date)).toBe('2時間前')
      
      const date2 = new Date('2024-01-14T13:00:00')
      expect(formatTimeAgo(date2)).toBe('23時間前')
    })

    it('should format days ago', () => {
      const date = new Date('2024-01-14T12:00:00')
      expect(formatTimeAgo(date)).toBe('1日前')
      
      const date2 = new Date('2024-01-09T12:00:00')
      expect(formatTimeAgo(date2)).toBe('6日前')
    })

    it('should format weeks ago', () => {
      const date = new Date('2024-01-01T12:00:00')
      expect(formatTimeAgo(date)).toBe('2週間前')
      
      const date2 = new Date('2023-12-18T12:00:00')
      expect(formatTimeAgo(date2)).toBe('4週間前')
    })

    it('should format months ago', () => {
      const date = new Date('2023-12-15T12:00:00')
      expect(formatTimeAgo(date)).toBe('1ヶ月前')
      
      const date2 = new Date('2023-07-15T12:00:00')
      expect(formatTimeAgo(date2)).toBe('6ヶ月前')
    })

    it('should format years ago', () => {
      const date = new Date('2023-01-15T12:00:00')
      expect(formatTimeAgo(date)).toBe('1年前')
      
      const date2 = new Date('2020-01-15T12:00:00')
      expect(formatTimeAgo(date2)).toBe('4年前')
    })

    it('should handle future dates', () => {
      const date = new Date('2024-01-15T13:00:00')
      expect(formatTimeAgo(date)).toBe('0秒前')
    })

    it('should handle string dates', () => {
      const date = '2024-01-15T11:30:00'
      expect(formatTimeAgo(date)).toBe('30分前')
    })
  })
})