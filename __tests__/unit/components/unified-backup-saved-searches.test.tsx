// 統合バックアップの取り込みで、保存した検索条件が上限を超える・保存できないときに、成功と表示しないことを確かめる。
// 取り込みの画面（components/unified-backup.tsx）は変えず、lib/search/saved-searches.ts が失敗を投げることで
// 画面の既存の失敗の扱い（❌ の行・自動で再読み込みしない・成功のトーストを出さない）に乗る。検索条件はすべて合成値
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react'
import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest'
import { UnifiedBackup } from '@/components/unified-backup'
import { TOAST_EVENT, type ToastPayload } from '@/lib/toast'
import { MAX_SAVED_SEARCHES, SAVED_SEARCHES_KEY, type SavedSearch } from '@/lib/search/saved-searches'

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
      updatedAt: '2026-01-01T00:00:00Z',
    },
  }),
}))
vi.mock('@/hooks/use-genre-order-v2', () => ({ useGenreOrderV2: () => ({ items: [] }) }))
vi.mock('@/hooks/use-custom-rankings', () => ({ useCustomRankings: () => ({ rankings: [] }) }))
vi.mock('@/lib/storage/ng-backup-extended', () => ({
  exportExtendedNGListData: vi.fn(),
  importExtendedNGListData: vi.fn(),
  detectExtendedConflicts: vi.fn(() => ({ hasConflicts: false, conflicts: {} })),
}))
vi.mock('@/lib/storage/backup', () => ({
  exportMylistData: vi.fn(),
  importMylistData: vi.fn(),
  detectMylistConflicts: vi.fn(),
  readBackupFile: vi.fn(),
}))

const originalLocation = window.location
const reload = vi.fn()
let toasts: ToastPayload[]
const onToast = (event: Event): void => {
  toasts.push((event as CustomEvent<ToastPayload>).detail)
}

const searchNamed = (name: string): SavedSearch => ({ id: `id-${name}`, name, query: 'q=x', createdAt: 't', updatedAt: 't' })
const searches = (count: number, prefix: string): SavedSearch[] => Array.from({ length: count }, (_, i) => searchNamed(`${prefix}${i}`))

function jsonFile(data: unknown): File {
  const content = JSON.stringify(data)
  const file = new File([content], 'backup.json', { type: 'application/json' })
  return Object.assign(file, { text: async () => content })
}

async function importSavedSearches(imported: SavedSearch[]): Promise<void> {
  render(<UnifiedBackup />)
  const data = { version: 1, exportDate: '2026-01-01', appVersion: '1.0.0', data: { savedSearches: { version: 1, searches: imported } } }
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
  localStorage.clear()
  toasts = []
  window.addEventListener(TOAST_EVENT, onToast)
  // 再読み込みを数えるため、location を差し替える
  Object.defineProperty(window, 'location', { configurable: true, writable: true, value: { ...originalLocation, reload } })
})

afterEach(() => {
  window.removeEventListener(TOAST_EVENT, onToast)
  Object.defineProperty(window, 'location', { configurable: true, writable: true, value: originalLocation })
  vi.useRealTimers()
  vi.restoreAllMocks()
})

describe('統合バックアップの取り込み: 保存した検索条件', () => {
  it('合わせると上限を超えるなら、取り込まず失敗として示す（成功のトーストも再読み込みもしない）', async () => {
    const existing = searches(45, 'local')
    localStorage.setItem(SAVED_SEARCHES_KEY, JSON.stringify({ version: 1, searches: existing }))
    await importSavedSearches(searches(10, 'imported'))

    const message = screen.getByTestId('import-error-message').textContent ?? ''
    expect(message).toContain(`保存できる検索条件は ${MAX_SAVED_SEARCHES} 件まで`)
    expect(message).not.toContain('✅ 保存した検索条件')
    expect(toasts.some((toast) => toast.type === 'success')).toBe(false)
    expect(reload).not.toHaveBeenCalled()
    const stored = JSON.parse(localStorage.getItem(SAVED_SEARCHES_KEY) ?? '{}') as { searches: SavedSearch[] }
    expect(stored.searches.map((s) => s.name)).toEqual(existing.map((s) => s.name))
  })

  it('ファイルそのものが上限を超える件数を持つときも、切り捨てて成功とせず、失敗として示す', async () => {
    await importSavedSearches(searches(MAX_SAVED_SEARCHES + 10, 'imported'))

    const message = screen.getByTestId('import-error-message').textContent ?? ''
    expect(message).toContain(`保存できる検索条件は ${MAX_SAVED_SEARCHES} 件まで`)
    expect(toasts.some((toast) => toast.type === 'success')).toBe(false)
    expect(reload).not.toHaveBeenCalled()
    expect(localStorage.getItem(SAVED_SEARCHES_KEY)).toBeNull()
  })

  it('ブラウザに保存できなければ、失敗として示す', async () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new DOMException('quota', 'QuotaExceededError')
    })
    await importSavedSearches(searches(2, 'imported'))

    expect(screen.getByTestId('import-error-message').textContent).toContain('ブラウザに保存できませんでした')
    expect(toasts.some((toast) => toast.type === 'success')).toBe(false)
    expect(reload).not.toHaveBeenCalled()
  })

  it('上限に収まって保存できれば、これまでどおり成功として取り込む', async () => {
    await importSavedSearches(searches(3, 'imported'))
    expect(toasts.some((toast) => toast.type === 'success')).toBe(true)
    const stored = JSON.parse(localStorage.getItem(SAVED_SEARCHES_KEY) ?? '{}') as { searches: SavedSearch[] }
    expect(stored.searches).toHaveLength(3)
  })
})
