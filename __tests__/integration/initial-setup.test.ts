import { describe, it, expect, vi } from 'vitest'
import { GET } from '@/app/api/ranking/route'
import { kv } from '@vercel/kv'

vi.mock('@vercel/kv', () => ({
  kv: {
    get: vi.fn(),
  },
}))

describe('Initial Setup Experience', () => {
  it('should provide helpful error message when no data exists', async () => {
    vi.mocked(kv.get).mockResolvedValueOnce(null)

    const request = new Request('http://localhost:3000/api/ranking')
    const response = await GET(request)

    expect(response.status).toBe(502)
    
    const data = await response.json()
    expect(data.error).toBe('No ranking data available')
    expect(data.message).toBe('データが準備されるまでお待ちください。通常、毎日12時に更新されます。')
  })

  it('should include retry-after header when no data', async () => {
    vi.mocked(kv.get).mockResolvedValueOnce(null)

    const request = new Request('http://localhost:3000/api/ranking')
    const response = await GET(request)

    expect(response.headers.get('Retry-After')).toBe('300') // 5 minutes
  })
})