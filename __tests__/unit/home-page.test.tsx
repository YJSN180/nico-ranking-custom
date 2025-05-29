import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import Home from '@/app/page'
import { scrapeRankingPage } from '@/lib/scraper'
import { kv } from '@vercel/kv'

// Mock dependencies
vi.mock('@/lib/scraper')
vi.mock('@vercel/kv', () => ({
  kv: {
    get: vi.fn(),
    set: vi.fn(),
  },
}))

describe('Home Page', () => {
  it('should render ranking items correctly', async () => {
    const mockData = [
      {
        rank: 1,
        id: 'sm123',
        title: 'First Video',
        thumbURL: 'https://nicovideo.cdn.nimg.jp/thumbnails/123/123.jpg',
        views: 100000,
        comments: 100,
        mylists: 50,
        likes: 200,
      },
      {
        rank: 2,
        id: 'sm456',
        title: 'Second Video',
        thumbURL: 'https://nicovideo.cdn.nimg.jp/thumbnails/456/456.jpg',
        views: 50000,
        comments: 50,
        mylists: 25,
        likes: 100,
      },
    ]

    // Mock KV to return null (no cache)
    vi.mocked(kv.get).mockResolvedValue(null)
    
    // Mock scraper to return data
    vi.mocked(scrapeRankingPage).mockResolvedValueOnce({
      items: mockData,
      popularTags: [],
    })

    const Component = await Home({ searchParams: {} })
    render(Component)

    expect(screen.getByText('1')).toBeInTheDocument()
    expect(screen.getByText('First Video')).toBeInTheDocument()
    expect(screen.getByText('100,000 回再生')).toBeInTheDocument()

    expect(screen.getByText('2')).toBeInTheDocument()
    expect(screen.getByText('Second Video')).toBeInTheDocument()
    expect(screen.getByText('50,000 回再生')).toBeInTheDocument()

    const firstLink = screen.getByRole('link', { name: /First Video/i })
    expect(firstLink).toHaveAttribute('href', 'https://www.nicovideo.jp/watch/sm123')
    expect(firstLink).toHaveAttribute('target', '_blank')
    expect(firstLink).toHaveAttribute('rel', 'noopener noreferrer')
  })

  it('should render mock data when scraping fails', async () => {
    // Mock KV to return null
    vi.mocked(kv.get).mockResolvedValue(null)
    
    // Mock scraper to throw error
    vi.mocked(scrapeRankingPage).mockRejectedValueOnce(new Error('Scraping failed'))

    const Component = await Home({ searchParams: {} })
    render(Component)

    // Should display mock data
    expect(screen.getByText('【初音ミク】テストソング【オリジナル】')).toBeInTheDocument()
    expect(screen.getByText('150,000 回再生')).toBeInTheDocument()
  })

  it('should render empty state when no data', async () => {
    // Mock KV to return null
    vi.mocked(kv.get).mockResolvedValue(null)
    
    // Mock scraper to return empty array
    vi.mocked(scrapeRankingPage).mockResolvedValueOnce({
      items: [],
      popularTags: [],
    })

    const Component = await Home({ searchParams: {} })
    render(Component)

    expect(screen.getByText('ランキングデータがありません')).toBeInTheDocument()
  })
})