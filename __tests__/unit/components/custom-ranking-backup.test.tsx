import React from 'react'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { CustomRankingBackup } from '@/components/custom-ranking-backup'
import { vi } from 'vitest'
import type { CustomRankingWithConditions } from '@/lib/storage/types'

// モック
let mockCustomRankings: CustomRankingWithConditions[]

vi.mock('@/hooks/use-custom-rankings', () => ({
  useCustomRankings: () => ({
    rankings: mockCustomRankings
  })
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

describe('CustomRankingBackup Component', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    
    // モックデータの初期化
    mockCustomRankings = [
      {
        id: 'ranking1',
        title: 'ボカロ新曲',
        baseGenre: 'vocaloid' as const,
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
      },
      {
        id: 'ranking2',
        title: 'ゲーム実況',
        baseGenre: 'game' as const,
        conditions: [
          {
            tag: '実況プレイ',
            operator: 'include' as const,
            tagType: 'locked' as const,
            orderIndex: 0
          }
        ],
        createdAt: 1704067200000,
        updatedAt: 1704067200000
      }
    ]
  })

  describe('エクスポート機能', () => {
    it('エクスポート確認ダイアログが表示される', async () => {
      render(<CustomRankingBackup />)
      
      const exportButton = screen.getByTestId('export-custom-ranking-button')
      fireEvent.click(exportButton)
      
      await waitFor(() => {
        expect(screen.getByTestId('export-confirm-dialog')).toBeInTheDocument()
        expect(screen.getByText('カスタムランキングデータをエクスポート')).toBeInTheDocument()
      })
    })

    it('エクスポート確認ダイアログにランキング情報が表示される', async () => {
      render(<CustomRankingBackup />)
      
      const exportButton = screen.getByTestId('export-custom-ranking-button')
      fireEvent.click(exportButton)
      
      await waitFor(() => {
        expect(screen.getByText('カスタムランキング数:')).toBeInTheDocument()
        expect(screen.getByText('2件')).toBeInTheDocument()
        expect(screen.getByText(/ボカロ新曲/)).toBeInTheDocument()
        expect(screen.getByText(/ゲーム実況/)).toBeInTheDocument()
      })
    })

    it('エクスポートをキャンセルできる', async () => {
      render(<CustomRankingBackup />)
      
      const exportButton = screen.getByTestId('export-custom-ranking-button')
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
    it('カスタムランキングファイルをインポートできる', async () => {
      render(<CustomRankingBackup />)
      
      const fileInput = screen.getByTestId('import-file-input')
      const file = new File([JSON.stringify({
        version: 1,
        exportDate: '2025-01-01',
        customRankings: [
          {
            id: 'new-ranking',
            title: '新しいランキング',
            baseGenre: 'all',
            conditions: []
          }
        ]
      })], 'custom-rankings.json', { type: 'application/json' })
      
      fireEvent.change(fileInput, { target: { files: [file] } })
      
      await waitFor(() => {
        expect(screen.getByTestId('import-confirm-dialog')).toBeInTheDocument()
        expect(screen.getByText('カスタムランキング数: 1件')).toBeInTheDocument()
      })
    })

    it('重複するタイトルがある場合警告が表示される', async () => {
      render(<CustomRankingBackup />)
      
      const fileInput = screen.getByTestId('import-file-input')
      const file = new File([JSON.stringify({
        version: 1,
        exportDate: '2025-01-01',
        customRankings: [
          {
            id: 'dup-ranking',
            title: 'ボカロ新曲', // 既存と重複
            baseGenre: 'vocaloid',
            conditions: []
          },
          {
            id: 'new-ranking',
            title: '新規ランキング',
            baseGenre: 'all',
            conditions: []
          }
        ]
      })], 'custom-rankings.json', { type: 'application/json' })
      
      fireEvent.change(fileInput, { target: { files: [file] } })
      
      await waitFor(() => {
        expect(screen.getByTestId('import-confirm-dialog')).toBeInTheDocument()
        expect(screen.getByText(/以下のタイトルは既に存在します/)).toBeInTheDocument()
        expect(screen.getByText('ボカロ新曲')).toBeInTheDocument()
      })
    })

    it('無効なファイル形式の場合エラーが表示される', async () => {
      render(<CustomRankingBackup />)
      
      const fileInput = screen.getByTestId('import-file-input')
      const file = new File([JSON.stringify({
        // version と customRankings がない
        data: []
      })], 'invalid.json', { type: 'application/json' })
      
      fireEvent.change(fileInput, { target: { files: [file] } })
      
      await waitFor(() => {
        expect(screen.getByTestId('import-error-message')).toBeInTheDocument()
        expect(screen.getByTestId('import-error-message')).toHaveTextContent('カスタムランキングデータが含まれていません')
      })
    })

    it('インポート確認ダイアログをキャンセルできる', async () => {
      render(<CustomRankingBackup />)
      
      const fileInput = screen.getByTestId('import-file-input')
      const file = new File([JSON.stringify({
        version: 1,
        exportDate: '2025-01-01',
        customRankings: [
          {
            id: 'new',
            title: '新規',
            baseGenre: 'all',
            conditions: []
          }
        ]
      })], 'rankings.json', { type: 'application/json' })
      
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
  })
})
