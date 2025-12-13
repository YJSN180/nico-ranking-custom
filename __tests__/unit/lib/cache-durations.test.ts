import { describe, it, expect } from 'vitest'
import { CACHE_DURATIONS, getCacheHeaders } from '@/lib/cache-durations'

describe('cache-durations', () => {
  describe('CACHE_DURATIONS constants', () => {
    it('should have correct static assets duration (24 hours)', () => {
      expect(CACHE_DURATIONS.STATIC_ASSETS).toBe(86400)
    })

    it('should have correct ranking API duration (20 minutes)', () => {
      expect(CACHE_DURATIONS.API_RANKING).toBe(1200)
    })

    it('should have correct popular tags duration (same as ranking)', () => {
      expect(CACHE_DURATIONS.API_POPULAR_TAGS).toBe(CACHE_DURATIONS.API_RANKING)
    })

    it('should have correct video stats duration (2 minutes)', () => {
      expect(CACHE_DURATIONS.API_VIDEO_STATS).toBe(120)
    })

    it('should have ISR revalidate match ranking duration', () => {
      expect(CACHE_DURATIONS.ISR_REVALIDATE).toBe(CACHE_DURATIONS.API_RANKING)
    })

    it('should have stale-while-revalidate durations configured', () => {
      expect(CACHE_DURATIONS.STALE_WHILE_REVALIDATE).toBeDefined()
      expect(CACHE_DURATIONS.STALE_WHILE_REVALIDATE.DEFAULT).toBe(1200)
      expect(CACHE_DURATIONS.STALE_WHILE_REVALIDATE.RANKING).toBe(2400)
      expect(CACHE_DURATIONS.STALE_WHILE_REVALIDATE.VIDEO_STATS).toBe(180)
    })

    it('should have CDN cache durations configured', () => {
      expect(CACHE_DURATIONS.CDN_CACHE).toBeDefined()
      expect(CACHE_DURATIONS.CDN_CACHE.RANKING).toBe(1200)
      expect(CACHE_DURATIONS.CDN_CACHE.VIDEO_STATS).toBe(120)
      expect(CACHE_DURATIONS.CDN_CACHE.STATIC).toBe(86400)
    })
  })

  describe('getCacheHeaders', () => {
    it('should return correct headers for ranking type', () => {
      const headers = getCacheHeaders('ranking')

      expect(headers).toContain('public')
      expect(headers).toContain('max-age=1200')
      expect(headers).toContain('s-maxage=1200')
      expect(headers).toContain('stale-while-revalidate=2400')
    })

    it('should return correct headers for video-stats type', () => {
      const headers = getCacheHeaders('video-stats')

      expect(headers).toContain('public')
      expect(headers).toContain('max-age=120')
      expect(headers).toContain('s-maxage=120')
      expect(headers).toContain('stale-while-revalidate=180')
    })

    it('should return correct headers for popular-tags type', () => {
      const headers = getCacheHeaders('popular-tags')

      expect(headers).toContain('public')
      expect(headers).toContain('max-age=1200')
      expect(headers).toContain('s-maxage=1200')
      expect(headers).toContain('stale-while-revalidate=2400')
    })

    it('should return correct headers for static type', () => {
      const headers = getCacheHeaders('static')

      expect(headers).toContain('public')
      expect(headers).toContain('max-age=86400')
      expect(headers).toContain('immutable')
    })

    it('should return default headers for unknown type', () => {
      // Test with an unknown type (using type assertion to bypass TypeScript)
      const headers = getCacheHeaders('unknown' as any)

      expect(headers).toContain('public')
      expect(headers).toContain('max-age=1200')
      expect(headers).toContain('s-maxage=1200')
    })
  })

  describe('cache timing relationships', () => {
    it('should have SWR duration >= cache duration for ranking', () => {
      expect(CACHE_DURATIONS.STALE_WHILE_REVALIDATE.RANKING)
        .toBeGreaterThanOrEqual(CACHE_DURATIONS.API_RANKING)
    })

    it('should have SWR duration >= cache duration for video-stats', () => {
      expect(CACHE_DURATIONS.STALE_WHILE_REVALIDATE.VIDEO_STATS)
        .toBeGreaterThanOrEqual(CACHE_DURATIONS.API_VIDEO_STATS)
    })

    it('should have video-stats update faster than ranking', () => {
      expect(CACHE_DURATIONS.API_VIDEO_STATS)
        .toBeLessThan(CACHE_DURATIONS.API_RANKING)
    })

    it('should have static assets cache longest', () => {
      expect(CACHE_DURATIONS.STATIC_ASSETS)
        .toBeGreaterThan(CACHE_DURATIONS.API_RANKING)
      expect(CACHE_DURATIONS.STATIC_ASSETS)
        .toBeGreaterThan(CACHE_DURATIONS.API_VIDEO_STATS)
    })
  })
})
