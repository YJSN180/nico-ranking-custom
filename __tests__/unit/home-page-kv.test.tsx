import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render } from '@testing-library/react'
import Home from '@/app/page'
import { kv } from '@vercel/kv'

// Mock Vercel KV
vi.mock('@vercel/kv', () => ({
  kv: {
    get: vi.fn(),
  },
}))

// Mock fetch
global.fetch = vi.fn()

describe('Homepage with direct KV access', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    // Mock fetch for background update check
    vi.mocked(global.fetch).mockResolvedValue({
      ok: true,
      json: async () => ({ updated: false }),
    } as Response)
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
      if (key === 'ranking-data') return mockRealData
      if (key === 'last-update-info') return {
        timestamp: new Date().toISOString(),
        itemCount: 1,
        source: 'test'
      }
      return null
    })
    
    const { findByText } = render(await Home({ searchParams: {} }))
    
    // Should display the real title
    const title = await findByText('【Farthest Frontier】領主のお姉さん実況 39【街づくり】')
    expect(title).toBeDefined()
    
    // Should display view count
    const views = await findByText('15,672 回再生')
    expect(views).toBeDefined()
  })

  it('should fall back to API when KV fails', async () => {
    const mockApiData = [
      {
        rank: 1,
        id: 'sm12345',
        title: 'API Fallback Video',
        thumbURL: 'https://example.com/thumb.jpg',
        views: 1000
      }
    ]

    // Mock KV to fail
    vi.mocked(kv.get).mockImplementation(async (key) => {
      if (key === 'last-update-info') return null
      throw new Error('KV Error')
    })
    
    // Mock API fallback
    vi.mocked(global.fetch).mockResolvedValueOnce({
      ok: true,
      json: async () => mockApiData,
    } as Response)
    
    const { findByText } = render(await Home({ searchParams: {} }))
    
    // Should display API data
    const title = await findByText('API Fallback Video')
    expect(title).toBeDefined()
  })

  it('should handle KV returning string data', async () => {
    const mockRealData = [
      {
        rank: 1,
        id: 'sm45026928',
        title: 'Test Video from String',
        thumbURL: 'https://example.com/thumb.jpg',
        views: 5000
      }
    ]

    // Mock KV to return string
    vi.mocked(kv.get).mockImplementation(async (key) => {
      if (key === 'ranking-data') return JSON.stringify(mockRealData)
      if (key === 'last-update-info') return {
        timestamp: new Date().toISOString(),
        itemCount: 1,
        source: 'test'
      }
      return null
    })
    
    const { findByText } = render(await Home({ searchParams: {} }))
    
    // Should parse and display the data
    const title = await findByText('Test Video from String')
    expect(title).toBeDefined()
    
    const views = await findByText('5,000 回再生')
    expect(views).toBeDefined()
  })
})