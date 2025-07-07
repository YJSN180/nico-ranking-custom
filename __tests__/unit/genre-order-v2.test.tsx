import React from 'react'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { GenreOrderCustomizer } from '@/components/genre-order'
import { vi } from 'vitest'
import type { RankingGenre } from '@/types/ranking-config'

// Mock the hook
vi.mock('@/hooks/use-genre-order-v2', () => ({
  useGenreOrderV2: () => ({
    items: [
      { id: 'all' as RankingGenre, isVisible: true, order: 0 },
      { id: 'game' as RankingGenre, isVisible: true, order: 1 },
      { id: 'anime' as RankingGenre, isVisible: false, order: 2 },
      { id: 'vocaloid' as RankingGenre, isVisible: true, order: 3 },
    ],
    visibleGenres: ['all', 'game', 'vocaloid'] as RankingGenre[],
    hiddenGenres: ['anime'] as RankingGenre[],
    hasChanges: false,
    swapItems: vi.fn(),
    toggleVisibility: vi.fn(),
    resetToDefault: vi.fn(),
    applyChanges: vi.fn(),
    cancelChanges: vi.fn()
  })
}))

// Mock GENRE_LABELS
vi.mock('@/types/ranking-config', () => ({
  GENRE_LABELS: {
    all: '総合',
    game: 'ゲーム',
    anime: 'アニメ',
    vocaloid: 'ボカロ'
  }
}))

describe('GenreOrderCustomizer v2', () => {
  it('renders all genres correctly', () => {
    render(<GenreOrderCustomizer />)
    
    expect(screen.getByText('総合')).toBeInTheDocument()
    expect(screen.getByText('ゲーム')).toBeInTheDocument()
    expect(screen.getByText('アニメ')).toBeInTheDocument()
    expect(screen.getByText('ボカロ')).toBeInTheDocument()
  })

  it('applies different styles to hidden genres', () => {
    render(<GenreOrderCustomizer />)
    
    const animeItem = screen.getByText('アニメ').closest('div[draggable]')
    // CSS modulesはクラス名を変換するため、クラス名の部分一致で確認
    expect(animeItem?.className).toMatch(/hidden/)
    
    const gameItem = screen.getByText('ゲーム').closest('div[draggable]')
    expect(gameItem?.className).not.toMatch(/hidden/)
  })

  it('renders visibility toggle buttons', () => {
    render(<GenreOrderCustomizer />)
    
    const visibilityButtons = screen.getAllByRole('button', { name: /表示する|非表示にする/ })
    expect(visibilityButtons.length).toBe(4)
  })

  it('renders the default reset button', () => {
    render(<GenreOrderCustomizer />)
    
    expect(screen.getByText('デフォルトに戻す')).toBeInTheDocument()
  })

  it('does not show apply/cancel buttons when there are no changes', () => {
    render(<GenreOrderCustomizer />)
    
    expect(screen.queryByText('適用')).not.toBeInTheDocument()
    expect(screen.queryByText('キャンセル')).not.toBeInTheDocument()
  })

  it('calls onChangesUpdate when mounted', () => {
    const onChangesUpdate = vi.fn()
    render(<GenreOrderCustomizer onChangesUpdate={onChangesUpdate} />)
    
    expect(onChangesUpdate).toHaveBeenCalledWith(false)
  })
})

describe('GenreOrderCustomizer v2 - Drag and Drop', () => {
  it('sets draggable attribute on all items', () => {
    render(<GenreOrderCustomizer />)
    
    const items = screen.getAllByText(/総合|ゲーム|アニメ|ボカロ/)
      .map(el => el.closest('div[draggable]'))
    
    items.forEach(item => {
      expect(item).toHaveAttribute('draggable', 'true')
    })
  })

  it('has data-genre attribute on draggable items', () => {
    render(<GenreOrderCustomizer />)
    
    const gameItem = screen.getByText('ゲーム').closest('div[draggable]')
    expect(gameItem).toHaveAttribute('data-genre', 'game')
  })
})