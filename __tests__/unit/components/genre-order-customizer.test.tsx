import React from 'react'
import { render, screen, fireEvent } from '@testing-library/react'
import { vi } from 'vitest'
import { GenreOrderCustomizer } from '@/components/genre-order-customizer'
import { useGenreOrder } from '@/hooks/use-genre-order'
import type { RankingGenre } from '@/types/ranking-config'

// useGenreOrderフックをモック
vi.mock('@/hooks/use-genre-order')

describe('GenreOrderCustomizer', () => {
  const mockUpdateOrder = vi.fn()
  const mockToggleGenreVisibility = vi.fn()
  const mockMoveGenreUp = vi.fn()
  const mockMoveGenreDown = vi.fn()
  const mockResetToDefault = vi.fn()

  beforeEach(() => {
    vi.clearAllMocks()
    
    vi.mocked(useGenreOrder).mockReturnValue({
      order: ['all', 'game', 'anime', 'vocaloid'] as RankingGenre[],
      hidden: new Set(['technology'] as RankingGenre[]),
      visibleGenres: ['all', 'game', 'anime', 'vocaloid'] as RankingGenre[],
      updateOrder: mockUpdateOrder,
      toggleGenreVisibility: mockToggleGenreVisibility,
      moveGenreUp: mockMoveGenreUp,
      moveGenreDown: mockMoveGenreDown,
      resetToDefault: mockResetToDefault,
      importOrder: vi.fn(),
      exportOrder: vi.fn()
    })
  })

  it('すべてのジャンルを表示する', () => {
    render(<GenreOrderCustomizer />)
    
    expect(screen.getByText('総合')).toBeInTheDocument()
    expect(screen.getByText('ゲーム')).toBeInTheDocument()
    expect(screen.getByText('アニメ')).toBeInTheDocument()
    expect(screen.getByText('ボカロ')).toBeInTheDocument()
  })

  it('非表示のジャンルは異なるスタイルで表示される', () => {
    vi.mocked(useGenreOrder).mockReturnValue({
      order: ['all', 'game', 'anime', 'vocaloid', 'technology'] as RankingGenre[],
      hidden: new Set(['technology'] as RankingGenre[]),
      visibleGenres: ['all', 'game', 'anime', 'vocaloid'] as RankingGenre[],
      updateOrder: mockUpdateOrder,
      toggleGenreVisibility: mockToggleGenreVisibility,
      moveGenreUp: mockMoveGenreUp,
      moveGenreDown: mockMoveGenreDown,
      resetToDefault: mockResetToDefault,
      importOrder: vi.fn(),
      exportOrder: vi.fn()
    })

    render(<GenreOrderCustomizer />)
    
    // 技術・工作のテキストを含む要素の親divを2階層上まで探す
    const technologyText = screen.getByText('技術・工作')
    const technologyItem = technologyText.closest('div')?.parentElement
    // Check that the style attribute contains opacity
    const style = technologyItem?.getAttribute('style') || ''
    expect(style).toContain('opacity: 0.6')
  })

  it('表示/非表示ボタンをクリックするとトグルされる', () => {
    render(<GenreOrderCustomizer />)
    
    const toggleButtons = screen.getAllByTitle(/表示する|非表示にする/)
    fireEvent.click(toggleButtons[0])
    
    expect(mockToggleGenreVisibility).toHaveBeenCalledWith('all')
  })

  it('上移動ボタンをクリックするとジャンルが上に移動する', () => {
    render(<GenreOrderCustomizer />)
    
    const upButtons = screen.getAllByText('↑')
    // 2番目のジャンル（game）の上ボタンをクリック
    fireEvent.click(upButtons[1])
    
    expect(mockMoveGenreUp).toHaveBeenCalledWith('game')
  })

  it('下移動ボタンをクリックするとジャンルが下に移動する', () => {
    render(<GenreOrderCustomizer />)
    
    const downButtons = screen.getAllByText('↓')
    // 最初のジャンル（all）の下ボタンをクリック
    fireEvent.click(downButtons[0])
    
    expect(mockMoveGenreDown).toHaveBeenCalledWith('all')
  })

  it('最初のジャンルの上移動ボタンは無効化される', () => {
    render(<GenreOrderCustomizer />)
    
    const upButtons = screen.getAllByText('↑')
    expect(upButtons[0]).toBeDisabled()
  })

  it('最後のジャンルの下移動ボタンは無効化される', () => {
    render(<GenreOrderCustomizer />)
    
    const downButtons = screen.getAllByText('↓')
    // 最後の表示ジャンル（vocaloid）の下ボタン
    expect(downButtons[3]).toBeDisabled()
  })

  it('デフォルトに戻すボタンをクリックするとリセットされる', () => {
    render(<GenreOrderCustomizer />)
    
    const resetButton = screen.getByText('デフォルトに戻す')
    fireEvent.click(resetButton)
    
    expect(mockResetToDefault).toHaveBeenCalled()
  })

  it('非表示のジャンルには移動ボタンが表示されない', () => {
    vi.mocked(useGenreOrder).mockReturnValue({
      order: ['all', 'game', 'anime', 'technology'] as RankingGenre[],
      hidden: new Set(['technology'] as RankingGenre[]),
      visibleGenres: ['all', 'game', 'anime'] as RankingGenre[],
      updateOrder: mockUpdateOrder,
      toggleGenreVisibility: mockToggleGenreVisibility,
      moveGenreUp: mockMoveGenreUp,
      moveGenreDown: mockMoveGenreDown,
      resetToDefault: mockResetToDefault,
      importOrder: vi.fn(),
      exportOrder: vi.fn()
    })

    render(<GenreOrderCustomizer />)
    
    const technologyItem = screen.getByText('技術・工作').closest('div')
    const buttons = technologyItem?.querySelectorAll('button')
    
    // 表示/非表示ボタンのみで、上下ボタンはない
    expect(buttons).toHaveLength(1)
  })

  it('ヘルプメッセージが表示される', () => {
    render(<GenreOrderCustomizer />)
    
    expect(screen.getByText('設定データは「設定データ保存」タブから保存・復元できます。')).toBeInTheDocument()
    expect(screen.getByText(/💡 ヒント:/)).toBeInTheDocument()
    expect(screen.getByText(/👁️ アイコンをクリックして表示\/非表示を切り替え/)).toBeInTheDocument()
    expect(screen.getByText(/↑↓ ボタンで順序を変更/)).toBeInTheDocument()
  })
})