/**
 * Backup and restore functionality unit tests
 * Safari対策のバックアップ・リストア機能をユニットテストでカバー
 */

import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest'
import { DBManager } from '@/lib/storage/db-manager'
import {
  exportMylistData,
  validateBackupData,
  importMylistData,
  downloadBackupData,
  readBackupFile,
  type BackupData
} from '@/lib/storage/backup'
import type { Mylist, MylistVideo } from '@/lib/storage/types'

// DBManager のモック
vi.mock('@/lib/storage/db-manager')

// DOM API のモック
const mockCreateElement = vi.fn()
const mockClick = vi.fn()
const mockRevokeObjectURL = vi.fn()
const mockCreateObjectURL = vi.fn().mockReturnValue('blob:mock-url')

// ブラウザ API のモック
beforeEach(() => {
  // モックをリセット
  vi.clearAllMocks()
  
  // モックの戻り値を再設定
  mockCreateObjectURL.mockReturnValue('blob:mock-url')
  
  // URL API のモック
  Object.defineProperty(global, 'URL', {
    value: {
      createObjectURL: mockCreateObjectURL,
      revokeObjectURL: mockRevokeObjectURL
    },
    writable: true,
    configurable: true
  })
  
  // document のモック
  Object.defineProperty(global, 'document', {
    value: {
      createElement: mockCreateElement.mockImplementation((tagName) => {
        if (tagName === 'a') {
          return {
            href: '',
            download: '',
            click: mockClick
          }
        }
        return {}
      })
    },
    writable: true,
    configurable: true
  })
  
  // FileReader のモック
  Object.defineProperty(global, 'FileReader', {
    value: class MockFileReader {
      onload: ((event: any) => void) | null = null
      onerror: ((event: any) => void) | null = null
      result: string | null = null
      
      readAsText(file: File) {
        // 非同期でonloadを呼び出す
        setTimeout(() => {
          if (this.onload) {
            this.onload({ target: { result: this.result } })
          }
        }, 0)
      }
    },
    writable: true,
    configurable: true
  })
  
  // Blob のモック
  Object.defineProperty(global, 'Blob', {
    value: class MockBlob {
      constructor(public parts: any[], public options: any) {}
    },
    writable: true,
    configurable: true
  })
  
  // File のモック
  Object.defineProperty(global, 'File', {
    value: class MockFile {
      constructor(public parts: any[], public name: string, public options: any) {}
    },
    writable: true,
    configurable: true
  })
  
  vi.clearAllMocks()
})

afterEach(() => {
  vi.restoreAllMocks()
})

// テストデータ
const mockMylists: Mylist[] = [
  {
    id: 'test-mylist-1',
    name: 'テストマイリスト1',
    description: 'テスト用のマイリストです',
    videoCount: 2,
    createdAt: 1640995200000, // 2022-01-01T00:00:00.000Z
    updatedAt: 1640995200000
  },
  {
    id: 'test-mylist-2', 
    name: 'テストマイリスト2',
    description: '',
    videoCount: 1,
    createdAt: 1640995200000,
    updatedAt: 1640995200000
  }
]

const mockMylistVideos: MylistVideo[] = [
  {
    mylistId: 'test-mylist-1',
    videoId: 'sm12345',
    addedAt: 1640995200000
  },
  {
    mylistId: 'test-mylist-1',
    videoId: 'sm67890',
    addedAt: 1640995200000
  },
  {
    mylistId: 'test-mylist-2',
    videoId: 'sm11111',
    addedAt: 1640995200000
  }
]

const validBackupData: BackupData = {
  version: '1.0.0',
  exportDate: '2023-12-01T00:00:00.000Z',
  mylists: mockMylists,
  mylistVideos: mockMylistVideos,
  metadata: {
    totalMylists: 2,
    totalVideos: 3,
    appVersion: '1.0.0'
  }
}

