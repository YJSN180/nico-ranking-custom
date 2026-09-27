import React from 'react'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest'
import { UnifiedBackup } from '@/components/unified-backup'
import { CustomRankingBackup } from '@/components/custom-ranking-backup'
import { GenreOrderBackup } from '@/components/genre-order-backup'

// バックアップファイルの読み込みそのものが失敗したとき（選んだ後にファイルが消えた・読めない等）に、
// 「インポート中」のまま止まらず、知らせてやり直せる状態に戻すことを確かめる。データはすべて合成値。

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

vi.mock('@/hooks/use-custom-rankings', () => ({
  useCustomRankings: () => ({ rankings: [] })
}))

function jsonFile(data: unknown): File {
  return new File([JSON.stringify(data)], 'backup.json', { type: 'application/json' })
}

beforeEach(() => {
  vi.spyOn(FileReader.prototype, 'readAsText').mockImplementation(function (this: FileReader) {
    queueMicrotask(() => this.dispatchEvent(new ProgressEvent('error')))
  })
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('バックアップファイルを読めなかったとき', () => {
  it.each([
    ['まとめてインポート', UnifiedBackup],
    ['カスタムランキング', CustomRankingBackup],
    ['ジャンル並び替え', GenreOrderBackup]
  ])('%s: エラーを出し、もう一度選べる状態に戻す', async (_label, Component) => {
    render(<Component />)
    const input = screen.getByTestId('import-file-input')

    fireEvent.change(input, { target: { files: [jsonFile({ version: 1 })] } })

    await waitFor(() => expect(screen.getByTestId('import-error-message')).toBeInTheDocument())
    expect(input).not.toBeDisabled()
  })
})
