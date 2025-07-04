import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { act, waitFor } from '@testing-library/react'
import { renderHook } from '@/__tests__/test-utils'
import { useUserNGList } from '@/hooks/use-user-ng-list'

describe('NG List Event Flow', () => {
  beforeEach(() => {
    // Clear localStorage
    localStorage.clear()
    // Clear all event listeners
    vi.clearAllMocks()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('should dispatch ngListUpdated event when saveNGListDirectly is called', async () => {
    const { result } = renderHook(() => useUserNGList())
    const eventListener = vi.fn()
    
    window.addEventListener('ngListUpdated', eventListener)
    
    // Save NG list
    act(() => {
      result.current.saveNGListDirectly({
        videoIds: ['sm123'],
        videoTitles: { exact: [], partial: [] },
        authorIds: [],
        authorNames: { exact: [], partial: [] },
        version: 1,
        totalCount: 1,
        updatedAt: new Date().toISOString()
      })
    })
    
    // Wait for event to be dispatched
    await waitFor(() => {
      expect(eventListener).toHaveBeenCalledOnce()
    })
    
    // Check event detail
    const event = eventListener.mock.calls[0][0] as CustomEvent
    expect(event.detail.ngList.videoIds).toContain('sm123')
    expect(event.detail.ngList.totalCount).toBe(1)
    
    window.removeEventListener('ngListUpdated', eventListener)
  })

  it('should update ngList when ngListUpdated event is received', async () => {
    const { result } = renderHook(() => useUserNGList())
    
    // Initial state
    expect(result.current.ngList.videoIds).toHaveLength(0)
    
    // Dispatch custom event
    act(() => {
      window.dispatchEvent(new CustomEvent('ngListUpdated', {
        detail: {
          ngList: {
            videoIds: ['sm456'],
            videoTitles: { exact: [], partial: [] },
            authorIds: [],
            authorNames: { exact: [], partial: [] },
            version: 1,
            totalCount: 1,
            updatedAt: new Date().toISOString()
          }
        }
      }))
    })
    
    // Check if ngList is updated
    await waitFor(() => {
      expect(result.current.ngList.videoIds).toContain('sm456')
    })
  })

  it('should update ngList when localStorage changes from another tab', async () => {
    const { result } = renderHook(() => useUserNGList())
    
    // Initial state
    expect(result.current.ngList.videoIds).toHaveLength(0)
    
    // Simulate storage change from another tab
    const newNGList = {
      videoIds: ['sm789'],
      videoTitles: { exact: [], partial: [] },
      authorIds: [],
      authorNames: { exact: [], partial: [] },
      version: 1,
      totalCount: 1,
      updatedAt: new Date().toISOString()
    }
    
    act(() => {
      // Manually set localStorage
      localStorage.setItem('user-ng-list', JSON.stringify(newNGList))
      
      // Dispatch storage event
      window.dispatchEvent(new StorageEvent('storage', {
        key: 'user-ng-list',
        newValue: JSON.stringify(newNGList),
        oldValue: null,
        storageArea: localStorage,
        url: window.location.href
      }))
    })
    
    // Check if ngList is updated
    await waitFor(() => {
      expect(result.current.ngList.videoIds).toContain('sm789')
    })
  })

  it('should update NG list state immediately when saved', async () => {
    const { result } = renderHook(() => useUserNGList())
    
    // Initial state - empty NG list
    expect(result.current.ngList.videoIds).toHaveLength(0)
    expect(result.current.ngList.totalCount).toBe(0)
    
    // Update NG list
    act(() => {
      result.current.saveNGListDirectly({
        videoIds: ['sm222'],
        videoTitles: { exact: [], partial: [] },
        authorIds: ['user3'],
        authorNames: { exact: [], partial: [] },
        version: 1,
        totalCount: 2,
        updatedAt: new Date().toISOString()
      })
    })
    
    // Check if NG list is updated immediately
    await waitFor(() => {
      expect(result.current.ngList.videoIds).toContain('sm222')
      expect(result.current.ngList.authorIds).toContain('user3')
      expect(result.current.ngList.totalCount).toBe(2)
    })
  })
})