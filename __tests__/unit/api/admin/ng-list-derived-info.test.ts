import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { GET } from '@/app/api/admin/ng-list/derived-info/route'
import { NextRequest } from 'next/server'

global.fetch = vi.fn()

describe('Derived NG Video Info API', () => {
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

  it('should return cached video info and metadata', async () => {
    const mockMap = {
      sm123: { title: 'テスト動画', authorName: '投稿者ID: 1', isDeleted: false }
    }
    const mockMeta = {
      lastRunAt: '2026-01-31T00:00:00Z',
      lastRefreshAt: '2026-01-25T00:00:00Z'
    }

    vi.mocked(global.fetch)
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => mockMap
      } as Response)
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => mockMeta
      } as Response)

    const request = new NextRequest('http://localhost/api/admin/ng-list/derived-info', {
      headers: {
        authorization: 'Bearer valid-token'
      }
    })

    const response = await GET(request)
    const data = await response.json()

    expect(response.status).toBe(200)
    expect(data.videos).toEqual(mockMap)
    expect(data.updatedAt).toBe(mockMeta.lastRunAt)
    expect(data.lastRefreshAt).toBe(mockMeta.lastRefreshAt)
  })
})
