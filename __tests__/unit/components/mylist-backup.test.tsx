import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest'
import { screen, waitFor, cleanup, fireEvent } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { render } from '@/__tests__/test-utils'
import { MylistBackup } from '@/components/mylist-backup'
import * as backupModule from '@/lib/storage/backup'

vi.mock('@/components/mylist-backup.module.css', () => ({
  default: new Proxy({}, { get: (_, key) => String(key) })
}))

vi.mock('@/lib/storage/backup', () => ({
  exportMylistData: vi.fn(),
  downloadBackupData: vi.fn(),
  readBackupFile: vi.fn(),
  importMylistData: vi.fn(),
  detectMylistConflicts: vi.fn()
}))

vi.mock('@/context/mylist-operations-context', () => ({
  useMylistOperations: vi.fn(() => ({
    mylists: [],
    isLoading: false,
    addVideoToMylist: vi.fn().mockResolvedValue(true),
    removeVideoFromMylist: vi.fn().mockResolvedValue(undefined),
    isVideoInAnyMylist: vi.fn().mockResolvedValue({ inMylist: false, mylistIds: [] }),
    createMylist: vi.fn()
  })),
  MylistOperationsProvider: ({ children }: { children: React.ReactNode }) => children
}))

describe('MylistBackup', () => {
  const mockConfirm = vi.fn()
  const mockReload = vi.fn()
  const originalLocation = window.location

  const baseBackupPayload = {
    version: '1.0.0',
    exportDate: '2026-04-21T00:00:00.000Z',
    mylists: [],
    mylistVideos: [],
    metadata: {
      totalMylists: 0,
      totalVideos: 0,
      appVersion: '1.0.0'
    }
  }

  const selectFile = (input: HTMLElement, file: File) => {
    fireEvent.change(input, {
      target: {
        files: [file]
      }
    })
  }

  beforeEach(() => {
    vi.clearAllMocks()
    mockConfirm.mockReturnValue(true)
    global.confirm = mockConfirm

    delete (window as Partial<Window>).location
    window.location = {
      ...originalLocation,
      reload: mockReload
    } as Location

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
    cleanup()
    vi.restoreAllMocks()
  })

  it('エクスポート確認ダイアログを開ける', async () => {
    render(<MylistBackup />)

    await userEvent.click(screen.getByTestId('export-mylists-button'))

    expect(screen.getByTestId('export-confirm-dialog')).toBeInTheDocument()
    expect(screen.getByText('マイリストをエクスポート')).toBeInTheDocument()
  })

  it('エクスポート時に helper を呼ぶ', async () => {
    const mockData = { mylists: [], mylistVideos: [] }
    vi.mocked(backupModule.exportMylistData).mockResolvedValue(mockData as never)

    render(<MylistBackup />)

    await userEvent.click(screen.getByTestId('export-mylists-button'))
    await userEvent.click(screen.getByText('ダウンロード'))

    await waitFor(() => {
      expect(backupModule.exportMylistData).toHaveBeenCalled()
      expect(backupModule.downloadBackupData).toHaveBeenCalledWith(mockData)
    })
  })

  it('個別バックアップをインポートして成功表示とリロード確認を出す', async () => {
    const file = new File([JSON.stringify(baseBackupPayload)], 'backup.json', {
      type: 'application/json'
    })
    Object.defineProperty(file, 'text', {
      value: vi.fn().mockResolvedValue(JSON.stringify(baseBackupPayload))
    })

    vi.mocked(backupModule.readBackupFile).mockResolvedValue(baseBackupPayload as never)
    vi.mocked(backupModule.importMylistData).mockResolvedValue({
      success: true,
      imported: { mylists: 2, videos: 5 },
      created: { mylists: 2, videos: 5 },
      overwritten: { mylists: 0, videos: 0 },
      skipped: { mylists: 0, videos: 0, reason: [] },
      renamed: { mylists: [] },
      errors: []
    } as never)

    render(<MylistBackup />)

    const fileInput = screen.getByTestId('import-file-input')
    selectFile(fileInput, file)

    await waitFor(() => {
      expect(backupModule.readBackupFile).toHaveBeenCalledWith(file)
      expect(backupModule.importMylistData).toHaveBeenCalledWith(baseBackupPayload, 'safe_add')
      expect(screen.getByTestId('import-success-message')).toHaveTextContent('✅ インポート完了')
    })

    await waitFor(
      () => {
        expect(mockConfirm).toHaveBeenCalledWith(
          'インポートが完了しました。ページをリロードして変更を反映しますか？'
        )
        expect(mockReload).toHaveBeenCalled()
      },
      { timeout: 2500 }
    )

    expect((fileInput as HTMLInputElement).value).toBe('')
  })

  it('インポート失敗時はエラーメッセージを出す', async () => {
    const file = new File([JSON.stringify(baseBackupPayload)], 'backup.json', {
      type: 'application/json'
    })
    Object.defineProperty(file, 'text', {
      value: vi.fn().mockResolvedValue(JSON.stringify(baseBackupPayload))
    })

    vi.mocked(backupModule.readBackupFile).mockRejectedValue(new Error('無効なファイル形式です'))

    render(<MylistBackup />)

    selectFile(screen.getByTestId('import-file-input'), file)

    await waitFor(() => {
      expect(screen.getByTestId('import-error-message')).toHaveTextContent('無効なファイル形式です')
    })
  })

})
