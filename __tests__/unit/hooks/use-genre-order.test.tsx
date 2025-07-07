import { act, renderHook } from '@testing-library/react'
import { useGenreOrder } from '@/hooks/use-genre-order'
import type { RankingGenre } from '@/types/ranking-config'

// モック localStorage
const localStorageMock = (() => {
  let store: Record<string, string> = {}
  return {
    getItem: (key: string) => store[key] || null,
    setItem: (key: string, value: string) => {
      store[key] = value
    },
    removeItem: (key: string) => {
      delete store[key]
    },
    clear: () => {
      store = {}
    }
  }
})()

Object.defineProperty(window, 'localStorage', {
  value: localStorageMock
})

describe('useGenreOrder', () => {
  beforeEach(() => {
    localStorageMock.clear()
  })

  it('初期状態でデフォルトの順序を返す', () => {
    const { result } = renderHook(() => useGenreOrder())
    
    expect(result.current.order).toHaveLength(23)
    expect(result.current.order[0]).toBe('all')
    expect(result.current.hidden.size).toBe(0)
    expect(result.current.visibleGenres).toHaveLength(23)
  })

  it('LocalStorageから保存された順序を読み込む', () => {
    const savedData = {
      order: ['game', 'anime', 'all'],
      hidden: ['vocaloid'],
      version: 1,
      updatedAt: new Date().toISOString()
    }
    localStorageMock.setItem('genre-order', JSON.stringify(savedData))

    const { result } = renderHook(() => useGenreOrder())
    
    expect(result.current.order).toEqual(['game', 'anime', 'all'])
    expect(result.current.hidden.has('vocaloid' as RankingGenre)).toBe(true)
    expect(result.current.visibleGenres).toEqual(['game', 'anime', 'all'])
  })

  it('ジャンルの順序を更新できる', () => {
    const { result } = renderHook(() => useGenreOrder())
    
    const newOrder: RankingGenre[] = ['anime', 'game', 'all']
    act(() => {
      result.current.updateOrder(newOrder)
    })

    expect(result.current.order).toEqual(newOrder)
    
    // LocalStorageに保存されているか確認
    const saved = JSON.parse(localStorageMock.getItem('genre-order') || '{}')
    expect(saved.order).toEqual(newOrder)
  })

  it('ジャンルの表示/非表示を切り替えられる', () => {
    const { result } = renderHook(() => useGenreOrder())
    
    // ジャンルを非表示にする
    act(() => {
      result.current.toggleGenreVisibility('vocaloid')
    })

    expect(result.current.hidden.has('vocaloid')).toBe(true)
    expect(result.current.visibleGenres).not.toContain('vocaloid')

    // 再度トグルして表示に戻す
    act(() => {
      result.current.toggleGenreVisibility('vocaloid')
    })

    expect(result.current.hidden.has('vocaloid')).toBe(false)
    expect(result.current.visibleGenres).toContain('vocaloid')
  })

  it('ジャンルを上に移動できる', () => {
    const { result } = renderHook(() => useGenreOrder())
    
    // 初期状態: ['all', 'game', 'anime', ...]
    act(() => {
      result.current.moveGenreUp('game')
    })

    expect(result.current.order[0]).toBe('game')
    expect(result.current.order[1]).toBe('all')
  })

  it('ジャンルを下に移動できる', () => {
    const { result } = renderHook(() => useGenreOrder())
    
    // 初期状態: ['all', 'game', 'anime', ...]
    act(() => {
      result.current.moveGenreDown('all')
    })

    expect(result.current.order[0]).toBe('game')
    expect(result.current.order[1]).toBe('all')
  })

  it('最初のジャンルは上に移動できない', () => {
    const { result } = renderHook(() => useGenreOrder())
    
    const initialOrder = [...result.current.order]
    act(() => {
      result.current.moveGenreUp('all')
    })

    expect(result.current.order).toEqual(initialOrder)
  })

  it('最後のジャンルは下に移動できない', () => {
    const { result } = renderHook(() => useGenreOrder())
    
    const lastGenre = result.current.order[result.current.order.length - 1]
    const initialOrder = [...result.current.order]
    
    act(() => {
      result.current.moveGenreDown(lastGenre)
    })

    expect(result.current.order).toEqual(initialOrder)
  })

  it('デフォルトにリセットできる', () => {
    const { result } = renderHook(() => useGenreOrder())
    
    // カスタマイズする
    act(() => {
      result.current.updateOrder(['game', 'anime', 'all'])
      result.current.toggleGenreVisibility('vocaloid')
    })

    // リセット
    act(() => {
      result.current.resetToDefault()
    })

    expect(result.current.order[0]).toBe('all')
    expect(result.current.hidden.size).toBe(0)
    expect(result.current.order).toHaveLength(23)
  })

  it('データをエクスポートできる', () => {
    const { result } = renderHook(() => useGenreOrder())
    
    // カスタマイズする
    act(() => {
      result.current.updateOrder(['game', 'anime', 'all'])
      result.current.toggleGenreVisibility('vocaloid')
    })

    const exported = result.current.exportOrder()
    
    expect(exported.order).toEqual(['game', 'anime', 'all'])
    expect(exported.hidden).toContain('vocaloid')
  })

  it('データをインポートできる', () => {
    const { result } = renderHook(() => useGenreOrder())
    
    const importData = {
      order: ['music', 'sing', 'dance'] as RankingGenre[],
      hidden: ['technology', 'society'] as RankingGenre[]
    }

    act(() => {
      result.current.importOrder(importData)
    })

    expect(result.current.order).toEqual(importData.order)
    expect(result.current.hidden.has('technology')).toBe(true)
    expect(result.current.hidden.has('society')).toBe(true)
  })

  it('非表示にしたジャンルはorderから削除される', () => {
    const { result } = renderHook(() => useGenreOrder())
    
    act(() => {
      result.current.toggleGenreVisibility('game')
    })

    expect(result.current.order).not.toContain('game')
    expect(result.current.visibleGenres).not.toContain('game')
  })

  it('表示に戻したジャンルはorderの最後に追加される', () => {
    const { result } = renderHook(() => useGenreOrder())
    
    // 非表示にする
    act(() => {
      result.current.toggleGenreVisibility('game')
    })

    // 表示に戻す
    act(() => {
      result.current.toggleGenreVisibility('game')
    })

    expect(result.current.order[result.current.order.length - 1]).toBe('game')
  })
})