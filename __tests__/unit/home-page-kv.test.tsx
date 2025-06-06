import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render } from '@testing-library/react'
import Home from '@/app/page'
import { kv } from '@vercel/kv'
import { scrapeRankingPage } from '@/lib/scraper'

// Mock Vercel KV
vi.mock('@vercel/kv', () => ({
  kv: {
    get: vi.fn(),
    set: vi.fn(),
  },
}))

// Mock scraper
vi.mock('@/lib/scraper')

describe.skip('Homepage with direct KV access', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('should display real ranking data from direct KV access', async () => {
    const mockRealData = [
      {
        rank: 1,
        id: 'sm45026928',
        title: '【Farthest Frontier】領主のお姉さん実況 39【街づくり】',
        thumbURL: 'https://nicovideo.cdn.nimg.jp/thumbnails/45026928/45026928.66686887',
        views: 15672
      }
    ]

    // Mock KV to return real data
    vi.mocked(kv.get).mockImplementation(async (key) => {
      if (key === 'ranking-all-24h') return { items: mockRealData, popularTags: [] }
      return null
    })
    
    const { findByText } = render(await Home({ searchParams: {} }))
    
    // Should display the real title
    const title = await findByText('【Farthest Frontier】領主のお姉さん実況 39【街づくり】')
    expect(title).toBeDefined()
    
    // Should display view count in the format used by RankingItem component
    const views = await findByText(/15,672/)
    expect(views).toBeDefined()
  })

  it('should fall back to scraping when KV fails', async () => {
    const mockScrapedData = [
      {
        rank: 1,
        id: 'sm12345',
        title: 'Scraped Video',
        thumbURL: 'https://example.com/thumb.jpg',
        views: 1000
      }
    ]

    // Mock KV to fail
    vi.mocked(kv.get).mockRejectedValueOnce(new Error('KV Error'))
    
    // Mock scraper fallback
    vi.mocked(scrapeRankingPage).mockResolvedValueOnce({
      items: mockScrapedData,
      popularTags: [],
    })
    
    const { findByText } = render(await Home({ searchParams: {} }))
    
    // Should display scraped data
    const title = await findByText('Scraped Video')
    expect(title).toBeDefined()
  })

  it('should fall back to scraping when KV returns string data', async () => {
    const mockScrapedData = [
      {
        rank: 1,
        id: 'sm45026928',
        title: 'Scraped Video from String Fallback',
        thumbURL: 'https://example.com/thumb.jpg',
        views: 5000
      }
    ]

    // Mock KV to return string (which is not handled by the page)
    vi.mocked(kv.get).mockResolvedValueOnce(JSON.stringify({ items: mockScrapedData, popularTags: [] }))
    
    // Mock scraper to return data when KV string is not handled
    vi.mocked(scrapeRankingPage).mockResolvedValueOnce({
      items: mockScrapedData,
      popularTags: [],
    })
    
    const { findByText } = render(await Home({ searchParams: {} }))
    
    // Should display scraped data
    const title = await findByText('Scraped Video from String Fallback')
    expect(title).toBeDefined()
    
    const views = await findByText(/5,000/)
    expect(views).toBeDefined()
  })
})