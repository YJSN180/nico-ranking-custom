import React from 'react'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { SettingsModal } from '@/components/settings-modal'
import { vi } from 'vitest'

// Mock hooks
vi.mock('@/hooks/use-user-ng-list', () => ({
  useUserNGList: () => ({
    ngList: {
      videoIds: [],
      videoTitles: { exact: [], partial: [] },
      authorIds: [],
      authorNames: { exact: [], partial: [] },
      totalCount: 0
    },
    saveNGListDirectly: vi.fn()
  })
}))

vi.mock('@/hooks/use-user-preferences', () => ({
  useUserPreferences: () => ({
    preferences: { theme: 'light' },
    updatePreferences: vi.fn()
  })
}))

// Mock window.location.reload
const reloadMock = vi.fn()
Object.defineProperty(window, 'location', {
  value: { reload: reloadMock },
  writable: true
})

describe('Genre Order Integration', () => {
  beforeEach(() => {
    reloadMock.mockClear()
  })

  it('shows genre order tab in settings modal', () => {
    render(<SettingsModal isOpen={true} onClose={() => {}} />)
    
    const genreOrderTab = screen.getByText('🎯 ジャンル並び替え')
    expect(genreOrderTab).toBeInTheDocument()
  })

  it('displays genre order customizer when tab is clicked', () => {
    render(<SettingsModal isOpen={true} onClose={() => {}} />)
    
    const genreOrderTab = screen.getByText('🎯 ジャンル並び替え')
    fireEvent.click(genreOrderTab)
    
    // Check for customizer content
    expect(screen.getByText(/ドラッグ&ドロップでジャンルの順序を変更/)).toBeInTheDocument()
    expect(screen.getByText('デフォルトに戻す')).toBeInTheDocument()
  })

  it('shows apply button when changes are made', async () => {
    render(<SettingsModal isOpen={true} onClose={() => {}} />)
    
    // Navigate to genre order tab
    const genreOrderTab = screen.getByText('🎯 ジャンル並び替え')
    fireEvent.click(genreOrderTab)
    
    // Initially no apply button
    expect(screen.queryByText('適用')).not.toBeInTheDocument()
    
    // Click default reset button
    const resetButton = screen.getByText('デフォルトに戻す')
    fireEvent.click(resetButton)
    
    // Apply button should appear
    await waitFor(() => {
      expect(screen.getByText('適用')).toBeInTheDocument()
    })
  })

  it('applies changes and reloads when apply is clicked', async () => {
    render(<SettingsModal isOpen={true} onClose={() => {}} />)
    
    // Navigate to genre order tab
    const genreOrderTab = screen.getByText('🎯 ジャンル並び替え')
    fireEvent.click(genreOrderTab)
    
    // Make a change
    const resetButton = screen.getByText('デフォルトに戻す')
    fireEvent.click(resetButton)
    
    // Click apply
    await waitFor(() => {
      const applyButton = screen.getByText('適用')
      fireEvent.click(applyButton)
    })
    
    // Should reload
    expect(reloadMock).toHaveBeenCalled()
  })

  it('confirms before closing with unsaved changes', async () => {
    const confirmMock = vi.spyOn(window, 'confirm').mockReturnValue(false)
    const onClose = vi.fn()
    
    render(<SettingsModal isOpen={true} onClose={onClose} />)
    
    // Navigate to genre order tab
    const genreOrderTab = screen.getByText('🎯 ジャンル並び替え')
    fireEvent.click(genreOrderTab)
    
    // Make a change
    const resetButton = screen.getByText('デフォルトに戻す')
    fireEvent.click(resetButton)
    
    // Try to close
    const closeButton = screen.getByText('閉じる')
    fireEvent.click(closeButton)
    
    // Should confirm
    expect(confirmMock).toHaveBeenCalledWith('変更を破棄してもよろしいですか？')
    expect(onClose).not.toHaveBeenCalled()
    
    confirmMock.mockRestore()
  })
})