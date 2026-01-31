import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { POST } from '@/app/api/admin/video-info/route'
import { NextRequest } from 'next/server'

global.fetch = vi.fn()

describe('Admin Video Info API', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    process.env.CLOUDFLARE_ACCOUNT_ID = 'test-account-id'
    process.env.CLOUDFLARE_KV_NAMESPACE_ID = 'test-namespace-id'
    process.env.CLOUDFLARE_API_TOKEN = 'test-api-token'
  })

  afterEach(() => {
    delete process.env.CLOUDFLARE_ACCOUNT_ID
    delete process.env.CLOUDFLARE_KV_NAMESPACE_ID
    delete process.env.CLOUDFLARE_API_TOKEN
  })

  it('should return cached entries and placeholders for missing IDs', async () => {
    const mockMap = {
      sm123: { title: 'テスト動画', authorName: '投稿者ID: 1', isDeleted: false }
    }

    vi.mocked(global.fetch).mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => mockMap
    } as Response)

    const request = new NextRequest('http://localhost/api/admin/video-info', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: 'Bearer valid-token'
      },
      body: JSON.stringify({ videoIds: ['sm123', 'sm456'] })
    })

    const response = await POST(request)
    const data = await response.json()

    expect(response.status).toBe(200)
    expect(data.videos.sm123.title).toBe('テスト動画')
    expect(data.videos.sm456.title).toBe('情報未取得')
    expect(data.videos.sm456.isDeleted).toBe(false)
  })
})
