import { renderHook, act } from '@testing-library/react'
import { useGenreOrderV2 } from '@/hooks/use-genre-order-v2'
import { vi } from 'vitest'
import type { RankingGenre } from '@/types/ranking-config'

// Mock localStorage
const localStorageMock = (() => {
  let store: Record<string, string> = {}
  return {
    getItem: (key: string) => store[key] || null,
    setItem: (key: string, value: string) => {
      store[key] = value
    },
    removeItem: (key: string) => {
      delete store[key]
    },
    clear: () => {
      store = {}
    }
  }
})()

Object.defineProperty(window, 'localStorage', {
  value: localStorageMock
})

// Mock window.location.reload
const reloadMock = vi.fn()
Object.defineProperty(window, 'location', {
  value: { reload: reloadMock },
  writable: true
})

describe('useGenreOrderV2', () => {
  beforeEach(() => {
    localStorageMock.clear()
    reloadMock.mockClear()
  })

  it('returns default state when no saved data exists', () => {
    const { result } = renderHook(() => useGenreOrderV2())
    
    expect(result.current.items).toHaveLength(23) // All genres
    expect(result.current.items[0]).toEqual({
      id: 'all',
      isVisible: true,
      order: 0
    })
    expect(result.current.visibleGenres).toHaveLength(23)
    expect(result.current.hiddenGenres).toHaveLength(0)
    expect(result.current.hasChanges).toBe(false)
  })

  it('loads saved state from localStorage', () => {
    const savedData = [
      { id: 'game' as RankingGenre, isVisible: true, order: 0 },
      { id: 'all' as RankingGenre, isVisible: false, order: 1 },
    ]
    localStorageMock.setItem('nicoRankingGenreOrder', JSON.stringify(savedData))
    
    const { result } = renderHook(() => useGenreOrderV2())
    
    expect(result.current.items).toEqual(savedData)
    expect(result.current.visibleGenres).toEqual(['game'])
    expect(result.current.hiddenGenres).toEqual(['all'])
  })

  it('moves items correctly with insert behavior', () => {
    const { result } = renderHook(() => useGenreOrderV2())
    
    // Initial order: [all, game, anime, ...]
    const initialOrder = result.current.items.map(item => item.id)
    expect(initialOrder[0]).toBe('all')
    expect(initialOrder[1]).toBe('game')
    expect(initialOrder[2]).toBe('anime')
    
    // Move 'anime' (index 2) to position of 'all' (index 0)
    act(() => {
      result.current.moveItem('anime', 'all')
    })
    
    // New order should be: [anime, all, game, ...]
    expect(result.current.items[0].id).toBe('anime')
    expect(result.current.items[1].id).toBe('all')
    expect(result.current.items[2].id).toBe('game')
    expect(result.current.hasChanges).toBe(true)
  })

  it('toggles visibility correctly', () => {
    const { result } = renderHook(() => useGenreOrderV2())
    
    const initialVisibleCount = result.current.visibleGenres.length
    
    act(() => {
      result.current.toggleVisibility('all')
    })
    
    expect(result.current.visibleGenres).not.toContain('all')
    expect(result.current.hiddenGenres).toContain('all')
    expect(result.current.visibleGenres.length).toBe(initialVisibleCount - 1)
    expect(result.current.hasChanges).toBe(true)
  })

  it('resets to default correctly', () => {
    // Set up saved state that's different from default
    const customSavedData = [
      { id: 'game' as RankingGenre, isVisible: true, order: 0 },
      { id: 'all' as RankingGenre, isVisible: false, order: 1 },
      { id: 'anime' as RankingGenre, isVisible: true, order: 2 },
    ]
    localStorageMock.setItem('nicoRankingGenreOrder', JSON.stringify(customSavedData))
    
    const { result } = renderHook(() => useGenreOrderV2())
    
    // Verify custom state is loaded
    expect(result.current.items[0].id).toBe('game')
    expect(result.current.hasChanges).toBe(false)
    
    // Reset to default
    act(() => {
      result.current.resetToDefault()
    })
    
    // Check default state is restored
    expect(result.current.items[0].id).toBe('all')
    expect(result.current.items[0].isVisible).toBe(true)
    expect(result.current.visibleGenres.length).toBe(23)
    expect(result.current.hasChanges).toBe(true) // Has changes because it's different from saved state
  })

  it('applies changes and saves to localStorage', () => {
    const { result } = renderHook(() => useGenreOrderV2())
    
    act(() => {
      result.current.moveItem('game', 'all')
    })
    
    expect(result.current.hasChanges).toBe(true)
    
    act(() => {
      result.current.applyChanges()
    })
    
    const saved = JSON.parse(localStorageMock.getItem('nicoRankingGenreOrder') || '[]')
    expect(saved[0].id).toBe('game')
    expect(saved[1].id).toBe('all')
    expect(saved[2].id).toBe('anime')
    expect(reloadMock).toHaveBeenCalled()
  })

  it('cancels changes correctly', () => {
    const { result } = renderHook(() => useGenreOrderV2())
    
    const initialOrder = result.current.items.map(item => item.id)
    
    act(() => {
      result.current.moveItem('game', 'all')
    })
    
    // Verify order changed
    expect(result.current.items[0].id).toBe('game')
    expect(result.current.items[1].id).toBe('all')
    expect(result.current.hasChanges).toBe(true)
    
    act(() => {
      result.current.cancelChanges()
    })
    
    // Verify order restored
    expect(result.current.items[0].id).toBe(initialOrder[0])
    expect(result.current.items[1].id).toBe(initialOrder[1])
    expect(result.current.items[2].id).toBe(initialOrder[2])
    expect(result.current.hasChanges).toBe(false)
  })

  it('handles complex insert movements correctly', () => {
    const { result } = renderHook(() => useGenreOrderV2())
    
    // Initial: [all, game, anime, vocaloid, voicesynthesis, ...]
    
    // Move 'vocaloid' (index 3) to 'game' (index 1)
    act(() => {
      result.current.moveItem('vocaloid', 'game')
    })
    
    // Expected: [all, vocaloid, game, anime, voicesynthesis, ...]
    expect(result.current.items[0].id).toBe('all')
    expect(result.current.items[1].id).toBe('vocaloid')
    expect(result.current.items[2].id).toBe('game')
    expect(result.current.items[3].id).toBe('anime')
    expect(result.current.items[4].id).toBe('voicesynthesis')
    
    // Move 'all' (index 0) to 'anime' (index 3)
    act(() => {
      result.current.moveItem('all', 'anime')
    })
    
    // Expected: [vocaloid, game, anime, all, voicesynthesis, ...]
    expect(result.current.items[0].id).toBe('vocaloid')
    expect(result.current.items[1].id).toBe('game')
    expect(result.current.items[2].id).toBe('anime')
    expect(result.current.items[3].id).toBe('all')
    expect(result.current.items[4].id).toBe('voicesynthesis')
  })

  it('hides all genres when hideAll is called', () => {
    const { result } = renderHook(() => useGenreOrderV2())
    
    // Initially all genres are visible
    expect(result.current.visibleGenres).toHaveLength(23)
    expect(result.current.hiddenGenres).toHaveLength(0)
    
    // Hide all genres
    act(() => {
      result.current.hideAll()
    })
    
    // Check all genres are hidden
    expect(result.current.visibleGenres).toHaveLength(0)
    expect(result.current.hiddenGenres).toHaveLength(23)
    expect(result.current.hasChanges).toBe(true)
    
    // Check all items have isVisible = false
    result.current.items.forEach(item => {
      expect(item.isVisible).toBe(false)
    })
  })
  
  it('can restore from hideAll state', () => {
    const { result } = renderHook(() => useGenreOrderV2())
    
    // Hide all genres
    act(() => {
      result.current.hideAll()
    })
    
    expect(result.current.visibleGenres).toHaveLength(0)
    
    // Reset to default
    act(() => {
      result.current.resetToDefault()
    })
    
    // Check all genres are visible again
    expect(result.current.visibleGenres).toHaveLength(23)
    expect(result.current.hiddenGenres).toHaveLength(0)
  })
  
  it('persists hideAll state after apply', () => {
    const { result } = renderHook(() => useGenreOrderV2())
    
    // Hide all genres
    act(() => {
      result.current.hideAll()
    })
    
    // Apply changes
    act(() => {
      result.current.applyChanges()
    })
    
    // Check localStorage was updated with all genres hidden
    const saved = JSON.parse(localStorageMock.getItem('nicoRankingGenreOrder') || '[]')
    expect(saved).toHaveLength(23)
    saved.forEach((item: any) => {
      expect(item.isVisible).toBe(false)
    })
  })

  it('shows all genres when showAll is called', () => {
    const { result } = renderHook(() => useGenreOrderV2())
    
    // First hide some genres
    act(() => {
      result.current.toggleVisibility('music')
      result.current.toggleVisibility('game')
      result.current.toggleVisibility('anime')
    })
    
    expect(result.current.visibleGenres).toHaveLength(20)
    expect(result.current.hiddenGenres).toHaveLength(3)
    expect(result.current.hasChanges).toBe(true)
    
    // Show all genres
    act(() => {
      result.current.showAll()
    })
    
    // Check all genres are visible
    expect(result.current.visibleGenres).toHaveLength(23)
    expect(result.current.hiddenGenres).toHaveLength(0)
    // hasChanges should be false now because we're back to default state
    expect(result.current.hasChanges).toBe(false)
    
    // Check all items have isVisible = true
    result.current.items.forEach(item => {
      expect(item.isVisible).toBe(true)
    })
  })

  it('can toggle between showAll and hideAll', () => {
    const { result } = renderHook(() => useGenreOrderV2())
    
    // Hide all
    act(() => {
      result.current.hideAll()
    })
    expect(result.current.visibleGenres).toHaveLength(0)
    
    // Show all
    act(() => {
      result.current.showAll()
    })
    expect(result.current.visibleGenres).toHaveLength(23)
    
    // Hide all again
    act(() => {
      result.current.hideAll()
    })
    expect(result.current.visibleGenres).toHaveLength(0)
  })
})