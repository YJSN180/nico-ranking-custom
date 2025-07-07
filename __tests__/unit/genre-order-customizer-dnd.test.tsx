import React from 'react'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { GenreOrderCustomizerDnD } from '@/components/genre-order-customizer-dnd'
import { vi } from 'vitest'

// Mock the useGenreOrder hook
vi.mock('@/hooks/use-genre-order', () => ({
  useGenreOrder: () => ({
    order: ['vocaloid', 'game', 'entertainment'],
    hidden: new Set(['other']),
    updateOrder: vi.fn(),
    toggleGenreVisibility: vi.fn(),
    resetToDefault: vi.fn()
  })
}))

// Mock the GENRE_LABELS
vi.mock('@/types/ranking-config', () => ({
  GENRE_LABELS: {
    vocaloid: 'ボーカロイド',
    game: 'ゲーム',
    entertainment: 'エンターテイメント',
    other: 'その他'
  }
}))

describe('GenreOrderCustomizerDnD', () => {
  it('表示されたジャンルが正しく表示される', () => {
    render(<GenreOrderCustomizerDnD />)
    
    expect(screen.getByText('ボーカロイド')).toBeInTheDocument()
    expect(screen.getByText('ゲーム')).toBeInTheDocument()
    expect(screen.getByText('エンターテイメント')).toBeInTheDocument()
    expect(screen.getByText('その他')).toBeInTheDocument()
  })

  it('非表示のジャンルは異なるスタイルで表示される', () => {
    render(<GenreOrderCustomizerDnD />)
    
    const otherGenre = screen.getByText('その他').closest('div')
    expect(otherGenre).toHaveClass('genreItemHidden')
  })

  it('適用ボタンは変更がない場合表示されない', () => {
    render(<GenreOrderCustomizerDnD />)
    
    expect(screen.queryByText('適用')).not.toBeInTheDocument()
    expect(screen.queryByText('キャンセル')).not.toBeInTheDocument()
  })

  it('表示/非表示ボタンをクリックすると変更が検知される', async () => {
    const onChangesUpdate = vi.fn()
    render(<GenreOrderCustomizerDnD onChangesUpdate={onChangesUpdate} />)
    
    // ボーカロイドの表示/非表示ボタンをクリック
    const visibilityButtons = screen.getAllByTitle(/表示する|非表示にする/)
    fireEvent.click(visibilityButtons[0])
    
    await waitFor(() => {
      expect(onChangesUpdate).toHaveBeenCalledWith(true)
    })
    
    // 適用ボタンが表示される
    expect(screen.getByText('適用')).toBeInTheDocument()
    expect(screen.getByText('キャンセル')).toBeInTheDocument()
  })

  it('デフォルトに戻すボタンが機能する', () => {
    const useGenreOrderMock = vi.fn(() => ({
      order: ['vocaloid', 'game', 'entertainment'],
      hidden: new Set(['other']),
      updateOrder: vi.fn(),
      toggleGenreVisibility: vi.fn(),
      resetToDefault: vi.fn()
    }))
    
    vi.mock('@/hooks/use-genre-order', () => ({
      useGenreOrder: useGenreOrderMock
    }))
    
    render(<GenreOrderCustomizerDnD />)
    
    const resetButton = screen.getByText('デフォルトに戻す')
    fireEvent.click(resetButton)
    
    const hookResult = useGenreOrderMock()
    expect(hookResult.resetToDefault).toHaveBeenCalled()
  })
})