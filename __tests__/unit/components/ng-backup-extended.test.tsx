import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { NGBackup } from '../../../components/ng-backup'
import type { ExtendedUserNGList } from '../../../types/ng-list-extended'
import * as extendedBackupModule from '../../../lib/storage/ng-backup-extended'
import * as legacyBackupModule from '../../../lib/storage/ng-backup'

let mockNGList: ExtendedUserNGList

vi.mock('../../../hooks/use-user-ng-list-extended', () => ({
  useUserNGListExtended: () => ({
    ngList: mockNGList
  })
}))

vi.mock('../../../lib/storage/ng-backup-extended', () => ({
  exportExtendedNGListData: vi.fn(),
  readExtendedNGListBackupFile: vi.fn(),
  importExtendedNGListData: vi.fn(),
  detectExtendedConflicts: vi.fn()
}))

vi.mock('../../../lib/storage/ng-backup', () => ({
  downloadNGListBackup: vi.fn()
}))

describe('NGBackup - Extended Features', () => {
  const createUploadFile = (name: string, payload: unknown) => {
    const file = new File([JSON.stringify(payload)], name, {
      type: 'application/json'
    })
    Object.defineProperty(file, 'text', {
      value: vi.fn().mockResolvedValue(JSON.stringify(payload))
    })
    return file
  }

  beforeEach(() => {
    vi.clearAllMocks()

    mockNGList = {
      videoIds: ['sm1', 'sm2'],
      videoTitles: {
        exact: ['Title1'],
        partial: ['Partial1']
      },
      authorIds: ['author1'],
      authorNames: {
        exact: ['Author1'],
        partial: ['Auth1']
      },
      tags: {
        locked: { exact: ['ゲーム'], partial: ['実況'] },
        user: { exact: ['歌ってみた'], partial: ['カバー'] },
        both: { exact: ['音楽'], partial: ['BGM'] }
      },
      version: 2,
      totalCount: 12,
      updatedAt: '2025-01-01T00:00:00Z'
    }

    vi.mocked(extendedBackupModule.detectExtendedConflicts).mockReturnValue({
      hasConflicts: false,
      conflicts: {
        videoIds: [],
        videoTitles: { exact: [], partial: [] },
        authorIds: [],
        authorNames: { exact: [], partial: [] },
        tags: {
          locked: { exact: [], partial: [] },
          user: { exact: [], partial: [] },
          both: { exact: [], partial: [] }
        }
      },
      inclusions: {
        videoTitles: [],
        authorNames: [],
        tags: {
          locked: [],
          user: [],
          both: []
        }
      }
    })
  })

  it('エクスポート確認後に helper を呼ぶ', async () => {
    const exported = {
      version: '1.1.0',
      exportDate: '2025-01-01T00:00:00Z',
      exportSource: 'settings-applied' as const,
      ngList: mockNGList,
      metadata: {
        totalItems: 12,
        categoryBreakdown: {
          videoIds: 2,
          videoTitlesExact: 1,
          videoTitlesPartial: 1,
          authorIds: 1,
          authorNamesExact: 1,
          authorNamesPartial: 1,
          tagsLockedExact: 1,
          tagsLockedPartial: 1,
          tagsUserExact: 1,
          tagsUserPartial: 1,
          tagsBothExact: 1,
          tagsBothPartial: 1
        },
        appVersion: '1.0.0'
      }
    }
    vi.mocked(extendedBackupModule.exportExtendedNGListData).mockReturnValue(exported)

    render(<NGBackup />)

    await userEvent.click(screen.getByTestId('export-ng-list-button'))
    await userEvent.click(screen.getByText('ダウンロード'))

    expect(extendedBackupModule.exportExtendedNGListData).toHaveBeenCalled()
    expect(legacyBackupModule.downloadNGListBackup).toHaveBeenCalledWith(exported)
  })

  it('拡張バックアップを読み込んで merge import する', async () => {
    const data = {
      version: '1.1.0',
      exportDate: '2025-01-02T00:00:00Z',
      exportSource: 'settings-applied' as const,
      ngList: {
        videoIds: ['sm3'],
        videoTitles: { exact: [], partial: ['New'] },
        authorIds: [],
        authorNames: { exact: [], partial: [] },
        tags: {
          locked: { exact: ['東方'], partial: [] },
          user: { exact: [], partial: ['MMD'] },
          both: { exact: [], partial: [] }
        },
        version: 2,
        totalCount: 3,
        updatedAt: '2025-01-02T00:00:00Z'
      },
      metadata: {
        totalItems: 3,
        categoryBreakdown: {
          videoIds: 1,
          videoTitlesExact: 0,
          videoTitlesPartial: 1,
          authorIds: 0,
          authorNamesExact: 0,
          authorNamesPartial: 0,
          tagsLockedExact: 1,
          tagsLockedPartial: 0,
          tagsUserExact: 0,
          tagsUserPartial: 1,
          tagsBothExact: 0,
          tagsBothPartial: 0
        },
        appVersion: '1.0.0'
      }
    }
    const file = createUploadFile('ng-list-backup.json', data)

    vi.mocked(extendedBackupModule.importExtendedNGListData).mockResolvedValue({
      success: true,
      imported: {
        totalItems: 3,
        categoryBreakdown: data.metadata.categoryBreakdown
      },
      skipped: { totalItems: 0, reason: [] },
      errors: [],
      overwritten: false
    })

    render(<NGBackup />)

    await userEvent.upload(screen.getByTestId('import-file-input'), file)

    await waitFor(() => {
      expect(extendedBackupModule.detectExtendedConflicts).toHaveBeenCalledWith(mockNGList, data.ngList)
      expect(extendedBackupModule.importExtendedNGListData).toHaveBeenCalledWith(data, 'merge')
    })
  })

  it('v1.0.0 バックアップも import helper に渡す', async () => {
    const oldVersionData = {
      version: '1.0.0',
      exportDate: '2025-01-01T00:00:00Z',
      exportSource: 'settings-applied' as const,
      ngList: {
        videoIds: ['sm1'],
        videoTitles: { exact: ['Title'], partial: [] },
        authorIds: ['author1'],
        authorNames: { exact: [], partial: [] },
        version: 1,
        totalCount: 3,
        updatedAt: '2025-01-01T00:00:00Z'
      },
      metadata: {
        totalItems: 3,
        categoryBreakdown: {
          videoIds: 1,
          videoTitlesExact: 1,
          videoTitlesPartial: 0,
          authorIds: 1,
          authorNamesExact: 0,
          authorNamesPartial: 0
        },
        appVersion: '0.9.0'
      }
    }
    const file = createUploadFile('ng-list-backup-old.json', oldVersionData)

    vi.mocked(extendedBackupModule.importExtendedNGListData).mockResolvedValue({
      success: true,
      imported: {
        totalItems: 3,
        categoryBreakdown: oldVersionData.metadata.categoryBreakdown
      },
      skipped: { totalItems: 0, reason: [] },
      errors: [],
      overwritten: false
    })

    render(<NGBackup />)

    await userEvent.upload(screen.getByTestId('import-file-input'), file)

    await waitFor(() => {
      expect(extendedBackupModule.importExtendedNGListData).toHaveBeenCalledWith(oldVersionData, 'merge')
    })
  })
})
