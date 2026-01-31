import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { NextRequest } from 'next/server'
import { POST } from '@/app/api/admin/ng-list/derived/bulk/route'

global.fetch = vi.fn()

describe('Derived NG List Bulk API', () => {
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

  it('should reject unauthorized requests', async () => {
    const request = new NextRequest('http://localhost/api/admin/ng-list/derived/bulk', {
      method: 'POST',
      body: JSON.stringify({ videoIds: ['sm1'] })
    })

    const response = await POST(request)
    expect(response.status).toBe(401)
  })

  it('should delete multiple IDs and return results', async () => {
    vi.mocked(global.fetch)
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ['sm1', 'sm2', 'sm3']
      } as Response)
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({})
      } as Response)

    const request = new NextRequest('http://localhost/api/admin/ng-list/derived/bulk', {
      method: 'POST',
      headers: { authorization: 'Bearer valid-token' },
      body: JSON.stringify({ videoIds: ['sm1', 'sm4'] })
    })

    const response = await POST(request)
    const data = await response.json()

    expect(response.status).toBe(200)
    expect(data.removed).toEqual(['sm1'])
    expect(data.failed).toEqual(['sm4'])
    expect(data.remainingCount).toBe(2)
  })
})
