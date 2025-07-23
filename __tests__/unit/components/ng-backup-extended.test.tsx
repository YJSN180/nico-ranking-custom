import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { NGBackup } from '../../../components/ng-backup'
import type { ExtendedUserNGList } from '../../../types/ng-list-extended'

// モック
vi.mock('../../../hooks/use-user-ng-list-extended', () => ({
  useUserNGListExtended: () => ({
    ngList: mockNGList,
    saveNGListDirectly: mockSaveNGList
  })
}))

// グローバル変数でモックデータを管理
let mockNGList: ExtendedUserNGList
let mockSaveNGList: ReturnType<typeof vi.fn>

describe('NGBackup - Extended Features', () => {
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
    
    mockSaveNGList = vi.fn()
  })
  
  describe('エクスポート機能（拡張版）', () => {
    it('should export extended NG list with tags', async () => {
      // Blob と URL.createObjectURL のモック
      const mockCreateObjectURL = vi.fn(() => 'blob:mock-url')
      const mockRevokeObjectURL = vi.fn()
      global.URL.createObjectURL = mockCreateObjectURL
      global.URL.revokeObjectURL = mockRevokeObjectURL
      
      // ダウンロードリンクのクリックをモック
      const mockClick = vi.fn()
      const originalCreateElement = document.createElement.bind(document)
      const createElementSpy = vi.spyOn(document, 'createElement')
        .mockImplementation((tagName) => {
          if (tagName === 'a') {
            const anchor = originalCreateElement('a')
            anchor.click = mockClick
            return anchor
          }
          return originalCreateElement(tagName)
        })
      
      render(<NGBackup />)
      
      const exportButton = screen.getByText('エクスポート')
      fireEvent.click(exportButton)
      
      // ダウンロードが実行されたか確認
      expect(mockCreateObjectURL).toHaveBeenCalled()
      expect(mockClick).toHaveBeenCalled()
      
      // Blobの内容を確認
      const blobCall = mockCreateObjectURL.mock.calls[0][0] as Blob
      const exportedData = JSON.parse(await blobCall.text())
      
      expect(exportedData).toMatchObject({
        version: '1.1.0', // 拡張版のバージョン
        exportSource: 'settings-applied',
        ngList: {
          version: 2,
          videoIds: ['sm1', 'sm2'],
          tags: {
            locked: { exact: ['ゲーム'], partial: ['実況'] },
            user: { exact: ['歌ってみた'], partial: ['カバー'] },
            both: { exact: ['音楽'], partial: ['BGM'] }
          }
        },
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
          }
        }
      })
      
      createElementSpy.mockRestore()
    })
  })

  describe('インポート機能（拡張版）', () => {
    it('should import extended NG list with tags', async () => {
      const fileInput = document.createElement('input')
      fileInput.type = 'file'
      
      const originalCreateElement = document.createElement.bind(document)
      const createElementSpy = vi.spyOn(document, 'createElement')
        .mockImplementation((tagName) => {
          if (tagName === 'input') {
            return fileInput
          }
          return originalCreateElement(tagName)
        })
      
      render(<NGBackup />)
      
      const importButton = screen.getByText('インポート')
      
      // FileReaderのモック
      const mockFileReader = {
        readAsText: vi.fn(),
        onload: null as any,
        onerror: null as any
      }
      
      vi.spyOn(window, 'FileReader').mockImplementation(() => mockFileReader as any)
      
      // インポートファイルのデータ（拡張版）
      const importData = {
        version: '1.1.0',
        exportDate: '2025-01-02T00:00:00Z',
        exportSource: 'settings-applied',
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
      
      const file = new File(
        [JSON.stringify(importData)],
        'ng-list-backup.json',
        { type: 'application/json' }
      )
      
      // ファイル選択をシミュレート
      fireEvent.click(importButton)
      
      // changeイベントをディスパッチ
      Object.defineProperty(fileInput, 'files', {
        value: [file],
        writable: false
      })
      
      fireEvent.change(fileInput)
      
      // FileReaderのonloadを実行
      await waitFor(() => {
        expect(mockFileReader.readAsText).toHaveBeenCalledWith(file)
      })
      
      // onloadコールバックを実行
      mockFileReader.onload!({ target: { result: JSON.stringify(importData) } } as any)
      
      // NGリストが保存されたか確認
      await waitFor(() => {
        expect(mockSaveNGList).toHaveBeenCalledWith(importData.ngList)
      })
      
      createElementSpy.mockRestore()
    })
    
    it('should handle backward compatibility with v1.0.0 format', async () => {
      const fileInput = document.createElement('input')
      fileInput.type = 'file'
      
      const originalCreateElement = document.createElement.bind(document)
      const createElementSpy = vi.spyOn(document, 'createElement')
        .mockImplementation((tagName) => {
          if (tagName === 'input') {
            return fileInput
          }
          return originalCreateElement(tagName)
        })
      
      render(<NGBackup />)
      
      const importButton = screen.getByText('インポート')
      
      // FileReaderのモック
      const mockFileReader = {
        readAsText: vi.fn(),
        onload: null as any,
        onerror: null as any
      }
      
      vi.spyOn(window, 'FileReader').mockImplementation(() => mockFileReader as any)
      
      // 旧バージョン（v1.0.0）のデータ
      const oldVersionData = {
        version: '1.0.0',
        exportDate: '2025-01-01T00:00:00Z',
        exportSource: 'settings-applied',
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
      
      const file = new File(
        [JSON.stringify(oldVersionData)],
        'ng-list-backup-old.json',
        { type: 'application/json' }
      )
      
      // ファイル選択をシミュレート
      fireEvent.click(importButton)
      
      Object.defineProperty(fileInput, 'files', {
        value: [file],
        writable: false
      })
      
      fireEvent.change(fileInput)
      
      // FileReaderのonloadを実行
      await waitFor(() => {
        expect(mockFileReader.readAsText).toHaveBeenCalledWith(file)
      })
      
      mockFileReader.onload!({ target: { result: JSON.stringify(oldVersionData) } } as any)
      
      // マイグレーション後のデータで保存されることを確認
      await waitFor(() => {
        expect(mockSaveNGList).toHaveBeenCalledWith(
          expect.objectContaining({
            videoIds: ['sm1'],
            videoTitles: { exact: ['Title'], partial: [] },
            authorIds: ['author1'],
            authorNames: { exact: [], partial: [] },
            tags: {
              locked: { exact: [], partial: [] },
              user: { exact: [], partial: [] },
              both: { exact: [], partial: [] }
            },
            version: 2 // マイグレーション後のバージョン
          })
        )
      })
      
      createElementSpy.mockRestore()
    })
  })
  
  describe('メタデータ計算', () => {
    it('should calculate correct metadata for extended NG list', async () => {
      const mockCreateObjectURL = vi.fn(() => 'blob:mock-url')
      global.URL.createObjectURL = mockCreateObjectURL
      
      render(<NGBackup />)
      
      const exportButton = screen.getByText('エクスポート')
      fireEvent.click(exportButton)
      
      const blobCall = mockCreateObjectURL.mock.calls[0][0] as Blob
      const exportedData = JSON.parse(await blobCall.text())
      
      // カテゴリ別の内訳が正しいか確認
      expect(exportedData.metadata.categoryBreakdown).toEqual({
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
      })
      
      // 総数が正しいか確認
      expect(exportedData.metadata.totalItems).toBe(12)
    })
  })
})