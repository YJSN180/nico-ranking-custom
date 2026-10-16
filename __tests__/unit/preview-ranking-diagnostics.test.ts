// @vitest-environment node
import { stderr } from 'node:process'
import { afterEach, expect, it, vi } from 'vitest'
import { reportPreviewRankingFailure } from '@/lib/preview-ranking-diagnostics'

afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllEnvs()
})

it('records only bounded diagnostic fields, never error messages or response data', () => {
  vi.stubEnv('VERCEL_ENV', 'preview')
  const write = vi.spyOn(stderr, 'write').mockReturnValue(true)
  const error = new TypeError('fixture-secret URL and response', {
    cause: { code: 'ECONNRESET', message: 'fixture-secret' },
  })
  reportPreviewRankingFailure(error, {
    stage: 'request',
    upstream: 'public',
    status: 403,
    elapsedMs: 10,
  })
  const output = String(write.mock.calls[0][0])
  expect(output).toContain('"status":403')
  expect(output).toContain('"networkCode":"ECONNRESET"')
  expect(output).not.toContain('fixture-secret')
})

it('can diagnose a preview build even when its runtime environment marker is absent', () => {
  vi.stubEnv('VERCEL_ENV', undefined)
  vi.stubEnv('NEXT_PUBLIC_SENTRY_ENVIRONMENT', 'preview')
  const write = vi.spyOn(stderr, 'write').mockReturnValue(true)
  reportPreviewRankingFailure(undefined, {
    stage: 'filter',
    upstream: 'deployment',
    receivedItems: 10,
    filteredItems: 0,
    elapsedMs: 20,
  })
  expect(write).toHaveBeenCalledWith(
    expect.stringContaining('"runtimePreview":false'),
  )
})

it.each(['production', 'development', undefined])(
  'does not emit diagnostics outside preview (%s)',
  (environment) => {
    vi.stubEnv('VERCEL_ENV', environment)
    vi.stubEnv('NEXT_PUBLIC_SENTRY_ENVIRONMENT', environment)
    const write = vi.spyOn(stderr, 'write').mockReturnValue(true)
    reportPreviewRankingFailure(new Error('private'), {
      stage: 'request',
      upstream: 'public',
      elapsedMs: 0,
    })
    expect(write).not.toHaveBeenCalled()
  },
)
