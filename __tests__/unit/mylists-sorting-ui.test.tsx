import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MylistsClient } from '@/app/mylists/mylists-client'
import type { Mylist } from '@/lib/storage/types'

const {
  mockMylistManager,
  mockDBManager,
  initializeStorageMock,
  getStorageInfoMock
} = vi.hoisted(() => ({
  mockMylistManager: {
    getAllMylists: vi.fn(),
    getMylistSortConfig: vi.fn(),
    saveMylistSortConfig: vi.fn(),
    updateMultipleMylistOrders: vi.fn(),
    getOrCreateDefaultMylist: vi.fn(),
    createMylist: vi.fn(),
    updateMylist: vi.fn(),
    deleteMylist: vi.fn()
  },
  mockDBManager: {
    init: vi.fn(),
    getDB: vi.fn()
  },
  initializeStorageMock: vi.fn(),
  getStorageInfoMock: vi.fn()
}))

// Next.js のルーターをモック
vi.mock('next/navigation', () => ({
  useRouter: () => ({
    push: vi.fn(),
    back: vi.fn(),
    forward: vi.fn(),
    refresh: vi.fn(),
    replace: vi.fn(),
    prefetch: vi.fn(),
  }),
  useParams: () => ({}),
  useSearchParams: () => new URLSearchParams(),
  usePathname: () => '/mylists'
}))

// Dynamic import のモック
vi.mock('next/dynamic', () => ({
  default: () => () => null
}))

// Storage operations のモック
vi.mock('../../app/mylists/utils/storage-operations', () => ({
  initializeStorage: initializeStorageMock,
  getStorageInfo: getStorageInfoMock
}))

describe('マイリスト並び替えUI', () => {
  const mockMylists: Mylist[] = [
    {
      id: 'mylist-1',
      name: 'アニメマイリスト',
      description: 'アニメ関連の動画',
      createdAt: 1704067200000,
      updatedAt: 1709251200000,
      videoCount: 15
    },
    {
      id: 'mylist-2',
      name: '音楽マイリスト', 
      description: '好きな音楽',
      createdAt: 1706745600000,
      updatedAt: 1711929600000,
      videoCount: 8
    },
    {
      id: 'mylist-3',
      name: 'ゲーム実況',
      description: '',
      createdAt: 1698796800000,
      updatedAt: 1706745600000,
      videoCount: 25
    }
  ]

  beforeEach(() => {
    vi.clearAllMocks()

    mockMylistManager.getAllMylists.mockResolvedValue(mockMylists)
    mockMylistManager.getMylistSortConfig.mockResolvedValue({
      order: 'updatedAt-desc',
      lastUpdated: Date.now()
    })
    mockMylistManager.saveMylistSortConfig.mockResolvedValue(undefined)
    mockMylistManager.getOrCreateDefaultMylist.mockResolvedValue(mockMylists[0])
    initializeStorageMock.mockResolvedValue({
      dbManager: mockDBManager,
      mylistManager: mockMylistManager
    })
    getStorageInfoMock.mockResolvedValue({
      used: 1024 * 1024,
      quota: 100 * 1024 * 1024
    })
    delete (window as Partial<typeof window> & { __TEST_ENV__?: boolean }).__TEST_ENV__
  })

  it('初期状態で並び替えセレクタが表示される', async () => {
    render(<MylistsClient />)
    
    await waitFor(() => {
      expect(screen.getByRole('combobox')).toHaveValue('updatedAt-desc')
    })
    
    const sortSelect = screen.getByRole('combobox')
    expect(sortSelect).toBeInTheDocument()
    expect(sortSelect).toHaveDisplayValue('更新日（新しい順）')
  })

  it('並び替えオプションがすべて存在する', async () => {
    render(<MylistsClient />)
    
    await waitFor(() => {
      const sortSelect = screen.getByRole('combobox')
      expect(sortSelect).toBeInTheDocument()
    })
    
    const sortSelect = screen.getByRole('combobox') as HTMLSelectElement
    const options = Array.from(sortSelect.options).map(option => option.text)
    
    expect(options).toEqual([
      '作成日（新しい順）',
      '作成日（古い順）',
      '更新日（新しい順）',
      '更新日（古い順）',
      '名前（昇順）',
      '名前（降順）',
      '動画数（多い順）',
      '動画数（少ない順）'
    ])
  })

  it('並び替えを変更すると設定が保存される', async () => {
    const user = userEvent.setup()
    render(<MylistsClient />)
    
    await waitFor(() => {
      expect(screen.getByRole('combobox')).toHaveValue('updatedAt-desc')
    })
    
    const sortSelect = screen.getByRole('combobox')
    
    // 名前（昇順）に変更
    await user.selectOptions(sortSelect, 'name-asc')
    
    await waitFor(() => {
      expect(mockMylistManager.saveMylistSortConfig).toHaveBeenCalledWith({
        order: 'name-asc'
      })
    })
    
    expect(mockMylistManager.getAllMylists).toHaveBeenCalledWith('name-asc')
  })

  it('保存された設定が初期化時に復元される', async () => {
    // 保存された設定をモック
    mockMylistManager.getMylistSortConfig.mockResolvedValue({
      order: 'name-asc',
      lastUpdated: Date.now()
    })
    
    render(<MylistsClient />)
    
    await waitFor(() => {
      expect(mockMylistManager.getMylistSortConfig).toHaveBeenCalled()
    })
    
    await waitFor(() => {
      expect(screen.getByRole('combobox')).toHaveValue('name-asc')
      expect(mockMylistManager.getAllMylists).toHaveBeenCalledWith('name-asc')
    })
  })


  describe('エラーハンドリング', () => {
    it('ソート設定の保存に失敗してもUIは動作する', async () => {
      const user = userEvent.setup()
      mockMylistManager.saveMylistSortConfig.mockRejectedValue(new Error('Save failed'))
      
      // コンソールエラーをモック
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
      
      render(<MylistsClient />)
      
      await waitFor(() => {
        expect(screen.getByRole('combobox')).toHaveValue('updatedAt-desc')
      })
      
      const sortSelect = screen.getByRole('combobox')
      
      // 並び替えを変更（エラーが発生）
      await user.selectOptions(sortSelect, 'name-asc')
      
      // UIは引き続き動作する
      expect(sortSelect).toHaveValue('name-asc')
      
      // エラーがログに記録される
      await waitFor(() => {
        expect(consoleSpy).toHaveBeenCalledWith('Failed to update sort order:', expect.any(Error))
      })
      
      consoleSpy.mockRestore()
    })

    it('マイリスト読み込みに失敗してもUIは動作する', async () => {
      mockMylistManager.getAllMylists.mockRejectedValue(new Error('Load failed'))
      
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
      
      render(<MylistsClient />)
      
      await waitFor(() => {
        expect(screen.getByRole('combobox')).toBeInTheDocument()
      })
      
      // エラーがログに記録される
      await waitFor(() => {
        expect(consoleSpy).toHaveBeenCalledWith('Failed to load mylists:', expect.any(Error))
      })
      
      consoleSpy.mockRestore()
    })
  })
})