describe('Export Mylist Data Tests', () => {
  it('should export mylist data successfully', async () => {
    // DBManager のモック設定
    const mockDB = {
      transaction: vi.fn().mockReturnValue({
        objectStore: vi.fn((storeName) => ({
          getAll: vi.fn().mockResolvedValue(
            storeName === 'mylists' ? mockMylists : mockMylistVideos
          )
        })),
        done: Promise.resolve()
      })
    }
    
    const mockDBManager = {
      init: vi.fn().mockResolvedValue(undefined),
      getDB: vi.fn().mockReturnValue(mockDB)
    }
    
    vi.mocked(DBManager).mockImplementation(() => mockDBManager as any)
    
    const result = await exportMylistData()
    
    expect(result).toMatchObject({
      version: '1.0.0',
      mylists: mockMylists,
      mylistVideos: mockMylistVideos,
      metadata: {
        totalMylists: 2,
        totalVideos: 3
      }
    })
    expect(result.exportDate).toBeTruthy()
    expect(new Date(result.exportDate)).toBeInstanceOf(Date)
  })
  
  it('should handle database initialization error', async () => {
    const mockDBManager = {
      init: vi.fn().mockResolvedValue(undefined),
      getDB: vi.fn().mockReturnValue(null)
    }
    
    vi.mocked(DBManager).mockImplementation(() => mockDBManager as any)
    
    await expect(exportMylistData()).rejects.toThrow('Database not initialized')
  })
  
  it('should handle database transaction error', async () => {
    const mockDB = {
      transaction: vi.fn().mockImplementation(() => {
        throw new Error('Transaction failed')
      })
    }
    
    const mockDBManager = {
      init: vi.fn().mockResolvedValue(undefined),
      getDB: vi.fn().mockReturnValue(mockDB)
    }
    
    vi.mocked(DBManager).mockImplementation(() => mockDBManager as any)
    
    await expect(exportMylistData()).rejects.toThrow('Transaction failed')
  })
})

describe('Validate Backup Data Tests', () => {
  it('should validate correct backup data', () => {
    expect(validateBackupData(validBackupData)).toBe(true)
  })
  
  it('should reject null or undefined data', () => {
    expect(validateBackupData(null)).toBe(false)
    expect(validateBackupData(undefined)).toBe(false)
  })
  
  it('should reject non-object data', () => {
    expect(validateBackupData('string')).toBe(false)
    expect(validateBackupData(123)).toBe(false)
    expect(validateBackupData([])).toBe(false)
  })
  
  it('should reject data missing required fields', () => {
    // version がない
    const noVersion = { ...validBackupData }
    delete (noVersion as any).version
    expect(validateBackupData(noVersion)).toBe(false)
    
    // exportDate がない
    const noExportDate = { ...validBackupData }
    delete (noExportDate as any).exportDate
    expect(validateBackupData(noExportDate)).toBe(false)
    
    // mylists がない
    const noMylists = { ...validBackupData }
    delete (noMylists as any).mylists
    expect(validateBackupData(noMylists)).toBe(false)
    
    // mylistVideos がない
    const noMylistVideos = { ...validBackupData }
    delete (noMylistVideos as any).mylistVideos
    expect(validateBackupData(noMylistVideos)).toBe(false)
    
    // metadata がない
    const noMetadata = { ...validBackupData }
    delete (noMetadata as any).metadata
    expect(validateBackupData(noMetadata)).toBe(false)
  })
  
  it('should reject data with wrong field types', () => {
    // version が文字列でない
    expect(validateBackupData({
      ...validBackupData,
      version: 123
    })).toBe(false)
    
    // mylists が配列でない
    expect(validateBackupData({
      ...validBackupData,
      mylists: 'not-array'
    })).toBe(false)
    
    // mylistVideos が配列でない
    expect(validateBackupData({
      ...validBackupData,
      mylistVideos: {}
    })).toBe(false)
  })
  
  it('should reject malformed mylist objects', () => {
    expect(validateBackupData({
      ...validBackupData,
      mylists: [
        { id: 123, name: 'invalid' } // id が文字列でない
      ]
    })).toBe(false)
    
    expect(validateBackupData({
      ...validBackupData,
      mylists: [
        { id: 'valid-id' } // name がない
      ]
    })).toBe(false)
  })
  
  it('should reject malformed mylist video objects', () => {
    expect(validateBackupData({
      ...validBackupData,
      mylistVideos: [
        { mylistId: 123, videoId: 'sm12345' } // mylistId が文字列でない
      ]
    })).toBe(false)
    
    expect(validateBackupData({
      ...validBackupData,
      mylistVideos: [
        { mylistId: 'test-id' } // videoId がない
      ]
    })).toBe(false)
  })
})

