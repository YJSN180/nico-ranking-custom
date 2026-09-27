import { afterEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'
import { POST } from '@/app/api/debug-log/route'

function buildLogRequest(): NextRequest {
  return new NextRequest('http://localhost/api/debug-log', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      level: 'error',
      message: 'written by anyone',
      data: { note: 'arbitrary payload' },
      timestamp: '2026-09-27T00:00:00.000Z',
    }),
  })
}

describe('POST /api/debug-log', () => {
  afterEach(() => {
    vi.unstubAllEnvs()
  })

  it('returns 404 in production builds without writing to the server logs', async () => {
    vi.stubEnv('NODE_ENV', 'production')

    const response = await POST(buildLogRequest())

    expect(response.status).toBe(404)
    expect(console.error).not.toHaveBeenCalled()
    expect(console.warn).not.toHaveBeenCalled()
    expect(console.log).not.toHaveBeenCalled()
  })

  it('relays client logs to the terminal during development', async () => {
    vi.stubEnv('NODE_ENV', 'development')

    const response = await POST(buildLogRequest())

    expect(response.status).toBe(200)
    expect(console.error).toHaveBeenCalledWith(
      expect.stringContaining('written by anyone'),
      expect.any(String),
    )
  })
})
