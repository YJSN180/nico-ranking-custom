/**
 * @jest-environment node
 */

import { describe, expect, test, vi } from 'vitest'

describe('Cache Effectiveness', () => {
  test('should have appropriate cache headers configured in next.config.mjs', () => {
    const nextConfig = require('../../next.config.mjs').default
    
    expect(nextConfig.headers).toBeDefined()
    expect(typeof nextConfig.headers).toBe('function')
  })

  test('should configure API route caching', async () => {
    const nextConfig = require('../../next.config.mjs').default
    const headers = await nextConfig.headers()
    
    // Find API cache configuration
    const apiCacheConfig = headers.find((h: any) => h.source === '/api/:path*')
    expect(apiCacheConfig).toBeDefined()
    
    const cacheHeader = apiCacheConfig.headers.find((h: any) => h.key === 'Cache-Control')
    expect(cacheHeader).toBeDefined()
    expect(cacheHeader.value).toContain('s-maxage=180') // 3 minutes server cache
    expect(cacheHeader.value).toContain('stale-while-revalidate=300') // 5 minutes stale
  })

  test('should configure static asset caching', async () => {
    const nextConfig = require('../../next.config.mjs').default
    const headers = await nextConfig.headers()
    
    // Find static asset cache configuration
    const staticCacheConfig = headers.find((h: any) => 
      h.source.includes('png|jpg|jpeg|gif|ico|svg|webp')
    )
    expect(staticCacheConfig).toBeDefined()
    
    const cacheHeader = staticCacheConfig.headers.find((h: any) => h.key === 'Cache-Control')
    expect(cacheHeader).toBeDefined()
    expect(cacheHeader.value).toContain('max-age=86400') // 24 hours
    expect(cacheHeader.value).toContain('immutable') // Never changes
  })

  test('cache durations should be appropriate for content type', async () => {
    const nextConfig = require('../../next.config.mjs').default
    const headers = await nextConfig.headers()
    
    // API cache: Short duration for dynamic content
    const apiCache = headers.find((h: any) => h.source === '/api/:path*')
    const apiCacheControl = apiCache.headers.find((h: any) => h.key === 'Cache-Control')
    expect(apiCacheControl.value).toMatch(/s-maxage=180/) // 3 minutes
    
    // Static assets: Long duration for immutable content
    const staticCache = headers.find((h: any) => h.source.includes('png|jpg'))
    const staticCacheControl = staticCache.headers.find((h: any) => h.key === 'Cache-Control')
    expect(staticCacheControl.value).toMatch(/max-age=86400/) // 24 hours
  })

  test('page ISR configuration should match data update frequency', async () => {
    const pageModule = await import('../../app/page.tsx')
    
    // Cron job runs every 30 minutes (1800 seconds)
    // Page revalidation should match this interval
    expect(pageModule.revalidate).toBe(1800)
  })

  test('cache configuration should minimize resource consumption', async () => {
    // Test that cache settings are optimized for free tier limits
    const pageModule = await import('../../app/page.tsx')
    const nextConfig = (await import('../../next.config.mjs')).default
    const headers = await nextConfig.headers()
    
    // ISR should reduce function invocations
    expect(pageModule.revalidate).toBeGreaterThan(300) // At least 5 minutes
    
    // API cache should reduce repeated calls
    const apiCache = headers.find((h: any) => h.source === '/api/:path*')
    const cacheControl = apiCache.headers.find((h: any) => h.key === 'Cache-Control')
    expect(cacheControl.value).toMatch(/s-maxage=\d+/) // Server-side caching enabled
  })

  test('stale-while-revalidate should provide good UX', async () => {
    const nextConfig = require('../../next.config.mjs').default
    const headers = await nextConfig.headers()
    
    const apiCache = headers.find((h: any) => h.source === '/api/:path*')
    const cacheControl = apiCache.headers.find((h: any) => h.key === 'Cache-Control')
    
    // Should serve stale content while updating in background
    expect(cacheControl.value).toContain('stale-while-revalidate')
    
    // Stale time should be longer than fresh time for better UX
    const sMaxAge = parseInt(cacheControl.value.match(/s-maxage=(\d+)/)?.[1] || '0')
    const staleTime = parseInt(cacheControl.value.match(/stale-while-revalidate=(\d+)/)?.[1] || '0')
    expect(staleTime).toBeGreaterThan(sMaxAge)
  })
})