import React from 'react'
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react'
import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest'
import { UnifiedBackup } from '@/components/unified-backup'
import { MylistBackup } from '@/components/mylist-backup'
import { CustomRankingBackup } from '@/components/custom-ranking-backup'
import { importExtendedNGListData } from '@/lib/storage/ng-backup-extended'
import { importMylistData, detectMylistConflicts } from '@/lib/storage/backup'
import { TOAST_EVENT, type ToastPayload } from '@/lib/toast'

// X-f: インポート後の自動再読み込みは、全部成功したときだけ行う。
// 一部が失敗したときは自動で再読み込みせず（内容が読めなくなるため）、
// 成功と失敗の内容と「再読み込み」ボタンを出す。成功のトーストも出さない。

const createRanking = vi.fn()
const updateRanking = vi.fn()

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
  detectMylistConflicts: vi.fn(),
  readBackupFile: vi.fn()
}))

// new で呼ばれるため、アロー関数ではなく function で実装する（Vitest 4）
vi.mock('@/lib/storage/db-manager', () => ({
  DBManager: vi.fn().mockImplementation(function () {
    return { init: vi.fn(), getDB: vi.fn(() => ({})) }
  })
}))

vi.mock('@/lib/storage/custom-rankings', () => ({
  CustomRankingManager: vi.fn().mockImplementation(function () {
    return { createRanking, updateRanking }
  })
}))

const originalLocation = window.location
const reload = vi.fn()
let toasts: ToastPayload[]
const onToast = (event: Event) => toasts.push((event as CustomEvent<ToastPayload>).detail)

function jsonFile(data: unknown, name = 'backup.json'): File {
  const content = JSON.stringify(data)
  const file = new File([content], name, { type: 'application/json' })
  // jsdom の File には text() が無い（MylistBackup が使う）
  return Object.assign(file, { text: async () => content })
}

const genreOrder = [{ id: 'all', name: '総合', isVisible: true, order: 0 }]
const ngListBackup = { ngList: { videoIds: ['sm90000001'] }, metadata: { exportDate: '2026-01-01' }, version: 2 }

beforeEach(() => {
  vi.clearAllMocks()
  toasts = []
  window.addEventListener(TOAST_EVENT, onToast)
  delete (window as Partial<Window>).location
  window.location = { ...originalLocation, reload } as Location
})

afterEach(() => {
  window.removeEventListener(TOAST_EVENT, onToast)
  window.location = originalLocation
  vi.useRealTimers()
})

async function importUnified(data: unknown) {
  render(<UnifiedBackup />)
  fireEvent.change(screen.getByTestId('import-file-input'), { target: { files: [jsonFile(data)] } })
  await waitFor(() => expect(screen.getByTestId('import-confirm-dialog')).toBeInTheDocument())
  vi.useFakeTimers()
  await act(async () => {
    fireEvent.click(screen.getByText('インポート実行'))
  })
}

describe('UnifiedBackup のインポート後', () => {
  it('全部成功したら、成功のトーストを出して自動で再読み込みする', async () => {
    await importUnified({ version: 1, exportDate: '2026-01-01', appVersion: '1.0.0', data: { genreOrder } })

    expect(toasts.some((t) => t.type === 'success')).toBe(true)
    await act(async () => {
      vi.advanceTimersByTime(2000)
    })
    expect(reload).toHaveBeenCalledTimes(1)
  })

  it('一部が失敗したら、自動で再読み込みせず、内容と「再読み込み」ボタンを出す', async () => {
    vi.mocked(importExtendedNGListData).mockRejectedValueOnce(new Error('合成エラー'))
    await importUnified({ version: 1, exportDate: '2026-01-01', appVersion: '1.0.0', data: { ngList: ngListBackup, genreOrder } })

    await act(async () => {
      vi.advanceTimersByTime(5000)
    })
    expect(reload).not.toHaveBeenCalled()
    expect(toasts.some((t) => t.type === 'success')).toBe(false)

    const message = screen.getByTestId('import-error-message')
    expect(message.textContent).toContain('ジャンル並び替え')
    expect(message.textContent).toContain('合成エラー')

    fireEvent.click(screen.getByRole('button', { name: '再読み込み' }))
    expect(reload).toHaveBeenCalledTimes(1)
  })

  it('全部失敗したら、再読み込みしない（反映するものが無い）', async () => {
    vi.mocked(importExtendedNGListData).mockRejectedValueOnce(new Error('合成エラー'))
    await importUnified({ version: 1, exportDate: '2026-01-01', appVersion: '1.0.0', data: { ngList: ngListBackup } })

    await act(async () => {
      vi.advanceTimersByTime(5000)
    })
    expect(reload).not.toHaveBeenCalled()
    expect(screen.getByTestId('import-error-message').textContent).toContain('合成エラー')
    expect(screen.queryByRole('button', { name: '再読み込み' })).toBeNull()
  })
})

