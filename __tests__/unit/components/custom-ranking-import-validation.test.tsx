import React from 'react'
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react'
import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest'
import { CustomRankingBackup } from '@/components/custom-ranking-backup'
import { UnifiedBackup } from '@/components/unified-backup'

// カスタムランキングの取り込みで、そのまま保存すると表示時に落ちる・効かない条件を受け付けないことを確かめる。
// 例: tag が数値だと lib/custom-ranking-filter.ts の toLowerCase で落ちる。データはすべて合成値。

const createRanking = vi.fn()
const updateRanking = vi.fn()

vi.mock('@/hooks/use-custom-rankings', () => ({
  useCustomRankings: () => ({ rankings: [] })
}))

vi.mock('@/hooks/use-user-ng-list-extended', () => ({
  useUserNGListExtended: () => ({
    ngList: {
      videoIds: [],
      videoTitles: { exact: [], partial: [] },
      authorIds: [],
      authorNames: { exact: [], partial: [] },
      version: 2,
      totalCount: 0,
      updatedAt: '2026-01-01T00:00:00Z'
    }
  })
}))

vi.mock('@/hooks/use-genre-order-v2', () => ({
  useGenreOrderV2: () => ({ items: [] })
}))

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

function jsonFile(data: unknown): File {
  return new File([JSON.stringify(data)], 'backup.json', { type: 'application/json' })
}

function rankingWith(overrides: Record<string, unknown>): Record<string, unknown> {
  return {
    id: 'ranking-synthetic-1',
    title: '合成ランキング',
    baseGenre: 'game',
    conditions: [{ tag: '合成タグ', operator: 'AND', tagType: 'both', orderIndex: 0 }],
    ...overrides
  }
}

async function selectCustomRankingFile(data: unknown): Promise<void> {
  render(<CustomRankingBackup />)
  fireEvent.change(screen.getByTestId('import-file-input'), { target: { files: [jsonFile(data)] } })
}

beforeEach(() => {
  vi.clearAllMocks()
  createRanking.mockResolvedValue('created-id')
  delete (window as Partial<Window>).location
  window.location = { ...originalLocation, reload: vi.fn() } as Location
})

afterEach(() => {
  window.location = originalLocation
  vi.useRealTimers()
})

describe('カスタムランキングのインポート（個別ファイル）', () => {
  it.each([
    ['タグが数値', { conditions: [{ tag: 123, operator: 'AND', tagType: 'both' }] }],
    ['タグが空白だけ', { conditions: [{ tag: '  ', operator: 'AND', tagType: 'both' }] }],
    ['演算子が AND/OR/NOT 以外', { conditions: [{ tag: '合成タグ', operator: 'XOR', tagType: 'both' }] }],
    ['タグ種別が lock/user/both 以外', { conditions: [{ tag: '合成タグ', operator: 'AND', tagType: 'all' }] }],
    ['ベースのジャンルが存在しない', { baseGenre: 'synthetic-genre' }],
    ['条件が配列でない', { conditions: 'AND 合成タグ' }]
  ])('%s のファイルは取り込まない', async (_label, overrides) => {
    await selectCustomRankingFile({ version: 1, exportDate: '2026-01-01', customRankings: [rankingWith(overrides)] })

    await waitFor(() => expect(screen.getByTestId('import-error-message')).toBeInTheDocument())
    expect(screen.queryByTestId('import-confirm-dialog')).toBeNull()
    expect(createRanking).not.toHaveBeenCalled()
  })

  it('正しい形のファイルは、条件をそろえて取り込む', async () => {
    await selectCustomRankingFile({
      version: 1,
      exportDate: '2026-01-01',
      customRankings: [rankingWith({ conditions: [{ tag: '合成タグ', operator: 'OR', tagType: 'lock', orderIndex: 5 }] })]
    })
    await waitFor(() => expect(screen.getByTestId('import-confirm-dialog')).toBeInTheDocument())

    vi.useFakeTimers()
    await act(async () => {
      fireEvent.click(screen.getByText('インポート実行'))
    })

    expect(createRanking).toHaveBeenCalledWith({
      title: '合成ランキング',
      baseGenre: 'game',
      conditions: [{ tag: '合成タグ', operator: 'OR', tagType: 'lock', orderIndex: 0 }]
    })
  })
})

describe('カスタムランキングのインポート（まとめてインポート）', () => {
  it('タグが数値のランキングを含むときは保存せず、失敗として知らせる', async () => {
    render(<UnifiedBackup />)
    fireEvent.change(screen.getByTestId('import-file-input'), {
      target: {
        files: [
          jsonFile({
            version: 1,
            exportDate: '2026-01-01',
            appVersion: '1.0.0',
            data: { customRankings: [rankingWith({ conditions: [{ tag: 123, operator: 'AND', tagType: 'both' }] })] }
          })
        ]
      }
    })
    await waitFor(() => expect(screen.getByTestId('import-confirm-dialog')).toBeInTheDocument())

    vi.useFakeTimers()
    await act(async () => {
      fireEvent.click(screen.getByText('インポート実行'))
    })

    expect(createRanking).not.toHaveBeenCalled()
    expect(screen.getByTestId('import-error-message').textContent).toContain('カスタムランキング')
  })
})
