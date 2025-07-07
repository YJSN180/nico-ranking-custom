/**
 * デバッグ用テスト：GenreOrderCustomizerDnDの問題を再現・修正検証
 */
import React, { createRef } from 'react'
import { render, screen, fireEvent, act } from '@testing-library/react'
import { GenreOrderCustomizerDnD, type GenreOrderCustomizerDnDRef } from '@/components/genre-order-customizer-dnd'
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

// Mock hooks
const mockUpdateOrder = vi.fn()
const mockToggleGenreVisibility = vi.fn()  
const mockResetToDefault = vi.fn()

vi.mock('@/hooks/use-genre-order', () => ({
  useGenreOrder: () => ({
    order: ['all', 'game', 'anime', 'vocaloid', 'other'] as RankingGenre[],
    hidden: new Set<RankingGenre>(),
    updateOrder: mockUpdateOrder,
    toggleGenreVisibility: mockToggleGenreVisibility,
    resetToDefault: mockResetToDefault
  })
}))

// Mock GENRE_LABELS
vi.mock('@/types/ranking-config', () => ({
  GENRE_LABELS: {
    all: '全て',
    game: 'ゲーム', 
    anime: 'アニメ',
    vocaloid: 'ボーカロイド',
    other: 'その他'
  }
}))

describe('GenreOrderCustomizerDnD - Bug Investigation', () => {
  let onChangesUpdate: ReturnType<typeof vi.fn>
  let componentRef: React.RefObject<GenreOrderCustomizerDnDRef>

  beforeEach(() => {
    localStorageMock.clear()
    vi.clearAllMocks()
    onChangesUpdate = vi.fn()
    componentRef = createRef<GenreOrderCustomizerDnDRef>()
  })

  describe('🚨 Critical Bug Case: Default Reset → Manual Change → Apply', () => {
    it('should preserve manual changes after default reset', async () => {
      const { container } = render(
        <GenreOrderCustomizerDnD 
          ref={componentRef}
          onChangesUpdate={onChangesUpdate} 
        />
      )

      // Step 1: Click "Default Reset" button
      const resetButton = screen.getByText('デフォルトに戻す')
      act(() => {
        fireEvent.click(resetButton)
      })

      // Verify: onChangesUpdate called with true (changes detected)
      expect(onChangesUpdate).toHaveBeenCalledWith(true)

      // Step 2: Perform manual change (toggle visibility)
      const visibilityButtons = container.querySelectorAll('button[title*="非表示にする"]')
      expect(visibilityButtons.length).toBeGreaterThan(0)
      
      act(() => {
        fireEvent.click(visibilityButtons[0])
      })

      // Step 3: Apply changes through ref (simulating settings-modal behavior)
      act(() => {
        componentRef.current?.applyChanges()
      })

      // 🔍 CRITICAL CHECK: What functions were called?
      console.log('Mock calls after apply:')
      console.log('mockResetToDefault calls:', mockResetToDefault.mock.calls.length)
      console.log('mockUpdateOrder calls:', mockUpdateOrder.mock.calls.length)
      console.log('mockToggleGenreVisibility calls:', mockToggleGenreVisibility.mock.calls.length)

      // ❌ BUG EXPECTATION: Currently calls resetToDefault instead of preserving manual changes
      // ✅ CORRECT EXPECTATION: Should call updateOrder + toggleGenreVisibility
      if (mockResetToDefault.mock.calls.length > 0) {
        console.error('🚨 BUG CONFIRMED: resetToDefault was called instead of preserving manual changes')
      }

      // Expected behavior: Manual changes should be preserved
      expect(mockResetToDefault).not.toHaveBeenCalled()
      expect(mockUpdateOrder).toHaveBeenCalled()
    })

    it('should handle drag and drop after default reset', async () => {
      render(
        <GenreOrderCustomizerDnD 
          ref={componentRef}
          onChangesUpdate={onChangesUpdate} 
        />
      )

      // Step 1: Default reset
      const resetButton = screen.getByText('デフォルトに戻す')
      act(() => {
        fireEvent.click(resetButton)
      })

      // Step 2: Simulate drag and drop (we'll need to mock the drag events)
      // This is a simplified test - in real scenario we'd simulate actual drag/drop
      const genreItems = screen.getAllByText(/全て|ゲーム|アニメ/)
      expect(genreItems.length).toBeGreaterThan(1)

      // Step 3: Apply changes
      act(() => {
        componentRef.current?.applyChanges()
      })

      // Same verification as above
      console.log('Drag/Drop test - Mock calls after apply:')
      console.log('mockResetToDefault calls:', mockResetToDefault.mock.calls.length)
      console.log('mockUpdateOrder calls:', mockUpdateOrder.mock.calls.length)

      // Should preserve manual changes, not reset to default
      expect(mockResetToDefault).not.toHaveBeenCalled()
    })
  })

  describe('✅ Expected Working Cases', () => {
    it('should work correctly for manual changes only', async () => {
      const { container } = render(
        <GenreOrderCustomizerDnD 
          ref={componentRef}
          onChangesUpdate={onChangesUpdate} 
        />
      )

      // Manual change only (no default reset)
      const visibilityButtons = container.querySelectorAll('button[title*="非表示にする"]')
      act(() => {
        fireEvent.click(visibilityButtons[0])
      })

      // Apply
      act(() => {
        componentRef.current?.applyChanges()
      })

      // Should call updateOrder, not resetToDefault
      expect(mockResetToDefault).not.toHaveBeenCalled()
      expect(mockUpdateOrder).toHaveBeenCalled()
    })

    it('should work correctly for default reset only', async () => {
      render(
        <GenreOrderCustomizerDnD 
          ref={componentRef}
          onChangesUpdate={onChangesUpdate} 
        />
      )

      // Default reset only (no manual changes)
      const resetButton = screen.getByText('デフォルトに戻す')
      act(() => {
        fireEvent.click(resetButton)
      })

      // Apply immediately
      act(() => {
        componentRef.current?.applyChanges()
      })

      // Should call resetToDefault
      expect(mockResetToDefault).toHaveBeenCalled()
      expect(mockUpdateOrder).not.toHaveBeenCalled()
    })
  })
})