import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
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

// MylistManager のモック
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

// DBManager のモック
const mockDBManager = {
  init: vi.fn(),
  getDB: vi.fn()
}

// Storage operations のモック
vi.mock('../../app/mylists/utils/storage-operations', () => ({
  initializeStorage: vi.fn().mockResolvedValue({
    dbManager: mockDBManager,
    mylistManager: mockMylistManager
  }),
  getStorageInfo: vi.fn().mockResolvedValue({
    used: 1024 * 1024,
    quota: 100 * 1024 * 1024
  })
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
    render(<MylistsClient />)
    
    await waitFor(() => {
      expect(screen.getByLabelText('並び替え:')).toBeInTheDocument()
    })
    
    const sortSelect = screen.getByDisplayValue('更新日（新しい順）')
    expect(sortSelect).toBeInTheDocument()
  })

  it('並び替えオプションがすべて存在する', async () => {
    render(<MylistsClient />)
    
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
    render(<MylistsClient />)
    
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
    render(<MylistsClient />)
    
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
    
    render(<MylistsClient />)
    
    await waitFor(() => {
      expect(mockMylistManager.getMylistSortConfig).toHaveBeenCalled()
    })
    
    await waitFor(() => {
      expect(mockMylistManager.getAllMylists).toHaveBeenCalledWith('name-asc')
    })
  })

  describe('ドラッグ&ドロップ機能', () => {
    it('カスタム順モードでマイリストカードがドラッグ可能になる', async () => {
      const user = userEvent.setup()
      render(<MylistsClient />)
      
      await waitFor(() => {
        expect(screen.getByLabelText('並び替え:')).toBeInTheDocument()
      })
      
      // カスタム順に変更
      const sortSelect = screen.getByLabelText('並び替え:')
      await user.selectOptions(sortSelect, 'custom')
      
      await waitFor(() => {
        const mylistCards = screen.getAllByText(/マイリスト/)
        const firstCard = mylistCards[0].closest('[draggable]')
        expect(firstCard).toHaveAttribute('draggable', 'true')
      })
    })

    it('通常モードではマイリストカードがドラッグ不可', async () => {
      render(<MylistsClient />)
      
      await waitFor(() => {
        const mylistCards = screen.getAllByText(/マイリスト/)
        if (mylistCards.length > 0) {
          const firstCard = mylistCards[0].closest('[draggable]')
          expect(firstCard).toHaveAttribute('draggable', 'false')
        }
      })
    })

    it('ドラッグ&ドロップで順序が更新される', async () => {
      const user = userEvent.setup()
      render(<MylistsClient />)
      
      await waitFor(() => {
        expect(screen.getByLabelText('並び替え:')).toBeInTheDocument()
      })
      
      // カスタム順に変更
      const sortSelect = screen.getByLabelText('並び替え:')
      await user.selectOptions(sortSelect, 'custom')
      
      await waitFor(() => {
        const cards = screen.getAllByText(/マイリスト/)
        expect(cards.length).toBeGreaterThan(0)
      })
      
      // ドラッグ&ドロップをシミュレート
      const cards = screen.getAllByText(/マイリスト/)
      if (cards.length >= 2) {
        const sourceCard = cards[0].closest('div')
        const targetCard = cards[1].closest('div')
        
        if (sourceCard && targetCard) {
          // ドラッグ開始
          fireEvent.dragStart(sourceCard, {
            dataTransfer: {
              effectAllowed: 'move',
              setData: vi.fn()
            }
          })
          
          // ドロップ
          fireEvent.dragOver(targetCard)
          fireEvent.drop(targetCard, {
            dataTransfer: {
              dropEffect: 'move',
              getData: vi.fn()
            }
          })
          
          // ドラッグ終了
          fireEvent.dragEnd(sourceCard)
          
          await waitFor(() => {
            expect(mockMylistManager.updateMultipleMylistOrders).toHaveBeenCalled()
          })
        }
      }
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