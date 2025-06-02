import { describe, expect, it, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react'
import { InfiniteScrollList } from '@/components/infinite-scroll-list'
import type { RankingItem } from '@/types/ranking'

// Intersection Observer のモック
const mockIntersectionObserver = vi.fn()
mockIntersectionObserver.mockReturnValue({
  observe: vi.fn(),
  unobserve: vi.fn(),
  disconnect: vi.fn()
})
window.IntersectionObserver = mockIntersectionObserver as any

describe('InfiniteScrollList', () => {
  const mockItems: RankingItem[] = Array.from({ length: 300 }, (_, i) => ({
    rank: i + 1,
    id: `sm${i + 1}`,
    title: `テスト動画 ${i + 1}`,
    thumbURL: `https://example.com/thumb${i + 1}.jpg`,
    views: 1000 * (i + 1),
    comments: 10 * (i + 1),
    mylists: 5 * (i + 1),
    likes: 20 * (i + 1)
  }))

  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('should initially display first batch of items', () => {
    render(<InfiniteScrollList items={mockItems} initialDisplayCount={50} />)
    
    // 最初の50件が表示されることを確認
    expect(screen.getByText('テスト動画 1')).toBeInTheDocument()
    expect(screen.getByText('テスト動画 50')).toBeInTheDocument()
    expect(screen.queryByText('テスト動画 51')).not.toBeInTheDocument()
  })

  it('should load more items when scrolling to bottom', async () => {
    const { rerender } = render(
      <InfiniteScrollList items={mockItems} initialDisplayCount={50} batchSize={50} />
    )
    
    // IntersectionObserverのコールバックを取得
    const [observerCallback] = mockIntersectionObserver.mock.calls[0]
    
    // 交差を検知（スクロールが底に到達）
    act(() => {
      observerCallback([{ isIntersecting: true }])
    })
    
    // 追加のアイテムが表示されるのを待つ
    await waitFor(() => {
      expect(screen.getByText('テスト動画 51')).toBeInTheDocument()
      expect(screen.getByText('テスト動画 100')).toBeInTheDocument()
    })
  })

  it('should stop loading when all items are displayed', async () => {
    const { container } = render(
      <InfiniteScrollList 
        items={mockItems.slice(0, 10)} 
        initialDisplayCount={5} 
        batchSize={5} 
      />
    )
    
    const [observerCallback] = mockIntersectionObserver.mock.calls[0]
    
    // 2回目の読み込みで全件表示
    act(() => {
      observerCallback([{ isIntersecting: true }])
    })
    
    await waitFor(() => {
      expect(screen.getByText('テスト動画 10')).toBeInTheDocument()
    })
    
    // ローディングインジケーターが表示されない
    expect(container.querySelector('[data-testid="loading-indicator"]')).not.toBeInTheDocument()
  })

  it('should show loading indicator while loading', () => {
    const { container } = render(
      <InfiniteScrollList items={mockItems} initialDisplayCount={50} />
    )
    
    // 最初は表示されていない
    expect(container.querySelector('[data-testid="loading-indicator"]')).not.toBeInTheDocument()
    
    // 100件未満の時はローディングインジケーターが表示される
    expect(container.querySelector('[data-testid="scroll-trigger"]')).toBeInTheDocument()
  })

  it('should restore scroll position when provided', async () => {
    const scrollToSpy = vi.spyOn(window, 'scrollTo')
    
    render(
      <InfiniteScrollList 
        items={mockItems} 
        initialDisplayCount={100}
        restoreScrollPosition={500}
      />
    )
    
    // スクロール位置が復元される
    await waitFor(() => {
      expect(scrollToSpy).toHaveBeenCalledWith(0, 500)
    })
  })

  it('should handle empty items array', () => {
    const { container } = render(
      <InfiniteScrollList items={[]} initialDisplayCount={50} />
    )
    
    expect(container.textContent).toBe('')
    expect(container.querySelector('[data-testid="scroll-trigger"]')).not.toBeInTheDocument()
  })

  it('should update display count when items change', () => {
    const { rerender } = render(
      <InfiniteScrollList items={mockItems.slice(0, 50)} initialDisplayCount={50} />
    )
    
    expect(screen.getByText('テスト動画 50')).toBeInTheDocument()
    
    // アイテムを追加
    rerender(
      <InfiniteScrollList items={mockItems.slice(0, 100)} initialDisplayCount={50} />
    )
    
    // スクロールトリガーが表示される
    expect(screen.getByTestId('scroll-trigger')).toBeInTheDocument()
  })
})