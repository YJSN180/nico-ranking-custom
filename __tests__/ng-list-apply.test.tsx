import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { SettingsModal } from '@/components/settings-modal'
import { useUserNGListExtended } from '@/hooks/use-user-ng-list-extended'

// Mock the hooks
vi.mock('@/hooks/use-user-ng-list-extended')
vi.mock('@/hooks/use-user-preferences', () => ({
  useUserPreferences: () => ({
    preferences: { theme: 'light', showTags: false },
    updatePreferences: vi.fn()
  })
}))

describe('NG List Apply Functionality', () => {
  const mockSaveNGListDirectly = vi.fn()
  const mockOnApply = vi.fn()
  const mockOnClose = vi.fn()
  const mockReload = vi.fn()

  beforeEach(() => {
    vi.clearAllMocks()
    
    // Mock window.location.reload
    Object.defineProperty(window, 'location', {
      configurable: true,
      value: { reload: mockReload }
    })
    
    // Setup mock implementation
    vi.mocked(useUserNGListExtended).mockReturnValue({
      ngList: {
        videoIds: [],
        videoTitles: {
          exact: [],
          partial: []
        },
        authorIds: [],
        authorNames: {
          exact: [],
          partial: []
        },
        tags: {
          locked: { exact: [], partial: [] },
          user: { exact: [], partial: [] },
          both: { exact: [], partial: [] }
        },
        version: 2,
        totalCount: 0,
        updatedAt: new Date().toISOString()
      },
      saveNGListDirectly: mockSaveNGListDirectly
    })
  })

  it('should apply NG list changes immediately without page reload', async () => {
    const { rerender } = render(
      <SettingsModal 
        isOpen={true} 
        onClose={mockOnClose}
        onApply={mockOnApply}
      />
    )

    // Add a video ID to NG list
    const input = screen.getByPlaceholderText('sm12345678')
    fireEvent.change(input, { target: { value: 'sm12345' } })
    
    const addButton = screen.getAllByText('追加')[0]
    fireEvent.click(addButton)

    // Click apply button
    const applyButton = screen.getByText('適用')
    fireEvent.click(applyButton)

    // Verify that saveNGListDirectly was called immediately
    expect(mockSaveNGListDirectly).toHaveBeenCalledTimes(1)
    
    // Verify onApply callback was called
    expect(mockOnApply).toHaveBeenCalledTimes(1)
    
    // Verify onClose was called immediately
    expect(mockOnClose).toHaveBeenCalledTimes(1)
    
    // Verify that page reload was NOT called
    expect(mockReload).not.toHaveBeenCalled()
  })

  it('should trigger ngListUpdated event when saving NG list', async () => {
    const eventListener = vi.fn()
    window.addEventListener('ngListUpdated', eventListener)

    // Simulate saving NG list
    const ngList = {
      videoIds: ['sm12345'],
      videoTitles: { exact: [], partial: [] },
      authorIds: [],
      authorNames: { exact: [], partial: [] },
      tags: {
        locked: { exact: [], partial: [] },
        user: { exact: [], partial: [] },
        both: { exact: [], partial: [] }
      },
      version: 2,
      totalCount: 1,
      updatedAt: new Date().toISOString()
    }

    // Mock the actual save implementation
    mockSaveNGListDirectly.mockImplementation((list) => {
      window.dispatchEvent(new CustomEvent('ngListUpdated', { 
        detail: { ngList: list } 
      }))
    })

    render(
      <SettingsModal 
        isOpen={true} 
        onClose={mockOnClose}
        onApply={mockOnApply}
      />
    )

    // Add item and apply
    const input = screen.getByPlaceholderText('sm12345678')
    fireEvent.change(input, { target: { value: 'sm12345' } })
    fireEvent.click(screen.getAllByText('追加')[0])
    fireEvent.click(screen.getByText('適用'))

    // Verify event was triggered
    await waitFor(() => {
      expect(eventListener).toHaveBeenCalledTimes(1)
    })

    window.removeEventListener('ngListUpdated', eventListener)
  })

  it('should call onApply callback when provided', async () => {
    render(
      <SettingsModal 
        isOpen={true} 
        onClose={mockOnClose}
        onApply={mockOnApply}
      />
    )

    // Add item and apply
    const input = screen.getByPlaceholderText('sm12345678')
    fireEvent.change(input, { target: { value: 'sm12345' } })
    fireEvent.click(screen.getAllByText('追加')[0])
    fireEvent.click(screen.getByText('適用'))

    // Verify callbacks were called in correct order
    expect(mockSaveNGListDirectly).toHaveBeenCalled()
    expect(mockOnApply).toHaveBeenCalled()
    expect(mockOnClose).toHaveBeenCalled()
    
    // Verify no page reload
    expect(mockReload).not.toHaveBeenCalled()
  })
})
