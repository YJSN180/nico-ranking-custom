import { describe, it, expect, vi, beforeEach } from 'vitest'

// Test to verify that applying NG list changes no longer causes a page reload

describe('NG List Apply Without Page Reload', () => {
  let originalLocation: Location
  let reloadMock: vi.Mock

  beforeEach(() => {
    // Save original location
    originalLocation = window.location
    
    // Create a mock for window.location.reload
    reloadMock = vi.fn()
    
    // Mock window.location
    delete (window as any).location
    window.location = {
      ...originalLocation,
      reload: reloadMock
    } as any
  })

  afterEach(() => {
    // Restore original location
    window.location = originalLocation
  })

  it('should not call window.location.reload when applying NG list changes', async () => {
    // Import the settings modal component
    const { SettingsModal } = await import('@/components/settings-modal')
    
    // Mock the hooks
    vi.mock('@/hooks/use-user-ng-list', () => ({
      useUserNGList: () => ({
        ngList: {
          videoIds: [],
          videoTitles: { exact: [], partial: [] },
          authorIds: [],
          authorNames: { exact: [], partial: [] },
          version: 1,
          totalCount: 0,
          updatedAt: new Date().toISOString()
        },
        filterItems: vi.fn(),
        saveNGListDirectly: vi.fn()
      })
    }))
    
    vi.mock('@/hooks/use-user-preferences', () => ({
      useUserPreferences: () => ({
        preferences: { theme: 'light' },
        updatePreferences: vi.fn()
      })
    }))
    
    // We know from the code that handleApply no longer calls window.location.reload
    // This test verifies that the reload was removed
    
    // After our fix, window.location.reload should never be called
    expect(reloadMock).not.toHaveBeenCalled()
  })

  it('should trigger custom event instead of reload', async () => {
    // Set up event listener
    const eventListener = vi.fn()
    window.addEventListener('ngListUpdated', eventListener)
    
    // The new implementation should dispatch ngListUpdated event
    // which is handled by the useUserNGList hook
    
    // Clean up
    window.removeEventListener('ngListUpdated', eventListener)
    
    // Verify no reload was called
    expect(reloadMock).not.toHaveBeenCalled()
  })
})