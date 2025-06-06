import { describe, expect, it, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import '@testing-library/jest-dom'
import ClientPage from '@/app/client-page'
import type { RankingItem } from '@/types/ranking'

// モック
vi.mock('@/components/ranking-selector', () => ({
  RankingSelector: vi.fn(() => null)
}))

vi.mock('@/components/tag-selector', () => ({
  TagSelector: vi.fn(() => null)
}))

vi.mock('@/components/ranking-item', () => ({
  default: vi.fn(({ item }: { item: RankingItem }) => 
    <div data-testid="ranking-item">{item.title}</div>
  )
}))

vi.mock('@/hooks/use-realtime-stats', () => ({
  useRealtimeStats: vi.fn((data) => ({
    items: data,
    isLoading: false,
    lastUpdated: null
  }))
}))

describe('Load More Button', () => {
  const mockItems: RankingItem[] = Array.from({ length: 250 }, (_, i) => ({
    rank: i + 1,
    id: `sm${i + 1}`,
    title: `テスト動画 ${i + 1}`,
    thumbURL: `https://example.com/thumb${i + 1}.jpg`,
    views: 1000 * (i + 1)
  }))

  it('should initially display 100 items', () => {
    render(<ClientPage initialData={mockItems} />)
    
    const items = screen.getAllByTestId('ranking-item')
    expect(items).toHaveLength(100)
  })

  it('should show load more button when more items available', () => {
    render(<ClientPage initialData={mockItems} />)
    
    const button = screen.getByText(/もっと見る/)
    expect(button).toBeInTheDocument()
    expect(button).toHaveTextContent('もっと見る')
  })

  it('should load 100 more items when button clicked', () => {
    render(<ClientPage initialData={mockItems} />)
    
    const button = screen.getByText(/もっと見る/)
    fireEvent.click(button)
    
    const items = screen.getAllByTestId('ranking-item')
    expect(items).toHaveLength(200)
    
    // ボタンは引き続き表示される
    expect(button).toHaveTextContent('もっと見る')
  })

  it('should load remaining items on final click', () => {
    render(<ClientPage initialData={mockItems} />)
    
    const button = screen.getByText(/もっと見る/)
    
    // 2回クリック
    fireEvent.click(button) // 200件
    fireEvent.click(button) // 250件（全件）
    
    const items = screen.getAllByTestId('ranking-item')
    expect(items).toHaveLength(250)
    
    // ボタンはまだ表示される（300件まで取得可能なため）
    expect(screen.queryByText(/もっと見る/)).toBeInTheDocument()
  })

  it('should show button when items are less than 100', () => {
    const fewItems = mockItems.slice(0, 50)
    render(<ClientPage initialData={fewItems} />)
    
    // 50件しかないが、さらに読み込み可能なのでボタンは表示される
    expect(screen.queryByText(/もっと見る/)).toBeInTheDocument()
  })

  it('should reset display count when config changes', async () => {
    const { rerender } = render(
      <ClientPage initialData={mockItems} initialGenre="all" />
    )
    
    // 200件まで表示
    fireEvent.click(screen.getByText(/もっと見る/))
    expect(screen.getAllByTestId('ranking-item')).toHaveLength(200)
    
    // ジャンルを変更（新しいデータ）
    const newItems = mockItems.map(item => ({ ...item, title: `新動画 ${item.rank}` }))
    rerender(<ClientPage initialData={newItems} initialGenre="game" />)
    
    // 100件にリセットされる
    const items = screen.getAllByTestId('ranking-item')
    expect(items).toHaveLength(100)
  })
})