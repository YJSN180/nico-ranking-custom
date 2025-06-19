/**
 * Test to ensure no window references are used in server-side code
 */
import { describe, it, expect, vi } from 'vitest'

describe('Window reference safety', () => {
  it('should not use window in request-throttle when imported on server', async () => {
    // This test verifies the fix for window reference error
    const module = await import('../../lib/request-throttle')
    
    // Should not throw error when importing
    expect(module).toBeDefined()
    expect(module.requestThrottle).toBeDefined()
  })
  
  it('should handle URL parsing without window', async () => {
    // Mock environment without window
    const originalWindow = global.window
    // @ts-ignore
    delete global.window
    
    try {
      // Import fresh module without window
      vi.resetModules()
      const { requestThrottle } = await import('../../lib/request-throttle')
      
      // Should not throw when throttling
      await expect(requestThrottle.throttle('/api/test')).resolves.toBeUndefined()
      
    } finally {
      // Restore window
      global.window = originalWindow
      vi.resetModules()
    }
  })
})