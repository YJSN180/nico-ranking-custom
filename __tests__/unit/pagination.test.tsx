import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { Pagination } from '@/components/pagination'

// Next.js のルーター機能をモック
vi.mock('next/navigation', () => ({
  useRouter: () => ({
    push: vi.fn(),
  }),
  useSearchParams: () => new URLSearchParams(),
}))

describe('Pagination Component', () => {
  it('should not render when totalPages <= 1', () => {
    const { container } = render(
      <Pagination 
        currentPage={1}
        totalItems={50}
        itemsPerPage={100}
      />
    )
    expect(container.firstChild).toBeNull()
  })

  it('should render pagination when totalItems > itemsPerPage', () => {
    render(
      <Pagination 
        currentPage={1}
        totalItems={250}
        itemsPerPage={100}
      />
    )
    
    // ページ番号ボタンが表示される
    expect(screen.getByText('1')).toBeInTheDocument()
    expect(screen.getByText('2')).toBeInTheDocument()
    expect(screen.getByText('3')).toBeInTheDocument()
  })

  it('should show current page info for top position', () => {
    render(
      <Pagination 
        currentPage={2}
        totalItems={300}
        itemsPerPage={100}
        position="top"
      />
    )
    
    expect(screen.getByText('全300件中 101-200位を表示中')).toBeInTheDocument()
  })

  it('should show current page info for bottom position', () => {
    render(
      <Pagination 
        currentPage={3}
        totalItems={250}
        itemsPerPage={100}
        position="bottom"
      />
    )
    
    expect(screen.getByText('201-250位 / 全250件')).toBeInTheDocument()
  })

  it('should disable previous button on first page', () => {
    render(
      <Pagination 
        currentPage={1}
        totalItems={300}
        itemsPerPage={100}
      />
    )
    
    const prevButton = screen.getByText('< 前へ')
    expect(prevButton).toHaveStyle({ cursor: 'not-allowed' })
  })

  it('should disable next button on last page', () => {
    render(
      <Pagination 
        currentPage={3}
        totalItems={300}
        itemsPerPage={100}
      />
    )
    
    const nextButton = screen.getByText('次へ >')
    expect(nextButton).toHaveStyle({ cursor: 'not-allowed' })
  })
})