import React from 'react'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { UnifiedBackup } from '@/components/unified-backup'
import { vi } from 'vitest'
import type { ExtendedUserNGList } from '@/types/ng-list-extended'
import type { GenreItem } from '@/types/genre-order'
import type { CustomRankingWithConditions } from '@/lib/storage/types'

// グローバル変数でモックデータを管理
let mockNGList: ExtendedUserNGList
let mockGenreOrderItems: GenreItem[]
let mockCustomRankings: CustomRankingWithConditions[]

// モック
vi.mock('@/hooks/use-user-ng-list-extended', () => ({
  useUserNGListExtended: () => ({
    ngList: mockNGList
  })
}))

vi.mock('@/hooks/use-genre-order-v2', () => ({
  useGenreOrderV2: () => ({
    items: mockGenreOrderItems
  })
}))

vi.mock('@/hooks/use-custom-rankings', () => ({
  useCustomRankings: () => ({
    rankings: mockCustomRankings
  })
}))

vi.mock('@/lib/storage/ng-backup-extended', () => ({
  exportExtendedNGListData: vi.fn(() => ({
    ngList: mockNGList,
    metadata: { exportDate: '2025-01-01' },
    version: 2
  })),
  importExtendedNGListData: vi.fn(() => ({
    success: true,
    imported: { totalItems: 10 }
  })),
  detectExtendedConflicts: vi.fn(() => ({
    hasConflicts: false,
    conflicts: {}
  }))
}))

