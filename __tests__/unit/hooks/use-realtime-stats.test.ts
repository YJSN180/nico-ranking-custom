import { renderHook, act, waitFor } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { useRealtimeStats } from '@/hooks/use-realtime-stats'
import type { RankingItem } from '@/types/ranking'

// Mock request throttle
vi.mock('@/lib/request-throttle', () => ({
  requestThrottle: {
    throttle: vi.fn().mockResolvedValue(undefined)
  }
}))

// Mock fetch with immediate resolution
const mockFetch = vi.fn()
global.fetch = mockFetch

// Mock document.visibilityState
let mockVisibilityState: 'visible' | 'hidden' = 'visible'
Object.defineProperty(document, 'visibilityState', {
  get: () => mockVisibilityState,
  configurable: true
})

// Mock addEventListener/removeEventListener
const visibilityChangeListeners: Array<() => void> = []
document.addEventListener = vi.fn((event, listener) => {
  if (event === 'visibilitychange') {
    visibilityChangeListeners.push(listener as () => void)
  }
})
document.removeEventListener = vi.fn((event, listener) => {
  if (event === 'visibilitychange') {
    const index = visibilityChangeListeners.indexOf(listener as () => void)
    if (index > -1) {
      visibilityChangeListeners.splice(index, 1)
    }
  }
})

