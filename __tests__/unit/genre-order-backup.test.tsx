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
    
    expect(screen.getByText('エクスポート')).toBeInTheDocument()
    expect(screen.getByText('インポート')).toBeInTheDocument()
  })

  it('renders export and import buttons with correct test ids', () => {
    render(<GenreOrderBackup />)
    
    expect(screen.getByTestId('export-genre-order-button')).toBeInTheDocument()
    expect(screen.getByTestId('import-genre-order-button')).toBeInTheDocument()
    expect(screen.getByTestId('import-file-input')).toBeInTheDocument()
  })

  it('shows import confirmation dialog when valid file is imported', async () => {
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
    const input = screen.getByTestId('import-file-input') as HTMLInputElement
    
    fireEvent.change(input, { target: { files: [file] } })
    
    // 確認ダイアログが表示されることを確認
    await waitFor(() => {
      expect(screen.getByTestId('import-confirm-dialog')).toBeInTheDocument()
      expect(screen.getByText('ジャンル並び替えデータをインポート')).toBeInTheDocument()
      expect(screen.getByText(/現在のジャンル並び替え設定は完全に上書きされます/)).toBeInTheDocument()
    })
  })

  it('imports data when confirm button is clicked in dialog', async () => {
    vi.spyOn(window, 'alert').mockImplementation(() => {})
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(true)
    const reloadSpy = vi.fn()
    
    // window.location.reloadのモック
    Object.defineProperty(window, 'location', {
      value: { reload: reloadSpy },
      writable: true,
      configurable: true
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
    const input = screen.getByTestId('import-file-input') as HTMLInputElement
    
    fireEvent.change(input, { target: { files: [file] } })
    
    // 確認ダイアログが表示されるのを待つ
    await waitFor(() => {
      expect(screen.getByTestId('import-confirm-dialog')).toBeInTheDocument()
    })
    
    // インポート実行ボタンをクリック
    const confirmButton = screen.getByText('インポート実行')
    fireEvent.click(confirmButton)
    
    await waitFor(() => {
      expect(screen.getByText(/ジャンル並び替えデータをインポートしました/)).toBeInTheDocument()
    })
    
    expect(setItemSpy).toHaveBeenCalledWith('nicoRankingGenreOrder', JSON.stringify(validData.genreOrder))
    
    // Wait for reload confirmation dialog
    await waitFor(() => {
      expect(confirmSpy).toHaveBeenCalledWith('インポートが完了しました。ページをリロードして変更を反映しますか？')
    }, { timeout: 2000 })
    
    // Check reload was called
    expect(reloadSpy).toHaveBeenCalled()
  })

  it('cancels import when cancel button is clicked in dialog', async () => {
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
    const input = screen.getByTestId('import-file-input') as HTMLInputElement
    
    fireEvent.change(input, { target: { files: [file] } })
    
    // 確認ダイアログが表示されるのを待つ
    await waitFor(() => {
      expect(screen.getByTestId('import-confirm-dialog')).toBeInTheDocument()
    })
    
    // キャンセルボタンをクリック
    const cancelButton = screen.getByText('キャンセル')
    fireEvent.click(cancelButton)
    
    // ダイアログが閉じることを確認
    await waitFor(() => {
      expect(screen.queryByTestId('import-confirm-dialog')).not.toBeInTheDocument()
    })
    
    // LocalStorageに保存されていないことを確認
    expect(setItemSpy).not.toHaveBeenCalled()
  })

  it('shows error message for invalid file format', async () => {
    render(<GenreOrderBackup />)
    
    const invalidData = { invalid: 'data' }
    const file = new File([JSON.stringify(invalidData)], 'invalid.json', { type: 'application/json' })
    const input = screen.getByTestId('import-file-input') as HTMLInputElement
    
    fireEvent.change(input, { target: { files: [file] } })
    
    await waitFor(() => {
      expect(screen.getByText('無効なバックアップファイル形式です')).toBeInTheDocument()
    })
  })

  it('does not reload when user cancels reload confirmation', async () => {
    vi.spyOn(window, 'alert').mockImplementation(() => {})
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(false)
    const reloadSpy = vi.fn()
    
    // window.location.reloadのモック
    Object.defineProperty(window, 'location', {
      value: { reload: reloadSpy },
      writable: true,
      configurable: true
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
    const input = screen.getByTestId('import-file-input') as HTMLInputElement
    
    fireEvent.change(input, { target: { files: [file] } })
    
    // 確認ダイアログが表示されるのを待つ
    await waitFor(() => {
      expect(screen.getByTestId('import-confirm-dialog')).toBeInTheDocument()
    })
    
    // インポート実行ボタンをクリック
    const confirmButton = screen.getByText('インポート実行')
    fireEvent.click(confirmButton)
    
    await waitFor(() => {
      expect(screen.getByText(/ジャンル並び替えデータをインポートしました/)).toBeInTheDocument()
    })
    
    expect(setItemSpy).toHaveBeenCalledWith('nicoRankingGenreOrder', JSON.stringify(validData.genreOrder))
    
    // Wait for reload confirmation dialog
    await waitFor(() => {
      expect(confirmSpy).toHaveBeenCalledWith('インポートが完了しました。ページをリロードして変更を反映しますか？')
    }, { timeout: 2000 })
    
    // Check reload was NOT called
    expect(reloadSpy).not.toHaveBeenCalled()
  })
})