vi.mock('@/lib/storage/backup', () => ({
  exportMylistData: vi.fn(() => ({
    version: '1.0.0',
    exportDate: '2025-01-01',
    mylists: [],
    mylistVideos: [],
    metadata: { totalMylists: 0, totalVideos: 0, appVersion: '1.0.0' }
  })),
  importMylistData: vi.fn(() => ({
    success: true,
    created: { mylists: 0, videos: 0 }
  })),
  detectMylistConflicts: vi.fn(() => ({
    hasConflicts: false,
    conflicts: {}
  }))
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

describe('UnifiedBackup Component', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    
    // モックデータの初期化
    mockNGList = {
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
    
    mockGenreOrderItems = [
      { id: 'all', name: 'すべて', isVisible: true, order: 0 },
      { id: 'vocaloid', name: 'VOCALOID', isVisible: true, order: 1 }
    ]
    
    mockCustomRankings = [
      {
        id: 'ranking1',
        title: 'テストランキング',
        baseGenre: 'all' as const,
        conditions: [],
        createdAt: 1704067200000,
        updatedAt: 1704067200000
      }
    ]
  })

  describe('エクスポート機能', () => {
    it('エクスポート確認ダイアログが表示される', async () => {
      render(<UnifiedBackup />)
      
      const exportButton = screen.getByTestId('export-unified-button')
      fireEvent.click(exportButton)
      
      await waitFor(() => {
        expect(screen.getByTestId('export-confirm-dialog')).toBeInTheDocument()
        expect(screen.getByText('統合バックアップをエクスポート')).toBeInTheDocument()
      })
    })

    it('エクスポート確認ダイアログに統計情報が表示される', async () => {
      render(<UnifiedBackup />)
      
      const exportButton = screen.getByTestId('export-unified-button')
      fireEvent.click(exportButton)
      
      await waitFor(() => {
        expect(screen.getByText('NGリスト:')).toBeInTheDocument()
        expect(screen.getByText('12件')).toBeInTheDocument()
        expect(screen.getByText('ジャンル並び替え:')).toBeInTheDocument()
        expect(screen.getByText('2件')).toBeInTheDocument()
        expect(screen.getByText('カスタムランキング:')).toBeInTheDocument()
        expect(screen.getByText('1件')).toBeInTheDocument()
      })
    })

    it('エクスポートをキャンセルできる', async () => {
      render(<UnifiedBackup />)
      
      const exportButton = screen.getByTestId('export-unified-button')
      fireEvent.click(exportButton)
      
      await waitFor(() => {
        expect(screen.getByTestId('export-confirm-dialog')).toBeInTheDocument()
      })
      
      const cancelButton = screen.getByText('キャンセル')
      fireEvent.click(cancelButton)
      
      await waitFor(() => {
        expect(screen.queryByTestId('export-confirm-dialog')).not.toBeInTheDocument()
      })
    })
  })

  describe('インポート機能', () => {
    it('統合バックアップファイルをインポートできる', async () => {
      render(<UnifiedBackup />)
      
      const fileInput = screen.getByTestId('import-file-input')
      const file = new File([JSON.stringify({
        version: 1,
        exportDate: '2025-01-01',
        appVersion: '1.0.0',
        data: {
          ngList: mockNGList,
          genreOrder: mockGenreOrderItems,
          customRankings: mockCustomRankings
        }
      })], 'backup.json', { type: 'application/json' })
      
      fireEvent.change(fileInput, { target: { files: [file] } })
      
      await waitFor(() => {
        expect(screen.getByTestId('import-confirm-dialog')).toBeInTheDocument()
        expect(screen.getByText('含まれるデータ:')).toBeInTheDocument()
        expect(screen.getByText('✅ NGリスト')).toBeInTheDocument()
        expect(screen.getByText('✅ ジャンル並び替え')).toBeInTheDocument()
        expect(screen.getByText('✅ カスタムランキング')).toBeInTheDocument()
      })
    })

    it('個別バックアップファイルも統合形式として認識される', async () => {
      render(<UnifiedBackup />)
      
      const fileInput = screen.getByTestId('import-file-input')
      const file = new File([JSON.stringify({
        genreOrder: mockGenreOrderItems
      })], 'genre-order.json', { type: 'application/json' })
      
      fireEvent.change(fileInput, { target: { files: [file] } })
      
      await waitFor(() => {
        expect(screen.getByTestId('import-confirm-dialog')).toBeInTheDocument()
        expect(screen.getByText('✅ ジャンル並び替え')).toBeInTheDocument()
      })
    })

    it('インポートをキャンセルできる', async () => {
      render(<UnifiedBackup />)
      
      const fileInput = screen.getByTestId('import-file-input')
      const file = new File([JSON.stringify({
        version: 1,
        exportDate: '2025-01-01',
        appVersion: '1.0.0',
        data: { ngList: mockNGList }
      })], 'backup.json', { type: 'application/json' })
      
      fireEvent.change(fileInput, { target: { files: [file] } })
      
      await waitFor(() => {
        expect(screen.getByTestId('import-confirm-dialog')).toBeInTheDocument()
      })
      
      const cancelButton = screen.getByText('キャンセル')
      fireEvent.click(cancelButton)
      
      await waitFor(() => {
        expect(screen.queryByTestId('import-confirm-dialog')).not.toBeInTheDocument()
      })
    })

    it('無効なファイル形式の場合エラーが表示される', async () => {
      render(<UnifiedBackup />)
      
      const fileInput = screen.getByTestId('import-file-input')
      const file = new File(['invalid json'], 'backup.json', { type: 'application/json' })
      
      fireEvent.change(fileInput, { target: { files: [file] } })
      
      await waitFor(() => {
        expect(screen.getByTestId('import-error-message')).toBeInTheDocument()
      })
    })

    it('インポート可能なデータがない場合エラーが表示される', async () => {
      render(<UnifiedBackup />)
      
      const fileInput = screen.getByTestId('import-file-input')
      const file = new File([JSON.stringify({
        version: 1,
        exportDate: '2025-01-01',
        appVersion: '1.0.0',
        data: {}
      })], 'backup.json', { type: 'application/json' })
      
      fireEvent.change(fileInput, { target: { files: [file] } })
      
      await waitFor(() => {
        expect(screen.getByTestId('import-error-message')).toBeInTheDocument()
        expect(screen.getByText('インポート可能なデータが含まれていません')).toBeInTheDocument()
      })
    })
  })
})