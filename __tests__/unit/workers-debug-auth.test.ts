import { describe, expect, it } from 'vitest'
import { hasWorkerDebugAccess } from '@/workers/utils/debug-auth'

describe('hasWorkerDebugAccess', () => {
  it('accepts bearer authorization with the worker auth key', () => {
    const request = new Request('https://nico-rank.com/api/debug', {
      headers: {
        Authorization: 'Bearer test-worker-key',
      },
    })

    expect(hasWorkerDebugAccess(request, 'test-worker-key')).toBe(true)
  })

  it('accepts X-Worker-Auth with the worker auth key', () => {
    const request = new Request('https://nico-rank.com/api/debug', {
      headers: {
        'X-Worker-Auth': 'test-worker-key',
      },
    })

    expect(hasWorkerDebugAccess(request, 'test-worker-key')).toBe(true)
  })

  it('rejects requests without a matching worker auth key', () => {
    const request = new Request('https://nico-rank.com/api/debug')

    expect(hasWorkerDebugAccess(request, 'test-worker-key')).toBe(false)
  })
})
