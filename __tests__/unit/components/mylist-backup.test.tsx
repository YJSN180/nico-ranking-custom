/**
 * MylistBackup component tests
 * インポート/エクスポート機能のUI動作テスト
 */

import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest'
import { screen, fireEvent, waitFor } from '@testing-library/react'
import { render } from '@/__tests__/test-utils'
import userEvent from '@testing-library/user-event'
import { MylistBackup } from '@/components/mylist-backup'
import * as backupModule from '@/lib/storage/backup'

// backupモジュールのモック
vi.mock('@/lib/storage/backup', () => ({
  exportMylistData: vi.fn(),
  downloadBackupData: vi.fn(),
  readBackupFile: vi.fn(),
  importMylistData: vi.fn()
}))


// useMylistOperationsフックをモック - CI環境対応
vi.mock('@/context/mylist-operations-context', () => {
  const mockOperations = {
    mylists: [],
    isLoading: false,
    addVideoToMylist: vi.fn().mockResolvedValue(true),
    removeVideoFromMylist: vi.fn().mockResolvedValue(undefined),
    isVideoInAnyMylist: vi.fn().mockResolvedValue({ inMylist: false, mylistIds: [] }),
    createMylist: vi.fn()
  }
  
  return {
    useMylistOperations: vi.fn(() => mockOperations),
    MylistOperationsProvider: ({ children }: { children: React.ReactNode }) => children
  }
})

// CSS modulesをモック
vi.mock('@/components/mylist-backup.module.css', () => {
  return {
    default: {
      mylistBackup: 'mylistBackup',
      backupActions: 'backupActions',
      backupButton: 'backupButton',
      exportButton: 'exportButton',
      importButton: 'importButton',
      buttonIcon: 'buttonIcon',
      fileInput: 'fileInput',
      backupDialogOverlay: 'backupDialogOverlay',
      backupDialog: 'backupDialog',
      dialogNote: 'dialogNote',
      dialogActions: 'dialogActions',
      dialogButton: 'dialogButton',
      cancelButton: 'cancelButton',
      confirmButton: 'confirmButton',
      importResult: 'importResult',
      success: 'success',
      error: 'error'
    }
  }
})



// window.location.reloadのモック
const mockReload = vi.fn()
Object.defineProperty(window, 'location', {
  value: { reload: mockReload },
  writable: true
})

// window.confirmのモック
const mockConfirm = vi.fn()
global.confirm = mockConfirm

