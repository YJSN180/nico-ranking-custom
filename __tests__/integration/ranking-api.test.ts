import { describe, it, expect, vi, beforeEach } from 'vitest'
import { GET } from '@/app/api/ranking/route'
import { kv } from '@vercel/kv'

vi.mock('@vercel/kv', () => ({
  kv: {
    get: vi.fn(),
  },
}))

describe('Ranking API Integration', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('should return 200 with ranking data when KV has data', async () => {
    const mockData = [
      {
        rank: 1,
        id: 'sm123',
        title: 'Test Video 1',
        thumbURL: 'https://example.com/thumb1.jpg',
        views: 10000,
      },
      {
        rank: 2,
        id: 'sm456',
        title: 'Test Video 2',
        thumbURL: 'https://example.com/thumb2.jpg',
        views: 5000,
      },
    ]

    vi.mocked(kv.get).mockResolvedValueOnce(JSON.stringify(mockData))

    const request = new Request('http://localhost:3000/api/ranking')
    const response = await GET(request)

    expect(response.status).toBe(200)
    expect(response.headers.get('Content-Type')).toBe('application/json')
    expect(response.headers.get('Cache-Control')).toBe(
      's-maxage=30, stale-while-revalidate=30'
    )

    const data = await response.json()
    expect(data).toEqual(mockData)
  })

  it('should return 502 when KV has no data', async () => {
    vi.mocked(kv.get).mockResolvedValueOnce(null)

    const request = new Request('http://localhost:3000/api/ranking')
    const response = await GET(request)

    expect(response.status).toBe(502)
    
    const data = await response.json()
    expect(data.error).toBe('No ranking data available')
  })

  it('should return 502 when KV returns invalid JSON', async () => {
    vi.mocked(kv.get).mockResolvedValueOnce('invalid json')

    const request = new Request('http://localhost:3000/api/ranking')
    const response = await GET(request)

    expect(response.status).toBe(502)
    
    const data = await response.json()
    expect(data.error).toBe('Invalid ranking data')
  })

  it('should handle KV errors gracefully', async () => {
    vi.mocked(kv.get).mockRejectedValueOnce(new Error('KV error'))

    const request = new Request('http://localhost:3000/api/ranking')
    const response = await GET(request)

    expect(response.status).toBe(502)
    
    const data = await response.json()
    expect(data.error).toBe('Failed to fetch ranking data')
  })
})