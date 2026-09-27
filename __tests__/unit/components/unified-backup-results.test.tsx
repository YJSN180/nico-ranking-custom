import React from 'react'
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react'
import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest'
import { UnifiedBackup } from '@/components/unified-backup'
import { importExtendedNGListData, type ExtendedNGListImportResult } from '@/lib/storage/ng-backup-extended'
import { importMylistData, detectMylistConflicts, type MylistImportResult } from '@/lib/storage/backup'
import { TOAST_EVENT, type ToastPayload } from '@/lib/toast'

// まとめてインポートは、各データの取り込み関数が「失敗」を返したとき（throw せず success: false）も
// 成功と表示してはいけない。データはすべて合成値。

vi.mock('@/hooks/use-user-ng-list-extended', () => ({
  useUserNGListExtended: () => ({
    ngList: {
      videoIds: [],
      videoTitles: { exact: [], partial: [] },
      authorIds: [],
      authorNames: { exact: [], partial: [] },
      tags: { locked: { exact: [], partial: [] }, user: { exact: [], partial: [] }, both: { exact: [], partial: [] } },
      version: 2,
      totalCount: 0,
      updatedAt: '2026-01-01T00:00:00Z'
    }
  })
}))

vi.mock('@/hooks/use-genre-order-v2', () => ({
  useGenreOrderV2: () => ({ items: [] })
}))

vi.mock('@/hooks/use-custom-rankings', () => ({
  useCustomRankings: () => ({ rankings: [] })
}))

vi.mock('@/lib/storage/ng-backup-extended', () => ({
  exportExtendedNGListData: vi.fn(),
  importExtendedNGListData: vi.fn(),
  detectExtendedConflicts: vi.fn(() => ({ hasConflicts: false, conflicts: {} }))
}))

vi.mock('@/lib/storage/backup', () => ({
  exportMylistData: vi.fn(),
  importMylistData: vi.fn(),
  detectMylistConflicts: vi.fn()
}))

vi.mock('@/lib/storage/db-manager', () => ({
  DBManager: vi.fn().mockImplementation(function () {
    return { init: vi.fn(), getDB: vi.fn(() => ({})) }
  })
}))

vi.mock('@/lib/storage/custom-rankings', () => ({
  CustomRankingManager: vi.fn().mockImplementation(function () {
    return { createRanking: vi.fn(), updateRanking: vi.fn() }
  })
}))

const originalLocation = window.location
const reload = vi.fn()
let toasts: ToastPayload[]
const onToast = (event: Event): void => {
  toasts.push((event as CustomEvent<ToastPayload>).detail)
}

function jsonFile(data: unknown): File {
  return new File([JSON.stringify(data)], 'backup.json', { type: 'application/json' })
}

const genreOrder = [{ id: 'all', isVisible: true, order: 0 }]
const ngListBackup = {
  version: '1.1.0',
  exportDate: '2026-01-01T00:00:00.000Z',
  exportSource: 'settings-applied',
  ngList: { videoIds: ['sm90000001'] },
  metadata: { totalItems: 1 }
}
const mylistBackup = {
  version: '1.0.0',
  exportDate: '2026-01-01T00:00:00.000Z',
  mylists: [{ id: 'mylist-synthetic-1', name: '合成マイリスト', createdAt: 1, updatedAt: 1, videoCount: 0 }],
  mylistVideos: [],
  metadata: { totalMylists: 1, totalVideos: 0, appVersion: '1.0.0' }
}

function failedMylistResult(errors: string[]): MylistImportResult {
  return {
    success: false,
    imported: { mylists: 0, videos: 0 },
    created: { mylists: 0, videos: 0 },
    overwritten: { mylists: 0, videos: 0 },
    skipped: { mylists: 0, videos: 0, reason: [] },
    renamed: { mylists: [] },
    errors
  }
}

function failedNGResult(errors: string[]): ExtendedNGListImportResult {
  return {
    success: false,
    imported: {
      totalItems: 0,
      categoryBreakdown: { videoIds: 0, videoTitlesExact: 0, videoTitlesPartial: 0, authorIds: 0, authorNamesExact: 0, authorNamesPartial: 0 }
    },
    skipped: { totalItems: 0, reason: [] },
    errors,
    overwritten: false
  }
}

async function importUnified(data: unknown): Promise<void> {
  render(<UnifiedBackup />)
  fireEvent.change(screen.getByTestId('import-file-input'), { target: { files: [jsonFile(data)] } })
  await waitFor(() => expect(screen.getByTestId('import-confirm-dialog')).toBeInTheDocument())
  vi.useFakeTimers()
  await act(async () => {
    fireEvent.click(screen.getByText('インポート実行'))
  })
  await act(async () => {
    vi.advanceTimersByTime(5000)
  })
}

beforeEach(() => {
  vi.clearAllMocks()
  toasts = []
  window.addEventListener(TOAST_EVENT, onToast)
  delete (window as Partial<Window>).location
  window.location = { ...originalLocation, reload } as Location
  vi.mocked(detectMylistConflicts).mockResolvedValue({ hasConflicts: false } as Awaited<ReturnType<typeof detectMylistConflicts>>)
})

afterEach(() => {
  window.removeEventListener(TOAST_EVENT, onToast)
  window.location = originalLocation
  vi.useRealTimers()
})

describe('まとめてインポートの結果表示', () => {
  it('マイリストの取り込みが失敗を返したら、成功と表示せず、自動で再読み込みもしない', async () => {
    vi.mocked(importMylistData).mockResolvedValue(failedMylistResult(['合成: マイリストを書き込めませんでした']))

    await importUnified({ version: 1, exportDate: '2026-01-01', appVersion: '1.0.0', data: { mylists: mylistBackup } })

    const message = screen.getByTestId('import-error-message')
    expect(message.textContent).toContain('合成: マイリストを書き込めませんでした')
    expect(screen.queryByTestId('import-success-message')).toBeNull()
    expect(toasts.some((t) => t.type === 'success')).toBe(false)
    expect(reload).not.toHaveBeenCalled()
  })

  it('NG リストの取り込みが失敗を返したら、ほかが成功しても一部失敗として知らせる', async () => {
    vi.mocked(importExtendedNGListData).mockReturnValue(failedNGResult(['合成: NG リストを保存できませんでした']))

    await importUnified({ version: 1, exportDate: '2026-01-01', appVersion: '1.0.0', data: { ngList: ngListBackup, genreOrder } })

    const message = screen.getByTestId('import-error-message')
    expect(message.textContent).toContain('合成: NG リストを保存できませんでした')
    expect(message.textContent).toContain('ジャンル並び替え')
    expect(reload).not.toHaveBeenCalled()
    // 取り込めたもの（ジャンル並び替え）を反映するための再読み込みボタンは出す
    expect(screen.getByRole('button', { name: '再読み込み' })).toBeInTheDocument()
  })
})