describe('Download Backup Data Tests', () => {
  it('should create download link correctly', () => {
    downloadBackupData(validBackupData)
    
    expect(mockCreateElement).toHaveBeenCalledWith('a')
    expect(mockCreateObjectURL).toHaveBeenCalledWith(expect.any(Object))
    expect(mockClick).toHaveBeenCalled()
    // mockCreateObjectURLの戻り値が正しく使用されているか確認
    expect(mockCreateObjectURL).toHaveReturnedWith('blob:mock-url')
    expect(mockRevokeObjectURL).toHaveBeenCalledWith('blob:mock-url')
  })
  
  it('should generate filename with timestamp', () => {
    downloadBackupData(validBackupData)
    
    // mockCreateElementが呼ばれて、返されたオブジェクトを取得
    const mockLinkElement = mockCreateElement.mock.results[0].value
    
    expect(mockLinkElement.href).toBe('blob:mock-url')
    expect(mockLinkElement.download).toMatch(/^nico-ranking-backup-\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}\.json$/)
  })
})

describe('Import Mylist Data Tests', () => {
  it('should import mylist data successfully', async () => {
    const mockDB = {
      transaction: vi.fn().mockReturnValue({
        objectStore: vi.fn(() => ({
          put: vi.fn().mockResolvedValue(undefined)
        })),
        done: Promise.resolve()
      })
    }
    
    const mockDBManager = {
      init: vi.fn().mockResolvedValue(undefined),
      getDB: vi.fn().mockReturnValue(mockDB)
    }
    
    vi.mocked(DBManager).mockImplementation(() => mockDBManager as any)
    
    const result = await importMylistData(validBackupData)
    
    expect(result.success).toBe(true)
    expect(result.imported.mylists).toBe(2)
    expect(result.imported.videos).toBe(3)
    expect(result.errors).toHaveLength(0)
  })
  
  it('should handle partial import with errors', async () => {
    const mockObjectStore = vi.fn((storeName) => ({
      put: vi.fn().mockImplementation((data) => {
        if (storeName === 'mylists' && data.id === 'test-mylist-2') {
          throw new Error('Failed to put mylist')
        }
        if (storeName === 'mylistVideos' && data.videoId === 'sm67890') {
          throw new Error('Failed to put video')
        }
        return Promise.resolve()
      })
    }))
    
    const mockDB = {
      transaction: vi.fn().mockReturnValue({
        objectStore: mockObjectStore,
        done: Promise.resolve()
      })
    }
    
    const mockDBManager = {
      init: vi.fn().mockResolvedValue(undefined),
      getDB: vi.fn().mockReturnValue(mockDB)
    }
    
    vi.mocked(DBManager).mockImplementation(() => mockDBManager as any)
    
    const result = await importMylistData(validBackupData)
    
    expect(result.success).toBe(false)
    expect(result.imported.mylists).toBe(1) // 1つだけ成功
    expect(result.imported.videos).toBe(2)   // 2つだけ成功
    expect(result.errors).toHaveLength(2)
    expect(result.errors[0]).toContain('テストマイリスト2')
    expect(result.errors[1]).toContain('動画関連データ')
  })
  
  it('should handle database initialization error during import', async () => {
    const mockDBManager = {
      init: vi.fn().mockResolvedValue(undefined),
      getDB: vi.fn().mockReturnValue(null)
    }
    
    vi.mocked(DBManager).mockImplementation(() => mockDBManager as any)
    
    const result = await importMylistData(validBackupData)
    
    expect(result.success).toBe(false)
    expect(result.imported.mylists).toBe(0)
    expect(result.imported.videos).toBe(0)
    expect(result.errors).toHaveLength(1)
    expect(result.errors[0]).toContain('Database not initialized')
  })
  
  it('should handle complete import failure', async () => {
    const mockDBManager = {
      init: vi.fn().mockRejectedValue(new Error('DB init failed')),
      getDB: vi.fn()
    }
    
    vi.mocked(DBManager).mockImplementation(() => mockDBManager as any)
    
    const result = await importMylistData(validBackupData)
    
    expect(result.success).toBe(false)
    expect(result.imported.mylists).toBe(0)
    expect(result.imported.videos).toBe(0)
    expect(result.errors).toHaveLength(1)
    expect(result.errors[0]).toContain('DB init failed')
  })
})

