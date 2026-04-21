import { beforeEach, describe, expect, it, vi } from 'vitest'

const captureExceptionMock = vi.fn()

vi.mock('@sentry/nextjs', () => ({
  captureException: captureExceptionMock,
  withScope: (callback: (scope: {
    setContext: (key: string, value: unknown) => void
    setExtra: (key: string, value: unknown) => void
    setFingerprint: (value: string[]) => void
    setLevel: (value: string) => void
    setTag: (key: string, value: string) => void
  }) => void) => {
    callback({
      setContext: vi.fn(),
      setExtra: vi.fn(),
      setFingerprint: vi.fn(),
      setLevel: vi.fn(),
      setTag: vi.fn(),
    })
  },
}))

describe('sentry capture helpers', () => {
  beforeEach(() => {
    vi.resetModules()
    vi.restoreAllMocks()
    captureExceptionMock.mockReset()
  })

  it('deduplicates browser rate limit captures within the same window', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-04-22T00:00:00Z'))

    const { captureBrowserRateLimit } = await import('@/lib/sentry/capture')

    captureBrowserRateLimit({
      surface: 'ranking-fetch',
      endpointFamily: '/api/ranking',
      fingerprint: ['browser-ranking-fetch-429'],
      retryAfterSeconds: 10,
    })

    captureBrowserRateLimit({
      surface: 'ranking-fetch',
      endpointFamily: '/api/ranking',
      fingerprint: ['browser-ranking-fetch-429'],
      retryAfterSeconds: 10,
    })

    expect(captureExceptionMock).toHaveBeenCalledTimes(1)

    vi.useRealTimers()
  })

  it('captures again after the dedupe window expires', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-04-22T00:00:00Z'))

    const { captureBrowserRateLimit } = await import('@/lib/sentry/capture')

    captureBrowserRateLimit({
      surface: 'ranking-fetch',
      endpointFamily: '/api/ranking',
      fingerprint: ['browser-ranking-fetch-429'],
      retryAfterSeconds: 10,
    })

    vi.advanceTimersByTime(60_001)

    captureBrowserRateLimit({
      surface: 'ranking-fetch',
      endpointFamily: '/api/ranking',
      fingerprint: ['browser-ranking-fetch-429'],
      retryAfterSeconds: 10,
    })

    expect(captureExceptionMock).toHaveBeenCalledTimes(2)

    vi.useRealTimers()
  })
})