describe('useRealtimeStats', () => {
  const mockItems: RankingItem[] = [
    {
      rank: 1,
      id: 'sm12345',
      title: 'Test Video 1',
      thumbURL: 'https://example.com/thumb1.jpg',
      views: 1000,
      comments: 50,
      mylists: 10,
      likes: 100
    },
    {
      rank: 2,
      id: 'sm67890',
      title: 'Test Video 2',
      thumbURL: 'https://example.com/thumb2.jpg',
      views: 2000,
      comments: 100,
      mylists: 20,
      likes: 200
    }
  ]

  beforeEach(() => {
    vi.clearAllMocks()
    vi.useFakeTimers()
    mockVisibilityState = 'visible'
    visibilityChangeListeners.length = 0
    
    // Mock successful fetch response with immediate resolution
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({
        stats: {
          'sm12345': {
            viewCounter: 1500,
            commentCounter: 75,
            mylistCounter: 15,
            likeCounter: 150
          },
          'sm67890': {
            viewCounter: 2500,
            commentCounter: 125,
            mylistCounter: 25,
            likeCounter: 250
          }
        },
        timestamp: new Date().toISOString(),
        count: 2
      })
    } as Response)
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('should not fetch stats when disabled', () => {
    renderHook(() => useRealtimeStats(mockItems, false))
    
    // Advance timers to trigger any potential calls
    act(() => {
      vi.advanceTimersByTime(5000)
    })
    
    expect(mockFetch).not.toHaveBeenCalled()
  })

  it('should fetch stats immediately when enabled and visible', async () => {
    const { result } = renderHook(() => useRealtimeStats(mockItems, true))
    
    // Wait for the initial fetch to be called
    await act(async () => {
      await Promise.resolve() // Allow microtasks to complete
    })
    
    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining('/api/edge/video-stats?ids=sm12345,sm67890'),
      expect.objectContaining({
        signal: expect.any(AbortSignal)
      })
    )
    
    expect(result.current.isLoading).toBe(false)
  })

  it('should update stats every 2 minutes by default', async () => {
    renderHook(() => useRealtimeStats(mockItems, true))
    
    // Wait for initial call
    await act(async () => {
      await Promise.resolve()
    })
    expect(mockFetch).toHaveBeenCalledTimes(1)
    
    // Advance 2 minutes
    act(() => {
      vi.advanceTimersByTime(120000)
    })
    
    await act(async () => {
      await Promise.resolve()
    })
    expect(mockFetch).toHaveBeenCalledTimes(2)
    
    // Advance another 2 minutes
    act(() => {
      vi.advanceTimersByTime(120000)
    })
    
    await act(async () => {
      await Promise.resolve()
    })
    expect(mockFetch).toHaveBeenCalledTimes(3)
  })

  it('should stop updates when tab becomes hidden', async () => {
    renderHook(() => useRealtimeStats(mockItems, true))
    
    // Wait for initial call
    await act(async () => {
      await Promise.resolve()
    })
    expect(mockFetch).toHaveBeenCalledTimes(1)
    
    // Simulate tab becoming hidden
    act(() => {
      mockVisibilityState = 'hidden'
      visibilityChangeListeners.forEach(listener => listener())
    })
    
    // Advance 2 minutes
    act(() => {
      vi.advanceTimersByTime(120000)
    })
    
    // Should not have made additional fetches
    expect(mockFetch).toHaveBeenCalledTimes(1)
  })

  it('should resume updates when tab becomes visible again', async () => {
    renderHook(() => useRealtimeStats(mockItems, true))
    
    // Wait for initial call
    await act(async () => {
      await Promise.resolve()
    })
    expect(mockFetch).toHaveBeenCalledTimes(1)
    
    // Simulate tab becoming hidden
    act(() => {
      mockVisibilityState = 'hidden'
      visibilityChangeListeners.forEach(listener => listener())
    })
    
    // Advance 5 minutes while hidden
    act(() => {
      vi.advanceTimersByTime(300000)
    })
    
    // Should still be 1 fetch
    expect(mockFetch).toHaveBeenCalledTimes(1)
    
    // Simulate tab becoming visible
    act(() => {
      mockVisibilityState = 'visible'
      visibilityChangeListeners.forEach(listener => listener())
    })
    
    // Should immediately fetch when becoming visible
    await act(async () => {
      await Promise.resolve()
    })
    expect(mockFetch).toHaveBeenCalledTimes(2)
  })

  it('should merge realtime stats with original items', async () => {
    const { result } = renderHook(() => useRealtimeStats(mockItems, true))
    
    await act(async () => {
      await Promise.resolve()
    })
    
    // Check that stats are merged
    expect(result.current.items[0].views).toBe(1500) // Updated from 1000
    expect(result.current.items[0].comments).toBe(75) // Updated from 50
    expect(result.current.items[1].views).toBe(2500) // Updated from 2000
    expect(result.current.items[1].comments).toBe(125) // Updated from 100
  })

  it('should handle custom update interval', async () => {
    const customInterval = 60000 // 1 minute
    renderHook(() => useRealtimeStats(mockItems, true, customInterval))
    
    // Wait for initial call
    await act(async () => {
      await Promise.resolve()
    })
    expect(mockFetch).toHaveBeenCalledTimes(1)
    
    // Advance 1 minute
    act(() => {
      vi.advanceTimersByTime(60000)
    })
    
    await act(async () => {
      await Promise.resolve()
    })
    expect(mockFetch).toHaveBeenCalledTimes(2)
  })

  it('should not start updates if initially hidden', async () => {
    mockVisibilityState = 'hidden'
    
    renderHook(() => useRealtimeStats(mockItems, true))
    
    await act(async () => {
      await Promise.resolve()
    })
    
    // Should not fetch when hidden
    expect(mockFetch).not.toHaveBeenCalled()
    
    // Simulate becoming visible
    act(() => {
      mockVisibilityState = 'visible'
      visibilityChangeListeners.forEach(listener => listener())
    })
    
    await act(async () => {
      await Promise.resolve()
    })
    
    // Should fetch after becoming visible
    expect(mockFetch).toHaveBeenCalledTimes(1)
  })

  it('should clean up properly on unmount', () => {
    const { unmount } = renderHook(() => useRealtimeStats(mockItems, true))
    
    expect(visibilityChangeListeners.length).toBe(1)
    
    unmount()
    
    // Event listener should be removed
    expect(document.removeEventListener).toHaveBeenCalledWith(
      'visibilitychange',
      expect.any(Function)
    )
  })

  it('should handle fetch errors gracefully', async () => {
    mockFetch.mockRejectedValueOnce(new Error('Network error'))
    
    const { result } = renderHook(() => useRealtimeStats(mockItems, true))
    
    await act(async () => {
      await Promise.resolve()
    })
    
    // Should return original items on error
    expect(result.current.items).toEqual(mockItems)
  })
})