describe('Read Backup File Tests', () => {
  it('should read valid backup file successfully', async () => {
    const mockFile = new File([''], 'backup.json', { type: 'application/json' })
    
    // FileReader のモック結果を設定
    const originalFileReader = global.FileReader
    Object.defineProperty(global, 'FileReader', {
      value: class MockFileReader {
        onload: ((event: any) => void) | null = null
        onerror: ((event: any) => void) | null = null
        
        readAsText(file: File) {
          setTimeout(() => {
            if (this.onload) {
              this.onload({
                target: { result: JSON.stringify(validBackupData) }
              })
            }
          }, 0)
        }
      },
      writable: true
    })
    
    const result = await readBackupFile(mockFile)
    
    expect(result).toEqual(validBackupData)
    
    // 元のFileReaderを復元
    Object.defineProperty(global, 'FileReader', {
      value: originalFileReader,
      writable: true
    })
  })
  
  it('should reject invalid JSON file', async () => {
    const mockFile = new File([''], 'backup.json', { type: 'application/json' })
    
    const originalFileReader = global.FileReader
    Object.defineProperty(global, 'FileReader', {
      value: class MockFileReader {
        onload: ((event: any) => void) | null = null
        onerror: ((event: any) => void) | null = null
        
        readAsText(file: File) {
          setTimeout(() => {
            if (this.onload) {
              this.onload({
                target: { result: 'invalid json' }
              })
            }
          }, 0)
        }
      },
      writable: true
    })
    
    await expect(readBackupFile(mockFile)).rejects.toThrow('ファイルの読み込みに失敗しました')
    
    Object.defineProperty(global, 'FileReader', {
      value: originalFileReader,
      writable: true
    })
  })
  
  it('should reject invalid backup data format', async () => {
    const mockFile = new File([''], 'backup.json', { type: 'application/json' })
    
    const originalFileReader = global.FileReader
    Object.defineProperty(global, 'FileReader', {
      value: class MockFileReader {
        onload: ((event: any) => void) | null = null
        onerror: ((event: any) => void) | null = null
        
        readAsText(file: File) {
          setTimeout(() => {
            if (this.onload) {
              this.onload({
                target: { result: JSON.stringify({ invalid: 'data' }) }
              })
            }
          }, 0)
        }
      },
      writable: true
    })
    
    await expect(readBackupFile(mockFile)).rejects.toThrow('無効なファイル形式です')
    
    Object.defineProperty(global, 'FileReader', {
      value: originalFileReader,
      writable: true
    })
  })
  
  it('should handle file read error', async () => {
    const mockFile = new File([''], 'backup.json', { type: 'application/json' })
    
    const originalFileReader = global.FileReader
    Object.defineProperty(global, 'FileReader', {
      value: class MockFileReader {
        onload: ((event: any) => void) | null = null
        onerror: ((event: any) => void) | null = null
        
        readAsText(file: File) {
          setTimeout(() => {
            if (this.onerror) {
              this.onerror({})
            }
          }, 0)
        }
      },
      writable: true
    })
    
    await expect(readBackupFile(mockFile)).rejects.toThrow('ファイルの読み込みに失敗しました')
    
    Object.defineProperty(global, 'FileReader', {
      value: originalFileReader,
      writable: true
    })
  })
})