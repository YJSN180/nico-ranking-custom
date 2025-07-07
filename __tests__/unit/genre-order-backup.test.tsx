import React from 'react'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { GenreOrderBackup } from '@/components/genre-order-backup'
import { vi } from 'vitest'

// Mock useGenreOrderV2
vi.mock('@/hooks/use-genre-order-v2', () => ({
  useGenreOrderV2: () => ({
    items: [
      { id: 'all', isVisible: true, order: 0 },
      { id: 'game', isVisible: true, order: 1 },
      { id: 'anime', isVisible: false, order: 2 },
    ]
  })
}))

describe('GenreOrderBackup', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('renders export and import buttons', () => {
    render(<GenreOrderBackup />)
    
    expect(screen.getByText('📥 エクスポート')).toBeInTheDocument()
    expect(screen.getByText('📤 インポート')).toBeInTheDocument()
  })

  it('renders usage instructions', () => {
    render(<GenreOrderBackup />)
    
    expect(screen.getByText('📌 使い方:')).toBeInTheDocument()
    expect(screen.getByText(/エクスポート: 現在のジャンル並び替え設定をファイルに保存します/)).toBeInTheDocument()
    expect(screen.getByText(/インポート: 保存したファイルから設定を復元します/)).toBeInTheDocument()
  })

  it('shows success message when valid file is imported', async () => {
    vi.spyOn(window, 'alert').mockImplementation(() => {})
    const reloadSpy = vi.fn()
    Object.defineProperty(window, 'location', {
      value: { reload: reloadSpy },
      writable: true
    })
    
    // Mock localStorage
    const setItemSpy = vi.fn()
    Object.defineProperty(window, 'localStorage', {
      value: {
        setItem: setItemSpy,
        getItem: vi.fn(),
        removeItem: vi.fn(),
        clear: vi.fn()
      },
      writable: true
    })
    
    render(<GenreOrderBackup />)
    
    const validData = {
      version: 1,
      exportDate: new Date().toISOString(),
      genreOrder: [
        { id: 'game', isVisible: true, order: 0 },
        { id: 'all', isVisible: false, order: 1 },
      ]
    }
    
    const file = new File([JSON.stringify(validData)], 'backup.json', { type: 'application/json' })
    const input = screen.getByLabelText('📤 インポート').parentElement?.querySelector('input[type="file"]') as HTMLInputElement
    
    fireEvent.change(input, { target: { files: [file] } })
    
    await waitFor(() => {
      expect(screen.getByText(/ジャンル並び替えデータをインポートしました/)).toBeInTheDocument()
    })
    
    expect(setItemSpy).toHaveBeenCalledWith('nicoRankingGenreOrder', JSON.stringify(validData.genreOrder))
    
    // Wait for reload timeout
    await waitFor(() => {
      expect(reloadSpy).toHaveBeenCalled()
    }, { timeout: 3500 })
  })

  it('shows error message for invalid file format', async () => {
    render(<GenreOrderBackup />)
    
    const invalidData = { invalid: 'data' }
    const file = new File([JSON.stringify(invalidData)], 'invalid.json', { type: 'application/json' })
    const input = screen.getByLabelText('📤 インポート').parentElement?.querySelector('input[type="file"]') as HTMLInputElement
    
    fireEvent.change(input, { target: { files: [file] } })
    
    await waitFor(() => {
      expect(screen.getByText('無効なバックアップファイル形式です')).toBeInTheDocument()
    })
  })
})