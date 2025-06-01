import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

// KVモック
vi.mock('@vercel/kv', () => ({
  kv: {
    set: vi.fn(),
    expire: vi.fn()
  }
}))

describe('KV Update API', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.resetModules()
  })

  it('should update KV with ranking data', async () => {
    const { kv } = await import('@vercel/kv')
    const { POST } = await import('@/app/api/kv-update/route')
    
    const mockData = {
      genre: 'game',
      items: [
        { rank: 1, id: 'sm123', title: 'Test Video', views: 1000, thumbURL: 'https://example.com/thumb.jpg' }
      ],
      popularTags: ['マインクラフト', 'ゆっくり実況'],
      scrapedAt: '2025-06-01T12:00:00Z'
    }
    
    const request = new NextRequest('http://localhost/api/kv-update', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Cron-Secret': 'test-secret'
      },
      body: JSON.stringify(mockData)
    })
    
    // 環境変数をモック
    process.env.CRON_SECRET = 'test-secret'
    
    const response = await POST(request)
    const result = await response.json()
    
    expect(response.status).toBe(200)
    expect(result).toHaveProperty('success', true)
    expect(result).toHaveProperty('genre', 'game')
    
    // KVが正しく呼ばれたか確認
    expect(kv.set).toHaveBeenCalledWith(
      'ranking-game',
      expect.objectContaining({
        items: mockData.items,
        popularTags: mockData.popularTags,
        updatedAt: expect.any(String)
      })
    )
    expect(kv.expire).toHaveBeenCalledWith('ranking-game', 3600)
  })

  it('should reject requests without proper secret', async () => {
    const { POST } = await import('@/app/api/kv-update/route')
    
    const request = new NextRequest('http://localhost/api/kv-update', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Cron-Secret': 'wrong-secret'
      },
      body: JSON.stringify({ genre: 'game', items: [] })
    })
    
    process.env.CRON_SECRET = 'correct-secret'
    
    const response = await POST(request)
    const result = await response.json()
    
    expect(response.status).toBe(401)
    expect(result).toHaveProperty('error', 'Unauthorized')
  })

  it('should validate required fields', async () => {
    const { POST } = await import('@/app/api/kv-update/route')
    
    const request = new NextRequest('http://localhost/api/kv-update', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Cron-Secret': 'test-secret'
      },
      body: JSON.stringify({ genre: 'game' }) // items missing
    })
    
    process.env.CRON_SECRET = 'test-secret'
    
    const response = await POST(request)
    const result = await response.json()
    
    expect(response.status).toBe(400)
    expect(result).toHaveProperty('error')
  })

  it('should handle KV errors gracefully', async () => {
    const { kv } = await import('@vercel/kv')
    const { POST } = await import('@/app/api/kv-update/route')
    
    // KVエラーをモック
    vi.mocked(kv.set).mockRejectedValueOnce(new Error('KV connection failed'))
    
    const request = new NextRequest('http://localhost/api/kv-update', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Cron-Secret': 'test-secret'
      },
      body: JSON.stringify({
        genre: 'game',
        items: [],
        popularTags: []
      })
    })
    
    process.env.CRON_SECRET = 'test-secret'
    
    const response = await POST(request)
    const result = await response.json()
    
    expect(response.status).toBe(500)
    expect(result).toHaveProperty('error', 'KV update failed')
  })

  it('should update multiple genres from batch request', async () => {
    const { kv } = await import('@vercel/kv')
    const { POST } = await import('@/app/api/kv-update/route')
    
    const mockBatchData = [
      {
        genre: 'game',
        items: [{ rank: 1, id: 'sm123', title: 'Game Video', views: 1000, thumbURL: '' }],
        popularTags: ['マインクラフト']
      },
      {
        genre: 'anime',
        items: [{ rank: 1, id: 'sm456', title: 'Anime Video', views: 2000, thumbURL: '' }],
        popularTags: ['2025冬アニメ']
      }
    ]
    
    const request = new NextRequest('http://localhost/api/kv-update', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Cron-Secret': 'test-secret',
        'X-Batch-Update': 'true'
      },
      body: JSON.stringify({ updates: mockBatchData })
    })
    
    process.env.CRON_SECRET = 'test-secret'
    
    const response = await POST(request)
    const result = await response.json()
    
    expect(response.status).toBe(200)
    expect(result).toHaveProperty('success', true)
    expect(result).toHaveProperty('updated', ['game', 'anime'])
    
    // 各ジャンルのKV更新を確認
    expect(kv.set).toHaveBeenCalledTimes(2)
    expect(kv.expire).toHaveBeenCalledTimes(2)
  })
})