describe('MylistBackup のインポート後', () => {
  const mylistBackup = {
    version: '1.0.0',
    exportDate: '2026-01-01',
    mylists: [{ id: 'm1', name: '合成マイリスト' }],
    mylistVideos: [],
    metadata: { totalMylists: 1, totalVideos: 0, appVersion: '1.0.0' }
  }

  it('一部が失敗したら、自動で再読み込みせず、追加できた件数・エラーと「再読み込み」ボタンを出す', async () => {
    vi.mocked(detectMylistConflicts).mockResolvedValue({ hasConflicts: false } as Awaited<ReturnType<typeof detectMylistConflicts>>)
    vi.mocked(importMylistData).mockResolvedValue({
      success: false,
      imported: { mylists: 1, videos: 3 },
      created: { mylists: 1, videos: 3 },
      overwritten: { mylists: 0, videos: 0 },
      skipped: { mylists: 0, videos: 0, reason: [] },
      renamed: { mylists: [] },
      errors: ['合成マイリストの動画のインポートに失敗']
    })

    render(<MylistBackup />)
    const input = screen.getAllByTestId(/import/).find((el) => el.tagName === 'INPUT') as HTMLInputElement
    fireEvent.change(input, { target: { files: [jsonFile(mylistBackup)] } })

    await waitFor(() => expect(screen.getByTestId('import-error-message')).toBeInTheDocument())
    const message = screen.getByTestId('import-error-message')
    expect(message.textContent).toContain('合成マイリストの動画のインポートに失敗')
    expect(message.textContent).toContain('追加されたマイリスト: 1件')
    expect(reload).not.toHaveBeenCalled()

    fireEvent.click(screen.getByRole('button', { name: '再読み込み' }))
    expect(reload).toHaveBeenCalledTimes(1)
  })
})

describe('CustomRankingBackup のインポート後', () => {
  const rankings = [
    { id: 'r1', title: '合成ランキング1', baseGenre: 'all', conditions: [] },
    { id: 'r2', title: '合成ランキング2', baseGenre: 'game', conditions: [] }
  ]

  it('一部が失敗したら、自動で再読み込みせず、内容と「再読み込み」ボタンを出す', async () => {
    createRanking.mockResolvedValueOnce('new-r1').mockRejectedValueOnce(new Error('合成エラー'))

    render(<CustomRankingBackup />)
    fireEvent.change(screen.getByTestId('import-file-input'), {
      target: { files: [jsonFile({ version: 1, exportDate: '2026-01-01', customRankings: rankings })] }
    })
    await waitFor(() => expect(screen.getByTestId('import-confirm-dialog')).toBeInTheDocument())
    vi.useFakeTimers()
    await act(async () => {
      fireEvent.click(screen.getByText('インポート実行'))
    })
    await act(async () => {
      vi.advanceTimersByTime(5000)
    })

    expect(reload).not.toHaveBeenCalled()
    expect(toasts.some((t) => t.type === 'success')).toBe(false)
    const message = screen.getByTestId('import-error-message')
    expect(message.textContent).toContain('1件追加')
    expect(message.textContent).toContain('合成ランキング2')
    expect(message.textContent).toContain('合成エラー')

    fireEvent.click(screen.getByRole('button', { name: '再読み込み' }))
    expect(reload).toHaveBeenCalledTimes(1)
  })
})
