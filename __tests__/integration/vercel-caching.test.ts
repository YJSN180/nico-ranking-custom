/**
 * @jest-environment node
 */

import { describe, expect, test } from 'vitest'

describe('Vercel Page Caching', () => {
  test('should have revalidate configuration', async () => {
    // Verify that the main page has ISR configuration
    // This is checked by importing the page component and checking its export
    const pageModule = await import('../../app/page.tsx')
    
    expect(pageModule.revalidate).toBe(1800) // 30 minutes in seconds
  })

  test('should have proper cache headers structure', async () => {
    // Test that our page exports the correct cache configuration
    const pageModule = await import('../../app/page.tsx')
    
    // Verify revalidate is a number and within expected range
    expect(typeof pageModule.revalidate).toBe('number')
    expect(pageModule.revalidate).toBeGreaterThan(0)
    expect(pageModule.revalidate).toBeLessThanOrEqual(3600) // Max 1 hour
  })

  test('should not have dynamic export that disables caching', async () => {
    // Ensure we don't accidentally disable ISR
    const pageModule = await import('../../app/page.tsx')
    
    // dynamic should not be 'force-dynamic' as that would disable ISR
    expect(pageModule.dynamic).not.toBe('force-dynamic')
  })

  test('cache configuration aligns with cron job interval', async () => {
    const pageModule = await import('../../app/page.tsx')
    
    // Our cron job runs every 30 minutes, so revalidate should match
    // This ensures fresh data is available when cache expires
    expect(pageModule.revalidate).toBe(1800) // 30 minutes
  })
})