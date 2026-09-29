import React from 'react'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest'
import { UnifiedBackup } from '@/components/unified-backup'
import { CustomRankingBackup } from '@/components/custom-ranking-backup'
import { GenreOrderBackup } from '@/components/genre-order-backup'
import { MylistBackup } from '@/components/mylist-backup'
import { NGBackup } from '@/components/ng-backup'

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

afterEach(() => {
  vi.restoreAllMocks()
})

describe('大きすぎるファイルを選んだとき', () => {
  function hugeFile(): { file: File; text: ReturnType<typeof vi.fn> } {
    const file = new File(['{}'], 'huge.json', { type: 'application/json' })
    // 中身は小さい合成ファイルで、大きさだけ 60MB に見せる
    Object.defineProperty(file, 'size', { value: 60 * 1024 * 1024 })
    const text = vi.fn(async () => '{}')
    Object.assign(file, { text })
    return { file, text }
  }

  it.each([
    ['まとめてインポート', UnifiedBackup],
    ['カスタムランキング', CustomRankingBackup],
    ['ジャンル並び替え', GenreOrderBackup],
    ['マイリスト', MylistBackup],
    ['NGリスト', NGBackup]
  ])('%s: 読み込まずに知らせる（読み込むとタブが固まる・落ちる）', async (_label, Component) => {
    const readAsText = vi.spyOn(FileReader.prototype, 'readAsText')
    const { file, text } = hugeFile()
    render(<Component />)
    const input = screen.getByTestId('import-file-input')

    fireEvent.change(input, { target: { files: [file] } })

    await waitFor(() => expect(screen.getByTestId('import-error-message').textContent).toContain('大きすぎます'))
    expect(readAsText).not.toHaveBeenCalled()
    expect(text).not.toHaveBeenCalled()
    expect(input).not.toBeDisabled()
  })
})

describe('バックアップファイルを読めなかったとき', () => {
  beforeEach(() => {
    vi.spyOn(FileReader.prototype, 'readAsText').mockImplementation(function (this: FileReader) {
      queueMicrotask(() => this.dispatchEvent(new ProgressEvent('error')))
    })
  })

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
