import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import RankingItemResponsive from '../../../components/ranking-item-responsive'
import { TagDisplayProvider } from '../../../contexts/tag-display-context'
import type { RankingItem } from '../../../types/ranking'

vi.mock('../../../components/mylist-button', () => ({ MylistButton: () => <button data-testid="mylist-button">+</button> }))
vi.mock('../../../components/popover-ng-selector', () => ({ PopoverNGSelector: () => null }))
vi.mock('../../../components/optimized-image', () => ({ OptimizedImage: ({ alt }: { alt: string }) => <img alt={alt} /> }))

const base: RankingItem = {
  rank: 1,
  id: 'sm1',
  title: 'タイトル',
  thumbURL: 'https://example.com/t.jpg',
  views: 1,
  comments: 0,
  mylists: 0,
  likes: 0,
  authorId: '145428373',
  registeredAt: '2026-09-21T00:00:00Z',
}

const renderItem = (item: RankingItem) =>
  render(
    <TagDisplayProvider>
      <RankingItemResponsive item={item} flat />
    </TagDisplayProvider>
  )

describe('RankingItemResponsive の投稿者表示', () => {
  it('名前が取れていない投稿者は ID をユーザーページへのリンクで表示する', () => {
    renderItem(base)
    const link = screen.getByRole('link', { name: '145428373' })
    expect(link).toHaveAttribute('href', 'https://www.nicovideo.jp/user/145428373')
  })

  it('退会済み（authorDeleted）はリンクにせず「退会済み（ID）」と薄く表示する', () => {
    renderItem({ ...base, authorDeleted: true })
    const label = screen.getByText('退会済み（145428373）')
    expect(label).toHaveClass('ranking-item-responsive__author-name--deleted')
    expect(label.closest('a')).toBeNull()
    expect(screen.queryByRole('link', { name: '145428373' })).not.toBeInTheDocument()
  })
})
