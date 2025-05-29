import { describe, it, expect, vi, beforeEach } from 'vitest'
import { POST } from '@/app/api/cron/fetch/route'
import { kv } from '@vercel/kv'
import * as scraper from '@/lib/scraper'

vi.mock('@vercel/kv', () => ({
  kv: {
    set: vi.fn(),
  },
}))

vi.mock('@/lib/scraper', () => ({
  scrapeRankingPage: vi.fn(),
}))

describe('Cron Fetch API', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.stubEnv('CRON_SECRET', 'test-secret')
  })

  it('should reject requests without authorization', async () => {
    const request = new Request('http://localhost:3000/api/cron/fetch', {
      method: 'POST',
    })

    const response = await POST(request)
    expect(response.status).toBe(401)
    
    const data = await response.json()
    expect(data.error).toBe('Unauthorized')
  })

  it('should reject requests with invalid authorization', async () => {
    const request = new Request('http://localhost:3000/api/cron/fetch', {
      method: 'POST',
      headers: {
        'Authorization': 'Bearer wrong-secret',
      },
    })

    const response = await POST(request)
    expect(response.status).toBe(401)
  })

  it('should fetch ranking data and store in KV with correct TTL', async () => {
    const mockScraperResponse = {
      items: [
        {
          rank: 1,
          id: 'sm123',
          title: 'Test Video',
          thumbURL: 'https://example.com/thumb.jpg',
          views: 1000,
        },
      ],
      popularTags: [],
    }

    vi.mocked(scraper.scrapeRankingPage).mockResolvedValue(mockScraperResponse)
    vi.mocked(kv.set).mockResolvedValue('OK')

    const request = new Request('http://localhost:3000/api/cron/fetch', {
      method: 'POST',
      headers: {
        'Authorization': 'Bearer test-secret',
      },
    })

    const response = await POST(request)
    expect(response.status).toBe(200)

    const data = await response.json()
    expect(data.success).toBe(true)
    expect(data.itemsCount).toBe(1)

    expect(kv.set).toHaveBeenCalledWith(
      'ranking-data',
      expect.arrayContaining([
        expect.objectContaining({
          rank: 1,
          id: 'sm123',
          title: 'Test Video',
          thumbURL: 'https://example.com/thumb.jpg',
          views: 1000,
        })
      ]),
      { ex: 3600 }
    )
  })

  it('should handle fetch errors gracefully and fallback to mock data', async () => {
    vi.mocked(scraper.scrapeRankingPage).mockRejectedValueOnce(
      new Error('Network error')
    )
    vi.mocked(kv.set).mockResolvedValueOnce('OK')

    const request = new Request('http://localhost:3000/api/cron/fetch', {
      method: 'POST',
      headers: {
        'Authorization': 'Bearer test-secret',
      },
    })

    const response = await POST(request)
    expect(response.status).toBe(200) // モックデータで成功するように変更

    const data = await response.json()
    expect(data.success).toBe(true)
    expect(data.isMock).toBe(true)
    expect(data.itemsCount).toBe(100) // モックデータは100件
  })
})