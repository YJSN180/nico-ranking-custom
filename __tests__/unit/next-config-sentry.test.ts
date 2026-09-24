// @vitest-environment node
import { afterEach, describe, expect, it, vi } from 'vitest'

vi.mock('@sentry/nextjs', () => ({
  withSentryConfig: (config: unknown) => config,
}))

vi.mock('@next/bundle-analyzer', () => ({
  default: () => (config: unknown) => config,
}))

type HeaderRule = { source: string; headers: Array<{ key: string; value: string }> }
type NextConfigLike = {
  env?: Record<string, string | undefined>
  headers: () => Promise<HeaderRule[]>
}

async function loadNextConfig(vars: Record<string, string | undefined>): Promise<NextConfigLike> {
  vi.stubEnv('NEXT_PUBLIC_SENTRY_ENVIRONMENT', undefined)
  vi.stubEnv('VERCEL_ENV', undefined)
  for (const [key, value] of Object.entries(vars)) {
    vi.stubEnv(key, value)
  }
  vi.resetModules()
  const configModule = await import('../../next.config.mjs')
  return configModule.default as NextConfigLike
}

async function connectSrc(config: NextConfigLike): Promise<string[]> {
  const rules = await config.headers()
  const csp = rules
    .flatMap((rule) => rule.headers)
    .find((header) => header.key === 'Content-Security-Policy')?.value
  const directive = csp?.split(';').map((part) => part.trim()).find((part) => part.startsWith('connect-src'))
  return directive?.split(/\s+/).slice(1) ?? []
}

describe('next.config.mjs Sentry settings', () => {
  afterEach(() => {
    vi.unstubAllEnvs()
  })

  it.each(['development', 'production'])('allows both Sentry ingest hosts in connect-src (%s)', async (nodeEnv) => {
    const config = await loadNextConfig({ NODE_ENV: nodeEnv })
    const sources = await connectSrc(config)

    expect(sources).toContain('https://*.ingest.sentry.io')
    expect(sources).toContain('https://*.ingest.us.sentry.io')
  })

  it.each([
    [{ VERCEL_ENV: 'production' }, 'production'],
    [{ VERCEL_ENV: 'preview' }, 'preview'],
    [{}, 'local'],
    [{ NODE_ENV: 'production' }, 'local'],
    [{ NEXT_PUBLIC_SENTRY_ENVIRONMENT: 'staging', VERCEL_ENV: 'preview' }, 'staging'],
  ])('embeds the Sentry environment at build time: %o -> %s', async (vars, expected) => {
    const config = await loadNextConfig(vars)

    expect(config.env?.NEXT_PUBLIC_SENTRY_ENVIRONMENT).toBe(expected)
  })
})
