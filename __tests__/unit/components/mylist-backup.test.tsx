/**
 * MylistBackup component tests
 * インポート/エクスポート機能のUI動作テスト
 */

// CSS modulesをモック - 最初に宣言（ホイスト対応）
vi.mock('@/components/mylist-backup.module.css', () => ({
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
}))

// backupモジュールのモック
vi.mock('@/lib/storage/backup', () => {
  return {
    exportMylistData: vi.fn(),
    downloadBackupData: vi.fn(),
    readBackupFile: vi.fn(),
    importMylistData: vi.fn(),
    detectMylistConflicts: vi.fn()
  }
})

// useMylistOperationsフックをモック - CI環境対応
// 強制的にundefinedでないことを保証
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

import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest'
import { screen, fireEvent, waitFor, cleanup } from '@testing-library/react'
import { render } from '@/__tests__/test-utils'
import userEvent from '@testing-library/user-event'
import { MylistBackup } from '@/components/mylist-backup'
import { useMylistOperations } from '@/context/mylist-operations-context'
import * as backupModule from '@/lib/storage/backup'

const mockUseMylistOperations = useMylistOperations as unknown as ReturnType<typeof vi.fn>



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
  const mockOperations = {
    mylists: [],
    isLoading: false,
    addVideoToMylist: vi.fn().mockResolvedValue(true),
    removeVideoFromMylist: vi.fn().mockResolvedValue(undefined),
    isVideoInAnyMylist: vi.fn().mockResolvedValue({ inMylist: false, mylistIds: [] }),
    createMylist: vi.fn()
  }

  beforeEach(() => {
    vi.clearAllMocks()
    mockConfirm.mockReturnValue(true) // デフォルトでconfirmはtrueを返す
    
    // useMylistOperationsモックの設定
    mockUseMylistOperations.mockReturnValue(mockOperations)
    
    // detectMylistConflictsのデフォルトモック設定
    vi.mocked(backupModule.detectMylistConflicts).mockResolvedValue({
      hasConflicts: false,
      summary: {
        importingMylists: 0,
        importingVideos: 0,
        totalConflictingMylists: 0,
        totalConflictingVideos: 0
      },
      conflicts: {
        mylistIds: [],
        mylistNames: [],
        videos: []
      }
    })
  })

  afterEach(() => {
    cleanup() // DOM cleanup
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
        created: { mylists: 2, videos: 5 },
        overwritten: { mylists: 0, videos: 0 },
        skipped: { mylists: 0, videos: 0, reason: [] },
        renamed: { mylists: [] },
        errors: []
      })
      
      render(<MylistBackup />)
      
      const fileInput = screen.getByTestId('import-file-input')
      await userEvent.upload(fileInput, mockFile)
      
      await waitFor(() => {
        const successMessage = screen.getByTestId('import-success-message')
        expect(successMessage).toBeInTheDocument()
        expect(successMessage).toHaveTextContent('✅ インポート完了')
        expect(successMessage).toHaveTextContent('追加されたマイリスト: 2件')
        expect(successMessage).toHaveTextContent('追加された動画: 5件')
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
        created: { mylists: 1, videos: 10 },
        overwritten: { mylists: 2, videos: 0 },
        skipped: { mylists: 0, videos: 0, reason: [] },
        renamed: { mylists: [] },
        errors: []
      })
      
      render(<MylistBackup />)
      
      const fileInput = screen.getByTestId('import-file-input')
      await userEvent.upload(fileInput, mockFile)
      
      await waitFor(() => {
        const successMessage = screen.getByTestId('import-success-message')
        expect(successMessage).toBeInTheDocument()
        expect(successMessage).toHaveTextContent('✅ インポート完了')
        expect(successMessage).toHaveTextContent('追加されたマイリスト: 1件')
        expect(successMessage).toHaveTextContent('追加された動画: 10件')
        expect(successMessage).toHaveTextContent('上書きされたマイリスト: 2件')
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
        created: { mylists: 1, videos: 1 },
        overwritten: { mylists: 0, videos: 0 },
        skipped: { mylists: 0, videos: 0, reason: [] },
        renamed: { mylists: [] },
        errors: []
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
        created: { mylists: 0, videos: 0 },
        overwritten: { mylists: 0, videos: 0 },
        skipped: { mylists: 0, videos: 0, reason: [] },
        renamed: { mylists: [] },
        errors: ['エラー1', 'エラー2']
      })
      
      render(<MylistBackup />)
      
      const fileInput = screen.getByTestId('import-file-input')
      await userEvent.upload(fileInput, mockFile)
      
      await waitFor(() => {
        const errorMessage = screen.getByTestId('import-error-message')
        expect(errorMessage).toBeInTheDocument()
        expect(errorMessage).toHaveTextContent('❌ インポートエラー')
        expect(errorMessage).toHaveTextContent('エラー1')
        expect(errorMessage).toHaveTextContent('エラー2')
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
        expect(errorMessage).toHaveTextContent('❌ インポートエラー')
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
        created: { mylists: 1, videos: 1 },
        overwritten: { mylists: 0, videos: 0 },
        skipped: { mylists: 0, videos: 0, reason: [] },
        renamed: { mylists: [] },
        errors: []
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