describe('MylistBackup Component', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockConfirm.mockReturnValue(true) // デフォルトでconfirmはtrueを返す
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  describe('Export functionality', () => {
    it('should show export confirmation dialog on button click', async () => {
      render(<MylistBackup />)
      
      const exportButton = screen.getByTestId('export-mylists-button')
      await userEvent.click(exportButton)
      
      const dialog = screen.getByTestId('export-confirm-dialog')
      expect(dialog).toBeInTheDocument()
      expect(screen.getByText('マイリストをエクスポート')).toBeInTheDocument()
      expect(screen.getByText('すべてのマイリストデータをJSON形式でダウンロードします。')).toBeInTheDocument()
    })

    it('should close dialog on cancel', async () => {
      render(<MylistBackup />)
      
      const exportButton = screen.getByTestId('export-mylists-button')
      await userEvent.click(exportButton)
      
      const cancelButton = screen.getByText('キャンセル')
      await userEvent.click(cancelButton)
      
      expect(screen.queryByTestId('export-confirm-dialog')).not.toBeInTheDocument()
    })

    it('should export data successfully', async () => {
      const mockData = { mylists: [], mylistVideos: [] }
      vi.mocked(backupModule.exportMylistData).mockResolvedValue(mockData as any)
      
      render(<MylistBackup />)
      
      const exportButton = screen.getByTestId('export-mylists-button')
      await userEvent.click(exportButton)
      
      const downloadButton = screen.getByText('ダウンロード')
      await userEvent.click(downloadButton)
      
      await waitFor(() => {
        expect(backupModule.exportMylistData).toHaveBeenCalled()
        expect(backupModule.downloadBackupData).toHaveBeenCalledWith(mockData)
      })
    })

    it('should handle export error', async () => {
      vi.mocked(backupModule.exportMylistData).mockRejectedValue(new Error('Export failed'))
      const alertMock = vi.spyOn(window, 'alert').mockImplementation(() => {})
      
      render(<MylistBackup />)
      
      const exportButton = screen.getByTestId('export-mylists-button')
      await userEvent.click(exportButton)
      
      const downloadButton = screen.getByText('ダウンロード')
      await userEvent.click(downloadButton)
      
      await waitFor(() => {
        expect(alertMock).toHaveBeenCalledWith('エクスポートに失敗しました')
      })
    })
  })

  describe('Import functionality', () => {
    it('should trigger file input on import button click', async () => {
      render(<MylistBackup />)
      
      const fileInput = screen.getByTestId('import-file-input') as HTMLInputElement
      expect(fileInput.type).toBe('file')
      expect(fileInput.accept).toBe('.json')
    })

    it('should import data successfully and show reload prompt', async () => {
      const mockFile = new File(['{}'], 'backup.json', { type: 'application/json' })
      const mockBackupData = { mylists: [], mylistVideos: [] }
      
      vi.mocked(backupModule.readBackupFile).mockResolvedValue(mockBackupData as any)
      vi.mocked(backupModule.importMylistData).mockResolvedValue({
        success: true,
        imported: { mylists: 2, videos: 5 },
        errors: [],
        overwritten: 0
      })
      
      render(<MylistBackup />)
      
      const fileInput = screen.getByTestId('import-file-input')
      await userEvent.upload(fileInput, mockFile)
      
      await waitFor(() => {
        const successMessage = screen.getByTestId('import-success-message')
        expect(successMessage).toBeInTheDocument()
        expect(successMessage).toHaveTextContent('インポート完了: 2個のマイリスト、5個の動画')
        expect(successMessage).toHaveTextContent('⚠️ 変更を反映するにはページをリロードしてください')
      })
      
      // 1.5秒後にconfirmが表示される
      await waitFor(() => {
        expect(mockConfirm).toHaveBeenCalledWith('インポートが完了しました。ページをリロードして変更を反映しますか？')
        expect(mockReload).toHaveBeenCalled()
      }, { timeout: 2000 })
    })

    it('should show overwritten count when mylists are overwritten', async () => {
      const mockFile = new File(['{}'], 'backup.json', { type: 'application/json' })
      const mockBackupData = { mylists: [], mylistVideos: [] }
      
      vi.mocked(backupModule.readBackupFile).mockResolvedValue(mockBackupData as any)
      vi.mocked(backupModule.importMylistData).mockResolvedValue({
        success: true,
        imported: { mylists: 3, videos: 10 },
        errors: [],
        overwritten: 2
      })
      
      render(<MylistBackup />)
      
      const fileInput = screen.getByTestId('import-file-input')
      await userEvent.upload(fileInput, mockFile)
      
      await waitFor(() => {
        const successMessage = screen.getByTestId('import-success-message')
        expect(successMessage).toHaveTextContent('インポート完了: 3個のマイリスト、10個の動画')
        expect(successMessage).toHaveTextContent('（うち2個のマイリストが上書きされました）')
      })
    })

    it('should not reload if user cancels', async () => {
      mockConfirm.mockReturnValue(false) // ユーザーがキャンセル
      
      const mockFile = new File(['{}'], 'backup.json', { type: 'application/json' })
      const mockBackupData = { mylists: [], mylistVideos: [] }
      
      vi.mocked(backupModule.readBackupFile).mockResolvedValue(mockBackupData as any)
      vi.mocked(backupModule.importMylistData).mockResolvedValue({
        success: true,
        imported: { mylists: 1, videos: 1 },
        errors: [],
        overwritten: 0
      })
      
      render(<MylistBackup />)
      
      const fileInput = screen.getByTestId('import-file-input')
      await userEvent.upload(fileInput, mockFile)
      
      await waitFor(() => {
        expect(mockConfirm).toHaveBeenCalled()
        expect(mockReload).not.toHaveBeenCalled()
      }, { timeout: 2000 })
    })

    it('should show error message on import failure', async () => {
      const mockFile = new File(['{}'], 'backup.json', { type: 'application/json' })
      const mockBackupData = { mylists: [], mylistVideos: [] }
      
      vi.mocked(backupModule.readBackupFile).mockResolvedValue(mockBackupData as any)
      vi.mocked(backupModule.importMylistData).mockResolvedValue({
        success: false,
        imported: { mylists: 0, videos: 0 },
        errors: ['エラー1', 'エラー2'],
        overwritten: 0
      })
      
      render(<MylistBackup />)
      
      const fileInput = screen.getByTestId('import-file-input')
      await userEvent.upload(fileInput, mockFile)
      
      await waitFor(() => {
        const errorMessage = screen.getByTestId('import-error-message')
        expect(errorMessage).toBeInTheDocument()
        expect(errorMessage).toHaveTextContent('インポート中にエラーが発生しました: エラー1, エラー2')
      })
    })

    it('should handle file read error', async () => {
      const mockFile = new File(['invalid'], 'backup.json', { type: 'application/json' })
      
      vi.mocked(backupModule.readBackupFile).mockRejectedValue(new Error('無効なファイル形式です'))
      
      render(<MylistBackup />)
      
      const fileInput = screen.getByTestId('import-file-input')
      await userEvent.upload(fileInput, mockFile)
      
      await waitFor(() => {
        const errorMessage = screen.getByTestId('import-error-message')
        expect(errorMessage).toBeInTheDocument()
        expect(errorMessage).toHaveTextContent('無効なファイル形式です')
      })
    })

    it('should reset file input after import', async () => {
      const mockFile = new File(['{}'], 'backup.json', { type: 'application/json' })
      const mockBackupData = { mylists: [], mylistVideos: [] }
      
      vi.mocked(backupModule.readBackupFile).mockResolvedValue(mockBackupData as any)
      vi.mocked(backupModule.importMylistData).mockResolvedValue({
        success: true,
        imported: { mylists: 1, videos: 1 },
        errors: [],
        overwritten: 0
      })
      
      render(<MylistBackup />)
      
      const fileInput = screen.getByTestId('import-file-input') as HTMLInputElement
      await userEvent.upload(fileInput, mockFile)
      
      await waitFor(() => {
        expect(fileInput.value).toBe('')
      })
    })
  })

  describe('Button states', () => {
    it('should disable export button during export', async () => {
      vi.mocked(backupModule.exportMylistData).mockImplementation(() => 
        new Promise(resolve => setTimeout(resolve, 100))
      )
      
      render(<MylistBackup />)
      
      const exportButton = screen.getByTestId('export-mylists-button')
      await userEvent.click(exportButton)
      
      const downloadButton = screen.getByText('ダウンロード')
      await userEvent.click(downloadButton)
      
      expect(screen.getByText('エクスポート中...')).toBeInTheDocument()
      expect(downloadButton).toBeDisabled()
    })

    it('should disable import button during import', async () => {
      const mockFile = new File(['{}'], 'backup.json', { type: 'application/json' })
      
      vi.mocked(backupModule.readBackupFile).mockImplementation(() => 
        new Promise(resolve => setTimeout(resolve, 100))
      )
      
      render(<MylistBackup />)
      
      const fileInput = screen.getByTestId('import-file-input')
      const importButton = screen.getByTestId('import-mylists-button')
      
      await userEvent.upload(fileInput, mockFile)
      
      // インポート処理中はボタンが無効化される
      expect(fileInput).toBeDisabled()
    })
  })
})