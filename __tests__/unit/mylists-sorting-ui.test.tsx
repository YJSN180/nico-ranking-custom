import React from 'react'
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MylistsClient } from '@/app/mylists/mylists-client'
import type { Mylist, MylistSortOrder } from '@/lib/storage/types'

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
  default: (fn: any) => {
    const Component = fn().then((mod: any) => mod.default || mod)
    return (props: any) => {
      const [LoadedComponent, setLoadedComponent] = React.useState(null)
      
      React.useEffect(() => {
        Component.then(setLoadedComponent)
      }, [])
      
      if (!LoadedComponent) return null
      return React.createElement(LoadedComponent, props)
    }
  }
}))

// Storage operations のモック - vi.mockはホイストされるため、内部で変数を使わない
vi.mock('../../app/mylists/utils/storage-operations', () => ({
  initializeStorage: vi.fn().mockResolvedValue({
    dbManager: {
      init: vi.fn(),
      getDB: vi.fn()
    },
    mylistManager: {
      getAllMylists: vi.fn(),
      getMylistSortConfig: vi.fn(),
      saveMylistSortConfig: vi.fn(),
      updateMultipleMylistOrders: vi.fn(),
      getOrCreateDefaultMylist: vi.fn(),
      createMylist: vi.fn(),
      updateMylist: vi.fn(),
      deleteMylist: vi.fn()
    }
  }),
  getStorageInfo: vi.fn().mockResolvedValue({
    used: 1024 * 1024,
    quota: 100 * 1024 * 1024
  })
}))

// モックオブジェクトへの参照を保持（テスト内で使用）
const mockMylistManager = {
  getAllMylists: vi.fn(),
  getMylistSortConfig: vi.fn(),
  saveMylistSortConfig: vi.fn(),
  updateMultipleMylistOrders: vi.fn(),
  getOrCreateDefaultMylist: vi.fn(),
  createMylist: vi.fn(),
  updateMylist: vi.fn(),
  deleteMylist: vi.fn()
}

const mockDBManager = {
  init: vi.fn(),
  getDB: vi.fn()
}

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
    
    // デフォルトのモック動作を設定
    mockMylistManager.getAllMylists.mockResolvedValue(mockMylists)
    mockMylistManager.getMylistSortConfig.mockResolvedValue({
      order: 'updatedAt-desc',
      lastUpdated: Date.now()
    })
    mockMylistManager.saveMylistSortConfig.mockResolvedValue(undefined)
    mockMylistManager.getOrCreateDefaultMylist.mockResolvedValue(mockMylists[0])
    
    // テスト環境フラグを設定
    // @ts-ignore
    global.window = { __TEST_ENV__: true }
  })

  it('初期状態で並び替えセレクタが表示される', async () => {
    await act(async () => {
      render(<MylistsClient />)
    })
    
    await waitFor(() => {
      expect(screen.getByLabelText('並び替え:')).toBeInTheDocument()
    })
    
    const sortSelect = screen.getByDisplayValue('更新日（新しい順）')
    expect(sortSelect).toBeInTheDocument()
  })

  it('並び替えオプションがすべて存在する', async () => {
    await act(async () => {
      render(<MylistsClient />)
    })
    
    await waitFor(() => {
      const sortSelect = screen.getByLabelText('並び替え:')
      expect(sortSelect).toBeInTheDocument()
    })
    
    const sortSelect = screen.getByLabelText('並び替え:') as HTMLSelectElement
    const options = Array.from(sortSelect.options).map(option => option.text)
    
    expect(options).toEqual([
      '更新日（新しい順）',
      '更新日（古い順）',
      '作成日（新しい順）',
      '作成日（古い順）',
      '名前（昇順）',
      '名前（降順）',
      '動画数（多い順）',
      '動画数（少ない順）',
      'カスタム順'
    ])
  })

  it('並び替えを変更すると設定が保存される', async () => {
    const user = userEvent.setup()
    await act(async () => {
      render(<MylistsClient />)
    })
    
    await waitFor(() => {
      expect(screen.getByLabelText('並び替え:')).toBeInTheDocument()
    })
    
    const sortSelect = screen.getByLabelText('並び替え:')
    
    // 名前（昇順）に変更
    await user.selectOptions(sortSelect, 'name-asc')
    
    await waitFor(() => {
      expect(mockMylistManager.saveMylistSortConfig).toHaveBeenCalledWith({
        order: 'name-asc'
      })
    })
    
    expect(mockMylistManager.getAllMylists).toHaveBeenCalledWith('name-asc')
  })

  it('カスタム順を選択するとドラッグヒントが表示される', async () => {
    const user = userEvent.setup()
    await act(async () => {
      render(<MylistsClient />)
    })
    
    await waitFor(() => {
      expect(screen.getByLabelText('並び替え:')).toBeInTheDocument()
    })
    
    const sortSelect = screen.getByLabelText('並び替え:')
    
    // カスタム順に変更
    await user.selectOptions(sortSelect, 'custom')
    
    await waitFor(() => {
      expect(screen.getByText(/ドラッグ&ドロップでマイリストの順序を変更できます/)).toBeInTheDocument()
    })
  })

  it('保存された設定が初期化時に復元される', async () => {
    // 保存された設定をモック
    mockMylistManager.getMylistSortConfig.mockResolvedValue({
      order: 'name-asc',
      lastUpdated: Date.now()
    })
    
    await act(async () => {
      render(<MylistsClient />)
    })
    
    await waitFor(() => {
      expect(mockMylistManager.getMylistSortConfig).toHaveBeenCalled()
    })
    
    await waitFor(() => {
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
        expect(screen.getByLabelText('並び替え:')).toBeInTheDocument()
      })
      
      const sortSelect = screen.getByLabelText('並び替え:')
      
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
        expect(screen.getByLabelText('並び替え:')).toBeInTheDocument()
      })
      
      // エラーがログに記録される
      await waitFor(() => {
        expect(consoleSpy).toHaveBeenCalledWith('Failed to load mylists:', expect.any(Error))
      })
      
      consoleSpy.mockRestore()
    })
  })
})