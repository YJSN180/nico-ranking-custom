import React from 'react'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { UnifiedBackup } from '@/components/unified-backup'
import { vi } from 'vitest'
import type { ExtendedUserNGList } from '@/types/ng-list-extended'
import type { GenreItem } from '@/types/genre-order'
import type { CustomRankingWithConditions } from '@/lib/storage/types'
import type { Mylist, MylistVideo } from '@/types/mylist'

// モックデータ
const mockNGList: ExtendedUserNGList = {
  videoIds: ['sm1', 'sm2'],
  videoTitles: { exact: ['Title1'], partial: ['Partial1'] },
  authorIds: ['author1'],
  authorNames: { exact: ['Author1'], partial: ['Auth1'] },
  tags: {
    locked: { exact: ['ゲーム'], partial: ['実況'] },
    user: { exact: ['歌ってみた'], partial: ['カバー'] },
    both: { exact: ['音楽'], partial: ['BGM'] }
  },
  version: 2,
  totalCount: 12,
  updatedAt: '2025-01-01T00:00:00Z'
}

const mockGenreOrderItems: GenreItem[] = [
  { id: 'all', name: 'すべて', isVisible: true, order: 0 },
  { id: 'vocaloid', name: 'VOCALOID', isVisible: true, order: 1 }
]

const mockCustomRankings: CustomRankingWithConditions[] = [
  {
    id: 'ranking1',
    title: 'テストランキング',
    baseGenre: 'all' as const,
    conditions: [
      {
        tag: '初投稿',
        operator: 'include' as const,
        tagType: 'user' as const,
        orderIndex: 0
      }
    ],
    createdAt: 1704067200000,
    updatedAt: 1704067200000
  }
]

const mockMylists: Mylist[] = [
  {
    id: 'mylist1',
    name: 'お気に入り',
    description: 'お気に入りの動画',
    isPublic: true,
    createdAt: '2025-01-01T00:00:00Z',
    updatedAt: '2025-01-01T00:00:00Z',
    itemCount: 2
  }
]

const mockMylistVideos: MylistVideo[] = [
  {
    mylistId: 'mylist1',
    videoId: 'sm1234',
    title: 'テスト動画',
    addedAt: '2025-01-01T00:00:00Z',
    memo: 'テストメモ'
  }
]

// モックセットアップ
vi.mock('@/hooks/use-user-ng-list-extended', () => ({
  useUserNGListExtended: () => ({
    ngList: { 
      videoIds: [], 
      videoTitles: { exact: [], partial: [] },
      authorIds: [],
      authorNames: { exact: [], partial: [] },
      version: 2,
      totalCount: 0,
      updatedAt: '2025-01-01T00:00:00Z'
    }
  })
}))

vi.mock('@/hooks/use-genre-order-v2', () => ({
  useGenreOrderV2: () => ({ items: [] })
}))

vi.mock('@/hooks/use-custom-rankings', () => ({
  useCustomRankings: () => ({ rankings: [] })
}))

vi.mock('@/lib/storage/db-manager', () => ({
  DBManager: vi.fn().mockImplementation(() => ({
    init: vi.fn(),
    getDB: vi.fn(() => ({}))
  }))
}))

vi.mock('@/lib/storage/custom-rankings', () => ({
  CustomRankingManager: vi.fn().mockImplementation(() => ({
    createRanking: vi.fn(),
    updateRanking: vi.fn()
  }))
}))

vi.mock('@/lib/storage/ng-backup-extended', () => ({
  exportExtendedNGListData: vi.fn(),
  importExtendedNGListData: vi.fn().mockResolvedValue({
    success: true,
    imported: { totalItems: 10 }
  }),
  detectExtendedConflicts: vi.fn(() => ({
    hasConflicts: false,
    conflicts: {}
  }))
}))

vi.mock('@/lib/storage/backup', () => ({
  exportMylistData: vi.fn(),
  importMylistData: vi.fn(() => ({
    success: true,
    created: { mylists: 1, videos: 1 }
  })),
  detectMylistConflicts: vi.fn(() => ({
    hasConflicts: false,
    conflicts: {}
  }))
}))

