import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { SettingsModal } from '@/components/settings-modal'
import { useUserNGList } from '@/hooks/use-user-ng-list'

// Mock the hooks
vi.mock('@/hooks/use-user-ng-list')
vi.mock('@/hooks/use-user-preferences', () => ({
  useUserPreferences: () => ({
    preferences: { theme: 'light' },
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
    vi.mocked(useUserNGList).mockReturnValue({
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
      saveNGListDirectly: mockSaveNGListDirectly
    })
  })

  it('should apply NG list changes immediately without loading state', async () => {
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
    
    // Verify onClose was called immediately
    expect(mockOnClose).toHaveBeenCalledTimes(1)
    
    // Wait for the timeout to complete and verify reload was called
    await waitFor(() => {
      expect(mockReload).toHaveBeenCalledTimes(1)
    }, { timeout: 200 })
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
      version: 1,
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

  it('should not trigger ngListApplied event anymore', async () => {
    const ngListAppliedListener = vi.fn()
    window.addEventListener('ngListApplied', ngListAppliedListener)

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

    // Wait to ensure the modal closes and reload is called
    await waitFor(() => {
      expect(mockOnClose).toHaveBeenCalled()
      expect(mockReload).toHaveBeenCalled()
    })

    // Verify ngListApplied was NOT triggered
    expect(ngListAppliedListener).not.toHaveBeenCalled()

    window.removeEventListener('ngListApplied', ngListAppliedListener)
  })
})