describe('バックアップファイルの相互互換性', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    // window.location.reload をモック
    Object.defineProperty(window, 'location', {
      value: { reload: vi.fn() },
      writable: true
    })
    // window.confirm をモック
    window.confirm = vi.fn(() => false)
  })

  describe('個別バックアップファイルの統合インポート', () => {
    it('NGリストの個別バックアップを統合バックアップでインポートできる', async () => {
      render(<UnifiedBackup />)
      
      // NGリストのみのバックアップファイル
      const ngBackupFile = new File([JSON.stringify({
        ngList: mockNGList,
        metadata: {
          exportDate: '2025-01-01T00:00:00Z',
          appVersion: '1.0.0'
        },
        version: 2
      })], 'ng-list-backup.json', { type: 'application/json' })
      
      const fileInput = screen.getByTestId('import-file-input')
      fireEvent.change(fileInput, { target: { files: [ngBackupFile] } })
      
      await waitFor(() => {
        expect(screen.getByTestId('import-confirm-dialog')).toBeInTheDocument()
        expect(screen.getByText('✅ NGリスト')).toBeInTheDocument()
        // 他のデータは含まれていないことを確認
        expect(screen.queryByText('✅ ジャンル並び替え')).not.toBeInTheDocument()
        expect(screen.queryByText('✅ カスタムランキング')).not.toBeInTheDocument()
        expect(screen.queryByText('✅ マイリスト')).not.toBeInTheDocument()
      })
      
      // インポート実行
      const importButton = screen.getByText('インポート実行')
      fireEvent.click(importButton)
      
      await waitFor(() => {
        expect(screen.getByTestId('import-success-message')).toBeInTheDocument()
      })
    })

    it('ジャンル並び替えの個別バックアップを統合バックアップでインポートできる', async () => {
      render(<UnifiedBackup />)
      
      // ジャンル並び替えのみのバックアップファイル（個別バックアップ形式）
      const genreBackupFile = new File([JSON.stringify({
        genreOrder: mockGenreOrderItems
      })], 'genre-order-backup.json', { type: 'application/json' })
      
      const fileInput = screen.getByTestId('import-file-input')
      fireEvent.change(fileInput, { target: { files: [genreBackupFile] } })
      
      await waitFor(() => {
        expect(screen.getByTestId('import-confirm-dialog')).toBeInTheDocument()
        const confirmDialog = screen.getByTestId('import-confirm-dialog')
        expect(confirmDialog.textContent).toContain('✅ ジャンル並び替え')
        // 他のデータは含まれていないことを確認
        expect(confirmDialog.textContent).not.toContain('✅ NGリスト')
        expect(confirmDialog.textContent).not.toContain('✅ カスタムランキング')
        expect(confirmDialog.textContent).not.toContain('✅ マイリスト')
      })
    })

    it('カスタムランキングの個別バックアップを統合バックアップでインポートできる', async () => {
      render(<UnifiedBackup />)
      
      // カスタムランキングのみのバックアップファイル
      const customRankingFile = new File([JSON.stringify({
        version: 1,
        exportDate: '2025-01-01',
        customRankings: mockCustomRankings
      })], 'custom-rankings-backup.json', { type: 'application/json' })
      
      const fileInput = screen.getByTestId('import-file-input')
      fireEvent.change(fileInput, { target: { files: [customRankingFile] } })
      
      await waitFor(() => {
        expect(screen.getByTestId('import-confirm-dialog')).toBeInTheDocument()
        expect(screen.getByText('✅ カスタムランキング')).toBeInTheDocument()
        // 他のデータは含まれていないことを確認
        expect(screen.queryByText('✅ NGリスト')).not.toBeInTheDocument()
        expect(screen.queryByText('✅ ジャンル並び替え')).not.toBeInTheDocument()
        expect(screen.queryByText('✅ マイリスト')).not.toBeInTheDocument()
      })
    })

    it('マイリストの個別バックアップを統合バックアップでインポートできる', async () => {
      render(<UnifiedBackup />)
      
      // マイリストのみのバックアップファイル
      const mylistBackupFile = new File([JSON.stringify({
        version: '1.0.0',
        exportDate: '2025-01-01T00:00:00Z',
        mylists: mockMylists,
        mylistVideos: mockMylistVideos,
        metadata: {
          totalMylists: 1,
          totalVideos: 1,
          appVersion: '1.0.0'
        }
      })], 'mylist-backup.json', { type: 'application/json' })
      
      const fileInput = screen.getByTestId('import-file-input')
      fireEvent.change(fileInput, { target: { files: [mylistBackupFile] } })
      
      await waitFor(() => {
        expect(screen.getByTestId('import-confirm-dialog')).toBeInTheDocument()
        expect(screen.getByText('✅ マイリスト')).toBeInTheDocument()
        // 他のデータは含まれていないことを確認
        expect(screen.queryByText('✅ NGリスト')).not.toBeInTheDocument()
        expect(screen.queryByText('✅ ジャンル並び替え')).not.toBeInTheDocument()
        expect(screen.queryByText('✅ カスタムランキング')).not.toBeInTheDocument()
      })
    })
  })

  describe('複数の個別バックアップファイルの組み合わせ', () => {
    it('複数種類のデータを含むバックアップファイルを正しく認識する', async () => {
      render(<UnifiedBackup />)
      
      // 統合バックアップ形式のファイル
      const mixedBackupFile = new File([JSON.stringify({
        version: 1,
        exportDate: '2025-01-01T00:00:00Z',
        appVersion: '1.0.0',
        data: {
          ngList: {
            ngList: mockNGList,
            metadata: {
              exportDate: '2025-01-01T00:00:00Z',
              appVersion: '1.0.0'
            },
            version: 2
          },
          genreOrder: mockGenreOrderItems
        }
      })], 'mixed-backup.json', { type: 'application/json' })
      
      const fileInput = screen.getByTestId('import-file-input')
      fireEvent.change(fileInput, { target: { files: [mixedBackupFile] } })
      
      await waitFor(() => {
        expect(screen.getByTestId('import-confirm-dialog')).toBeInTheDocument()
        const confirmDialog = screen.getByTestId('import-confirm-dialog')
        expect(confirmDialog.textContent).toContain('✅ NGリスト')
        expect(confirmDialog.textContent).toContain('✅ ジャンル並び替え')
        // 含まれていないデータ
        expect(confirmDialog.textContent).not.toContain('✅ カスタムランキング')
        expect(confirmDialog.textContent).not.toContain('✅ マイリスト')
      })
    })
  })

  describe('エラーハンドリング', () => {
    it('不正な形式のファイルは適切にエラー表示される', async () => {
      render(<UnifiedBackup />)
      
      // 完全に不正な形式
      const invalidFile = new File([
        'これはJSONではありません'
      ], 'invalid.json', { type: 'application/json' })
      
      const fileInput = screen.getByTestId('import-file-input')
      fireEvent.change(fileInput, { target: { files: [invalidFile] } })
      
      await waitFor(() => {
        expect(screen.getByTestId('import-error-message')).toBeInTheDocument()
        // JSON.parseのエラーメッセージが表示される
        const errorMessage = screen.getByTestId('import-error-message')
        expect(errorMessage.textContent).toContain('Unexpected token')
      })
    })

    it('空のデータファイルは適切にエラー表示される', async () => {
      render(<UnifiedBackup />)
      
      // 有効なJSONだがデータが空
      const emptyFile = new File([JSON.stringify({})], 'empty.json', { type: 'application/json' })
      
      const fileInput = screen.getByTestId('import-file-input')
      fireEvent.change(fileInput, { target: { files: [emptyFile] } })
      
      await waitFor(() => {
        expect(screen.getByTestId('import-error-message')).toBeInTheDocument()
        const errorMessage = screen.getByTestId('import-error-message')
        // 認識できないバックアップファイル形式ですというエラーが表示される
        expect(errorMessage.textContent).toContain('認識できないバックアップファイル形式です')
      })
    })
  })
})